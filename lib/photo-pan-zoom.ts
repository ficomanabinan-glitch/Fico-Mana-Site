export type PhotoView = { scale: number; x: number; y: number }
export type PhotoPoint = { x: number; y: number }
export type PhotoBounds = { width: number; height: number; imageWidth: number; imageHeight: number }
export const FIT_PHOTO: PhotoView = { scale: 1, x: 0, y: 0 }
export const MAX_PHOTO_ZOOM = 3

export function constrainPhotoView(view: PhotoView, bounds: PhotoBounds): PhotoView {
  const scale = Math.min(MAX_PHOTO_ZOOM, Math.max(1, Number.isFinite(view.scale) ? view.scale : 1))
  const fit = Math.min(bounds.width / (bounds.imageWidth || 1), bounds.height / (bounds.imageHeight || 1))
  const maxX = Math.max(0, (bounds.imageWidth * fit * scale - bounds.width) / 2)
  const maxY = Math.max(0, (bounds.imageHeight * fit * scale - bounds.height) / 2)
  const offset = (value: number, limit: number) => limit === 0 || !Number.isFinite(value) ? 0 : Math.min(limit, Math.max(-limit, value))
  return { scale, x: offset(view.x, maxX), y: offset(view.y, maxY) }
}

export function zoomPhotoWithWheel(view: PhotoView, deltaY: number, deltaMode: number, point: PhotoPoint, bounds: PhotoBounds): PhotoView {
  const units = deltaMode === 1 ? 16 : deltaMode === 2 ? bounds.height : 1
  const delta = Math.min(500, Math.max(-500, deltaY * units))
  const scale = Math.min(MAX_PHOTO_ZOOM, Math.max(1, view.scale * Math.exp(-delta * 0.002)))
  const ratio = scale / view.scale
  return constrainPhotoView({ scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, bounds)
}

/** Points are relative to the viewport center; keep the pinch midpoint anchored. */
export function transformPhotoGesture(start: PhotoView, from: PhotoPoint[], to: PhotoPoint[], bounds: PhotoBounds): PhotoView {
  if (!from.length || !to.length) return constrainPhotoView(start, bounds)
  if (from.length < 2 || to.length < 2) {
    return constrainPhotoView({ ...start, x: start.x + to[0].x - from[0].x, y: start.y + to[0].y - from[0].y }, bounds)
  }
  const distance = (points: PhotoPoint[]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
  const midpoint = (points: PhotoPoint[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
  const initialDistance = distance(from)
  if (initialDistance < 1) return constrainPhotoView(start, bounds)
  const scale = Math.min(MAX_PHOTO_ZOOM, Math.max(1, start.scale * distance(to) / initialDistance))
  const ratio = scale / start.scale
  const before = midpoint(from)
  const after = midpoint(to)
  return constrainPhotoView({ scale, x: after.x - (before.x - start.x) * ratio, y: after.y - (before.y - start.y) * ratio }, bounds)
}
