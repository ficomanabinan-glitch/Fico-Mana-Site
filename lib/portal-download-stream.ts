/** Persist the first download before reporting EOF. Failed/cancelled streams never reach flush. */
export function trackCompletedPortalDownload(body: ReadableStream, onComplete: () => Promise<void>) {
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) { controller.enqueue(chunk) },
    async flush() { await onComplete() },
  }))
}
