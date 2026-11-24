export type VideoPayload = {
  url: string
  thumbnail?: string
  title?: string
}

function httpUrl(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

export function decodeVideoPayload(encoded: string): VideoPayload | null {
  try {
    const raw = decodeURIComponent(encoded).replace(/-/g, '+').replace(/_/g, '/')
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4)
    const [videoPart = '', thumbPart = '', ...titleParts] = atob(padded).split('|')
    const url = httpUrl(videoPart)
    if (!url) return null

    const thumbnail = httpUrl(thumbPart)
    const title = titleParts.join('|').trim() || undefined
    return { url, thumbnail, title }
  } catch {
    return null
  }
}
