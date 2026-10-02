import type { Locator } from '@playwright/test'

/** Geometry/color inspection has no semantic locator equivalent. Refuse image/non-flat layers. */
export async function renderedContrast(locator: Locator) {
  return locator.evaluate(element => {
    const canvas = document.createElement('canvas')
    canvas.width = 1; canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const rgba = (value: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1)
      const data = context.getImageData(0, 0, 1, 1).data
      return [data[0], data[1], data[2], data[3] / 255]
    }
    const blend = (front: number[], back: number[]) => front.slice(0, 3).map((value, index) => value * front[3] + back[index] * (1 - front[3]))
    const layers: Array<{ color: string; image: string; opacity: string }> = []
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      layers.push({ color: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity })
    }
    let background = [255, 255, 255], flat = true
    for (const layer of [...layers].reverse()) {
      background = blend(rgba(layer.color), background)
      if (layer.opacity !== '1') flat = false
      if (layer.image !== 'none') {
        const colors = (layer.image.match(/rgba?\([^)]+\)/g) || []).map(rgba)
        if (!layer.image.startsWith('linear-gradient(') || colors.length < 2 || colors.some(color => color[3] !== 1 || color.some((value, index) => value !== colors[0][index]))) flat = false
        else background = blend(colors[0], background)
      }
    }
    const foreground = blend(rgba(getComputedStyle(element).color), background)
    const luminance = (color: number[]) => color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const first = luminance(foreground), second = luminance(background)
    return { foreground, background, flat, ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05), layers }
  })
}
