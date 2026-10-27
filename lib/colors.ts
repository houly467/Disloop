export const CALM_POST_COLORS = ['#607568', '#718675', '#837867', '#7a8290', '#827897', '#927764', '#667f82'] as const

export function sanitizeCalmColor(value: unknown) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return null
  const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
  const max = Math.max(...channels)
  const min = Math.min(...channels)
  let hue = 0
  let saturation = 0
  let lightness = (max + min) / 2
  const delta = max - min
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))
    if (max === channels[0]) hue = ((channels[1] - channels[2]) / delta) % 6
    else if (max === channels[1]) hue = (channels[2] - channels[0]) / delta + 2
    else hue = (channels[0] - channels[1]) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  saturation = Math.min(saturation, 0.38)
  lightness = Math.max(0.38, Math.min(lightness, 0.72))
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = lightness - chroma / 2
  const rgb = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`
}
