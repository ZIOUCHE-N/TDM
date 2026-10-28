import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  fileNameFromContentDisposition,
  fileNameFromUrl,
  isPathInside,
  sanitizeFileName,
  uniqueFilePath
} from '../src/engine/paths'

describe('chemins et noms de fichiers', () => {
  it('assainit les caractères interdits et les noms réservés Windows', () => {
    expect(sanitizeFileName('mon<fichier>:"*.zip')).toBe('mon_fichier____.zip')
    expect(sanitizeFileName('CON.txt')).toBe('CON_.txt')
    expect(sanitizeFileName('   ...   ')).toBe('telechargement')
    expect(sanitizeFileName('')).toBe('telechargement')
  })

  it('extrait un nom depuis Content-Disposition (RFC 5987 et simple)', () => {
    expect(fileNameFromContentDisposition('attachment; filename="rapport final.pdf"')).toBe(
      'rapport final.pdf'
    )
    expect(
      fileNameFromContentDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9%20%C3%A9t%C3%A9.pdf")
    ).toBe('résumé été.pdf')
    expect(fileNameFromContentDisposition(null)).toBeNull()
  })

  it('déduit un nom depuis une URL', () => {
    expect(fileNameFromUrl('https://example.com/a/b/fichier%20test.tar.gz')).toBe('fichier test.tar.gz')
    expect(fileNameFromUrl('https://example.com/')).toBeNull()
    expect(fileNameFromUrl('pas une url')).toBeNull()
  })

  it('refuse les chemins hors dossier', () => {
    expect(isPathInside('/home/u/Downloads/a.zip', '/home/u/Downloads')).toBe(true)
    expect(isPathInside('/home/u/Downloads/../secret', '/home/u/Downloads')).toBe(false)
    expect(isPathInside('/etc/passwd', '/home/u/Downloads')).toBe(false)
  })

  it('trouve un nom libre sans écraser un fichier existant', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdm-paths-'))
    try {
      await writeFile(path.join(dir, 'a.zip'), 'x')
      const first = await uniqueFilePath(dir, 'a.zip')
      expect(first).toBe(path.join(dir, 'a (1).zip'))
      await writeFile(first, 'y')
      expect(await uniqueFilePath(dir, 'a.zip')).toBe(path.join(dir, 'a (2).zip'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
