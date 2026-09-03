import { colorToCss } from '@/lib/graduation-booking-options'

export type GraduationPreviewMasks = {
  hood: Uint8ClampedArray
  tassel: Uint8ClampedArray
  toga: Uint8ClampedArray
}

type RecolorOptions = {
  hoodColor?: string
  tasselColor?: string
  togaColor?: string
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const n = parseInt(value, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rn = 0
  let gn = 0
  let bn = 0
  if (h < 60) [rn, gn, bn] = [c, x, 0]
  else if (h < 120) [rn, gn, bn] = [x, c, 0]
  else if (h < 180) [rn, gn, bn] = [0, c, x]
  else if (h < 240) [rn, gn, bn] = [0, x, c]
  else if (h < 300) [rn, gn, bn] = [x, 0, c]
  else [rn, gn, bn] = [c, 0, x]
  return [Math.round((rn + m) * 255), Math.round((gn + m) * 255), Math.round((bn + m) * 255)]
}

function solidTargetRgb(name: string): [number, number, number] {
  return hexToRgb(colorToCss(name))
}

function hoodTargetRgb(name: string, nx: number): [number, number, number] {
  const parts = name.split(/\s+and\s+/i)
  if (parts.length >= 2) {
    const part = nx < 0.5 ? parts[0].trim() : parts[1].trim()
    return hexToRgb(colorToCss(part))
  }
  return hexToRgb(colorToCss(name))
}

function isAchromaticTarget(tr: number, tg: number, tb: number): boolean {
  const [, ts] = rgbToHsl(tr, tg, tb)
  return ts < 0.15
}

/** Face + mouth oval — always original, never any color. */
function inFaceZone(x: number, y: number, w: number, h: number): boolean {
  const nx = x / w
  const ny = y / h
  return ((nx - 0.5) / 0.33) ** 2 + ((ny - 0.29) / 0.275) ** 2 < 1
}

/** Restore cap top from source after recolor. */
function inCapExclusion(x: number, y: number, w: number, h: number): boolean {
  const nx = x / w
  const ny = y / h
  return ny < 0.22 || (ny < 0.28 && nx < 0.28)
}

function shouldRestoreOriginal(
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return inCapExclusion(x, y, w, h) || inFaceZone(x, y, w, h)
}

function isLikelySkin(r: number, g: number, b: number): boolean {
  const [h, s, l] = rgbToHsl(r, g, b)
  const warmSkin =
    h >= 5 &&
    h <= 52 &&
    s < 0.55 &&
    l >= 0.22 &&
    l <= 0.93 &&
    r >= g - 8 &&
    r - g < 75
  // Lips / mouth — warm red-orange, not magenta fabric
  const warmLip =
    h <= 28 &&
    s >= 0.18 &&
    s < 0.7 &&
    l >= 0.32 &&
    r > g + 20 &&
    g >= b - 20 &&
    r - b > 35
  return warmSkin || warmLip
}

/** Only recolor the magenta graduation fabric — never warm skin (hue ~18–22). */
function isLikelyPinkFabric(r: number, g: number, b: number): boolean {
  if (isLikelySkin(r, g, b)) return false
  const [h, s, l] = rgbToHsl(r, g, b)
  const magentaHue = h >= 298 || h <= 12
  if (!magentaHue) return false
  if (s < 0.18 || l < 0.16 || l > 0.95) return false
  if (b < g - 12 || r <= g + 10) return false
  return true
}

/** Recolor fabric while keeping folds/shadows (preserve lightness). */
function recolorFabric(
  sr: number,
  sg: number,
  sb: number,
  tr: number,
  tg: number,
  tb: number,
): [number, number, number] {
  const [, , l] = rgbToHsl(sr, sg, sb)
  const [th, ts, tl] = rgbToHsl(tr, tg, tb)

  // Black / white / gray: map luminance only — never inject hue
  if (isAchromaticTarget(tr, tg, tb)) {
    const mixedL = Math.min(0.94, Math.max(0.04, l * 0.42 + tl * 0.58))
    if (ts < 0.04) {
      // True black hood/tassel — cap at dark grey, not washed-out mid-grey
      const v = Math.round(Math.min(mixedL, 0.22) * 255)
      return [v, v, v]
    }
    return [
      Math.round(tr * mixedL + sr * (1 - mixedL) * 0.15),
      Math.round(tg * mixedL + sg * (1 - mixedL) * 0.15),
      Math.round(tb * mixedL + sb * (1 - mixedL) * 0.15),
    ]
  }

  // Keep source shading, but pull lightness toward target so dark pink
  // fully reads as the selected color (e.g. Dark Blue) instead of muddy.
  const mixedL = Math.min(0.92, Math.max(0.08, l * 0.55 + tl * 0.45))
  const sat = Math.min(1, Math.max(ts, 0.62))
  return hslToRgb(th, sat, mixedL)
}

function applyMaskedRecolor(
  output: Uint8ClampedArray,
  source: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  colorForPixel: (nx: number) => [number, number, number],
  skipPixel?: (x: number, y: number) => boolean,
  options?: { solidInside?: boolean },
) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skipPixel?.(x, y)) continue

      const pi = y * width + x
      const alpha = mask[pi] / 255
      if (alpha < 0.04) continue

      const i = pi * 4
      const sr = source[i]
      const sg = source[i + 1]
      const sb = source[i + 2]

      if (isLikelySkin(sr, sg, sb)) continue

      const nx = x / width
      const [tr, tg, tb] = colorForPixel(nx)
      const [nr, ng, nb] = recolorFabric(sr, sg, sb, tr, tg, tb)

      // Tassel needs full solid coverage inside mask
      const a = options?.solidInside
        ? alpha >= 0.12
          ? 1
          : Math.min(1, alpha * 4)
        : alpha >= 0.22
          ? 1
          : Math.min(1, alpha * 3.2)
      output[i] = Math.round(sr * (1 - a) + nr * a)
      output[i + 1] = Math.round(sg * (1 - a) + ng * a)
      output[i + 2] = Math.round(sb * (1 - a) + nb * a)
    }
  }
}

