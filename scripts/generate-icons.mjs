import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const EXT = path.resolve('extension', 'icons')
const EXT_FIREFOX = path.resolve('extension-firefox', 'icons')

// ---------- PNG minimal (RGBA, filtre 0) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- dessin ----------

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function render(size) {
  const samples = 4
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (x + (sx + 0.5) / samples) / size
          const py = (y + (sy + 0.5) / samples) / size
          const background = insideRoundedRect(px, py, 0.03, 0.03, 0.97, 0.97, 0.22)
          if (!background) continue
          const t = Math.min(1, Math.max(0, (px + py) / 2))
          let red = mix(98, 43, t)
          let green = mix(231, 183, t)
          let blue = mix(201, 154, t)
          const stem = px >= 0.455 && px <= 0.545 && py >= 0.19 && py <= 0.53
          const head = insideTriangle(px, py, 0.31, 0.47, 0.69, 0.47, 0.5, 0.71)
          const bar = px >= 0.23 && px <= 0.77 && py >= 0.75 && py <= 0.82
          const leftTick = px >= 0.23 && px <= 0.305 && py >= 0.66 && py <= 0.82
          const rightTick = px >= 0.695 && px <= 0.77 && py >= 0.66 && py <= 0.82
          if (stem || head || bar || leftTick || rightTick) {
            red = 8
            green = 34
            blue = 29
          }
          r += red
          g += green
          b += blue
          a += 255
        }
      }
      const count = samples * samples
      const index = (y * size + x) * 4
      if (a > 0) {
        rgba[index] = Math.round(r / (a / 255))
        rgba[index + 1] = Math.round(g / (a / 255))
        rgba[index + 2] = Math.round(b / (a / 255))
        rgba[index + 3] = Math.round(a / count)
      }
    }
  }
  return encodePng(size, size, rgba)
}

// Les icônes de l'application sont produites par scripts/generate-nzix-icon.py.
// Ce script ne régénère que les icônes des extensions navigateur.
mkdirSync(EXT, { recursive: true })

for (const size of [16, 32, 48, 128]) {
  writeFileSync(path.join(EXT, `${size}.png`), render(size))
  writeFileSync(path.join(EXT_FIREFOX, `${size}.png`), render(size))
}

console.log('Icônes des extensions générées dans extension/icons/ et extension-firefox/icons/.')
console.log("Icônes de l'application : python3 scripts/generate-nzix-icon.py")
