'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'
import { cn } from '@/lib/utils'
import { useWebsiteMedia } from '@/lib/website-media-client'

const LIGHTBOX_IMAGE_WIDTH = 2040
const LIGHTBOX_IMAGE_HEIGHT = 2560

type GalleryItem = {
  id: string
  image: string
  category: string
  alt: string
}

function GalleryImage({
  item,
  className = '',
  onOpen,
  isClone = false,
}: {
  item: GalleryItem
  className?: string
  onOpen: (item: GalleryItem) => void
  isClone?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(item)}
      tabIndex={isClone ? -1 : undefined}
      className={`relative aspect-[4/5] overflow-hidden rounded-2xl md:rounded-3xl group cursor-pointer text-left ${className}`}
    >
      <div className="relative h-full overflow-hidden">
        <Image
          src={item.image}
          alt={item.alt}
          fill
          draggable={false}
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          className="object-cover transition-transform duration-700 ease-out will-change-transform group-hover:scale-110"
        />
      </div>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-500 pointer-events-none" />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      <div className="absolute inset-0 ring-0 group-hover:ring-2 group-hover:ring-inset group-hover:ring-white/30 transition-all duration-500 pointer-events-none rounded-2xl md:rounded-3xl" />
    </motion.button>
  )
}

function GalleryCarousel({
  items,
  onOpen,
}: {
  items: GalleryItem[]
  onOpen: (item: GalleryItem) => void
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const firstSequenceRef = useRef<HTMLDivElement | null>(null)
  const scrollPositionRef = useRef(0)
  const pauseUntilRef = useRef(0)
  const suppressClickRef = useRef(false)
  const pointerRef = useRef<{
    id: number
    pointerType: string
    startX: number
    startScrollLeft: number
    moved: boolean
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  const pauseIndefinitely = () => {
    pauseUntilRef.current = Number.POSITIVE_INFINITY
  }

  const resumeAfterInteraction = (delay = 900) => {
    pauseUntilRef.current = performance.now() + delay
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pauseIndefinitely()
    pointerRef.current = {
      id: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    }
    if (event.pointerType === 'mouse' && event.button === 0) {
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(true)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    const distance = event.clientX - pointer.startX
    if (Math.abs(distance) > 6) {
      pointer.moved = true
      suppressClickRef.current = true
    }
    if (pointer.pointerType === 'mouse') {
      event.currentTarget.scrollLeft = pointer.startScrollLeft - distance
      scrollPositionRef.current = event.currentTarget.scrollLeft
    }
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    pointerRef.current = null
    setDragging(false)
    scrollPositionRef.current = event.currentTarget.scrollLeft
    resumeAfterInteraction()
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  useEffect(() => {
    let animationFrame = 0
    let previousTime = performance.now()

    const advance = (time: number) => {
      const scroller = scrollerRef.current
      const sequenceWidth = firstSequenceRef.current?.offsetWidth ?? 0
      const elapsed = Math.min(64, Math.max(0, time - previousTime))
      previousTime = time

      const shouldAdvance = (
        scroller &&
        sequenceWidth > 0 &&
        !document.hidden &&
        time >= pauseUntilRef.current
      )

      if (scroller && sequenceWidth > 0 && shouldAdvance) {
        const pixelsPerMillisecond = 72 / 1000
        scrollPositionRef.current = (scrollPositionRef.current + pixelsPerMillisecond * elapsed) % sequenceWidth
        scroller.scrollLeft = scrollPositionRef.current
      } else if (scroller) {
        scrollPositionRef.current = scroller.scrollLeft
        if (sequenceWidth > 0 && scrollPositionRef.current >= sequenceWidth) {
          scrollPositionRef.current %= sequenceWidth
          scroller.scrollLeft = scrollPositionRef.current
        }
      }

      animationFrame = window.requestAnimationFrame(advance)
    }

    animationFrame = window.requestAnimationFrame(advance)
    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [items.length])

  return (
    <div
      className="relative overflow-hidden -mx-4 sm:-mx-6 md:-mx-8 lg:-mx-12"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 md:w-16 bg-gradient-to-r from-black via-black/80 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 md:w-20 bg-gradient-to-l from-black via-black/80 to-transparent" />

      <div
        ref={scrollerRef}
        role="region"
        aria-label="Swipe through graduation gallery photos"
        className={cn(
          'gallery-swipe-carousel overflow-x-auto select-none',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={() => resumeAfterInteraction()}
        onScroll={(event) => {
          if (pointerRef.current || performance.now() < pauseUntilRef.current) {
            scrollPositionRef.current = event.currentTarget.scrollLeft
          }
        }}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className="flex w-max">
          {[0, 1].map((sequence) => (
            <div
              key={sequence}
              ref={sequence === 0 ? firstSequenceRef : undefined}
              className="flex shrink-0 gap-3 pl-4 sm:pl-6 md:gap-4 md:pl-8 lg:pl-12"
              aria-hidden={sequence === 1 ? true : undefined}
            >
              {items.map((item) => (
                <div
                  key={`${sequence}-${item.id}`}
                  className="shrink-0 w-[76vw] max-w-[300px] sm:max-w-[320px] md:w-[28vw] md:max-w-[360px] lg:max-w-[400px]"
                >
                  <GalleryImage item={item} onOpen={onOpen} isClone={sequence === 1} className="w-full" />
                </div>
              ))}
            </div>
          ))}
          <div
            aria-hidden="true"
            className="w-4 shrink-0 sm:w-6 md:w-8 lg:w-12"
          >
            &nbsp;
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Gallery() {
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null)
  const media = useWebsiteMedia()
  const galleryItems: GalleryItem[] = media
    .filter((slot) => slot.kind === 'image')
    .map((slot) => ({
      id: slot.slotKey,
      image: slot.url,
      category: 'Graduation',
      alt: slot.altText,
    }))

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  return (
    <SectionShell id="gallery" variant="elevated">
      <SectionHeader
        eyebrow="Portfolio"
        title="Graduation Gallery"
        description="Celebrate your achievement with professionally captured graduation portraits — elegant, timeless, and uniquely yours."
      />

      <GalleryCarousel items={galleryItems} onOpen={setLightbox} />

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Gallery preview"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            aria-label="Close preview"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="relative max-w-3xl w-full max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={lightbox.image}
              alt={lightbox.alt}
              width={LIGHTBOX_IMAGE_WIDTH}
              height={LIGHTBOX_IMAGE_HEIGHT}
              className="w-full h-auto max-h-[85vh] object-contain"
              sizes="90vw"
              priority
            />
          </div>
        </div>
      )}
    </SectionShell>
  )
}
