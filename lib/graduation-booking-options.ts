/** Hood colors in mockup grid order (4 columns). */
export const HOOD_COLOR_GRID = [
  'Pink',
  'Black',
  'White',
  'Yellow',
  'Red and White',
  'Red',
  'Orange',
  'Dark Blue',
  'Gray',
  'Light Blue',
  'Violet',
  'Green',
  'Gray and Green',
  'Yellow and Green',
  'Maroon',
  'Brown',
] as const

export const HOOD_COLORS = HOOD_COLOR_GRID

export const TOGA_COLORS = ['Plain Green Toga', 'Plain Black Toga'] as const

export const TASSEL_COLORS = [
  'Yellow',
  'Gold',
  'Black',
  'White',
  'Red',
  'Green',
  'Blue',
  'Orange',
  'Maroon',
  'Brown',
  'Pink',
] as const

export const STUDIO_BACKGROUNDS = [
  { id: 'blue', label: 'Blue', image: '/blue_bg.jpg' },
  { id: 'green', label: 'Green', image: '/green_bg.jpg' },
  { id: 'gray', label: 'Gray', image: '/gray_bg.jpg' },
] as const

export type StudioBackground = (typeof STUDIO_BACKGROUNDS)[number]

export const GRADUATION_TOGA_NOTE =
  'Note: For other school with different style of toga, you need to provide or bring your own on the day of your session.'

/** Map color name → CSS tint for preview accents */
export function colorToCss(name: string): string {
  const map: Record<string, string> = {
    Pink: '#ec4899',
    Black: '#0a0a0a',
    White: '#f8fafc',
    Yellow: '#eab308',
    'Red and White': '#dc2626',
    Red: '#dc2626',
    Orange: '#ea580c',
    'Dark Blue': '#1e3a8a',
    Gray: '#6b7280',
    'Light Blue': '#38bdf8',
    Violet: '#7c3aed',
    Green: '#16a34a',
    'Gray and Green': '#4d7c0f',
    'Yellow and Green': '#84cc16',
    Maroon: '#7f1d1d',
    Brown: '#78350f',
    Gold: '#ca8a04',
    Blue: '#2563eb',
    'Plain Green Toga': '#16a34a',
    'Plain Black Toga': '#111827',
  }
  return map[name] || '#ffffff'
}

function hexLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** Text color that reads on a color swatch button. */
export function colorSwatchTextClass(name: string): string {
  const parts = name.split(/\s+and\s+/i)
  return hexLuminance(colorToCss(parts[0].trim())) > 0.62 ? 'text-black' : 'text-white'
}

/** Supports split hood colors like "Red and White". */
export function colorToPreviewFill(name: string): string {
  const parts = name.split(/\s+and\s+/i)
  if (parts.length >= 2) {
    return `linear-gradient(135deg, ${colorToCss(parts[0].trim())} 0%, ${colorToCss(parts[0].trim())} 46%, ${colorToCss(parts[1].trim())} 54%, ${colorToCss(parts[1].trim())} 100%)`
  }
  return colorToCss(name)
}
