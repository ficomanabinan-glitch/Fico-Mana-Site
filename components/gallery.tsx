'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'
import { cn } from '@/lib/utils'

const IMAGE_WIDTH = 2040
const IMAGE_HEIGHT = 2560

type GalleryItem = {
  id: number
  image: string
  category: string
  alt: string
}

const topRowItems: GalleryItem[] = [
  { id: 1, image: '/grad/grad_3.jpg', category: 'Graduation', alt: 'Graduation portrait in toga' },
  { id: 2, image: '/grad/grad_1.jpg', category: 'Graduation', alt: 'Graduation portrait with toga and cap' },
  { id: 3, image: '/grad/grad_8.jpg', category: 'Graduation', alt: 'Graduation portrait with toga and cap' },
]

const bottomRowItems: GalleryItem[] = [
  { id: 4, image: '/grad/grad_4.jpg', category: 'Graduation', alt: 'Graduation toga portrait' },
  { id: 5, image: '/grad/grad_5.jpg', category: 'Graduation', alt: 'Graduation glamour portrait' },
  { id: 6, image: '/grad/grad_2.jpg', category: 'Graduation', alt: 'Graduation studio portrait' },
  { id: 7, image: '/grad/grad_6.jpg', category: 'Graduation', alt: 'Graduation portrait session' },
  { id: 8, image: '/grad/grad_7.jpg', category: 'Graduation', alt: 'Graduation portrait details' },
  { id: 9, image: '/grad/grad_9.jpg', category: 'Graduation', alt: 'Graduation sablay portrait' },
]

const allItems = [...topRowItems, ...bottomRowItems]

function GalleryImage({
  item,
  className = '',
  onOpen,
}: {
  item: GalleryItem
  className?: string
  onOpen: (item: GalleryItem) => void
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(item)}
      className={`relative overflow-hidden rounded-2xl md:rounded-3xl group cursor-pointer text-left ${className}`}
    >
      <div className="overflow-hidden">
        <Image
          src={item.image}
          alt={item.alt}
          width={IMAGE_WIDTH}
          height={IMAGE_HEIGHT}
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          className="w-full h-auto block transition-transform duration-700 ease-out will-change-transform group-hover:scale-110"
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
  const [paused, setPaused] = useState(false)
  const pauseTimerRef = useRef<number | null>(null)
  const loopItems = [...items, ...items]

  const pauseBriefly = () => {
    setPaused(true)
    if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = window.setTimeout(() => setPaused(false), 5000)
  }

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current)
    }
  }, [])

  return (
    <div
      className="relative overflow-hidden -mx-4 sm:-mx-6 md:-mx-8 lg:-mx-12"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 md:w-16 bg-gradient-to-r from-black via-black/80 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 md:w-20 bg-gradient-to-l from-black via-black/80 to-transparent" />

      <div
        className={cn(
          'gallery-marquee-track flex w-max gap-3 md:gap-4 px-4 sm:px-6 md:px-8 lg:px-12',
          paused && 'is-paused',
        )}
        style={{ '--gallery-marquee-duration': `${items.length * 4}s` } as React.CSSProperties}
        onTouchStart={pauseBriefly}
        onPointerDown={pauseBriefly}
      >
        {loopItems.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="shrink-0 w-[76vw] max-w-[300px] sm:max-w-[320px] md:w-[28vw] md:max-w-[360px] lg:max-w-[400px]"
          >
            <GalleryImage item={item} onOpen={onOpen} className="w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Gallery() {
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null)

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

      <GalleryCarousel items={allItems} onOpen={setLightbox} />

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
              width={IMAGE_WIDTH}
              height={IMAGE_HEIGHT}
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