/** Recolor the dark gown fabric using its baked mask (green only; black = as-is). */
function applyTogaRecolor(
  output: Uint8ClampedArray,
  original: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  togaColor?: string,
) {
  // Model already wears a black gown — only the green option needs recoloring.
  if (togaColor !== 'Plain Green Toga') return

  applyMaskedRecolor(
    output,
    original,
    mask,
    width,
    height,
    () => solidTargetRgb('Green'),
    undefined,
    { solidInside: true },
  )
}

export function recolorGraduationPreview(
  imageData: ImageData,
  options: RecolorOptions,
  masks: GraduationPreviewMasks,
): ImageData {
  const { width, height, data } = imageData
  const original = new Uint8ClampedArray(data)
  const output = new Uint8ClampedArray(data)

  // Hood first, then tassel on top so tassel always wins overlaps
  if (options.hoodColor) {
    applyMaskedRecolor(
      output,
      original,
      masks.hood,
      width,
      height,
      (nx) => hoodTargetRgb(options.hoodColor!, nx),
      (x, y) => inFaceZone(x, y, width, height),
      { solidInside: true },
    )
  }

  if (options.tasselColor) {
    applyMaskedRecolor(
      output,
      original,
      masks.tassel,
      width,
      height,
      () => solidTargetRgb(options.tasselColor!),
      (x, y) =>
        inFaceZone(x, y, width, height) || inCapExclusion(x, y, width, height),
      { solidInside: true },
    )
  }

  applyTogaRecolor(output, original, masks.toga, width, height, options.togaColor)

  // Restore face, bare neck skin, and cap from source — kills blur-edge bleed
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!shouldRestoreOriginal(x, y, width, height)) continue
      const i = (y * width + x) * 4
      output[i] = original[i]
      output[i + 1] = original[i + 1]
      output[i + 2] = original[i + 2]
    }
  }

  return new ImageData(output, width, height)
}
