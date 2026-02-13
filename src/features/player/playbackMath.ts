export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function formatClock(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds as number)) return '--:--'
  const s = Math.max(0, Math.floor(seconds as number))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${m}:${pad2(ss)}`
}

export function seekTargetFromPct(duration: number | null, pct: number): number | null {
  if (!duration || duration <= 0) return null
  return clampRange(pct * duration, 0, duration)
}
