/**
 * Limiteur de débit à jetons. La limite est exprimée en octets/seconde.
 * Plusieurs travailleurs peuvent consommer le même limiteur : le débit total
 * reste borné, sans rafale supérieure à un quart de seconde.
 */
export class RateLimiter {
  private rate: number
  private tokens: number
  private lastRefill: number
  private readonly maxBurst: number

  constructor(bytesPerSecond = 0) {
    this.rate = Math.max(0, bytesPerSecond)
    this.tokens = this.rate > 0 ? Math.max(32 * 1024, this.rate / 4) : 0
    this.lastRefill = Date.now()
    this.maxBurst = Math.max(32 * 1024, this.rate / 4)
  }

  setRate(bytesPerSecond: number): void {
    const next = Math.max(0, Math.round(bytesPerSecond))
    if (next === this.rate) return
    this.rate = next
    if (next === 0) {
      this.tokens = 0
      return
    }
    this.tokens = Math.min(this.tokens, Math.max(32 * 1024, next / 4))
  }

  getRate(): number {
    return this.rate
  }

  async acquire(bytes: number): Promise<void> {
    if (this.rate <= 0 || bytes <= 0) return
    const amount = Math.min(bytes, Math.max(32 * 1024, this.rate))
    let remaining = amount

    while (remaining > 0) {
      const now = Date.now()
      const elapsed = (now - this.lastRefill) / 1000
      this.lastRefill = now
      this.tokens = Math.min(this.maxBurst, this.tokens + elapsed * this.rate)

      if (this.tokens >= remaining) {
        this.tokens -= remaining
        return
      }

      const needed = remaining - this.tokens
      this.tokens = 0
      remaining = needed
      const waitMs = Math.max(1, Math.ceil((needed / this.rate) * 1000))
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 1000)))
    }
  }
}

export class LimiterRegistry {
  readonly global = new RateLimiter(0)
  private readonly perTask = new Map<string, RateLimiter>()

  forTask(taskId: string, bytesPerSecond: number): RateLimiter {
    let limiter = this.perTask.get(taskId)
    if (!limiter) {
      limiter = new RateLimiter(bytesPerSecond)
      this.perTask.set(taskId, limiter)
    } else {
      limiter.setRate(bytesPerSecond)
    }
    return limiter
  }

  release(taskId: string): void {
    this.perTask.delete(taskId)
  }
}
