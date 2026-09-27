'use client'

import { useWebsiteContent } from '@/lib/website-content-client'

import { motion, AnimatePresence } from 'framer-motion'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'


export default function Testimonials() {
  const { copy } = useWebsiteContent()
  const testimonials = ([1, 2, 3, 4] as const).map(id => ({
    id, quote: copy[`story${id}Quote`], author: copy[`story${id}Author`], rating: 5,
  }))
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const section = document.getElementById('stories')
    if (!section) return
    let visible = false
    let interval: ReturnType<typeof setInterval> | undefined
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePlayback = () => {
      clearInterval(interval)
      if (visible && !document.hidden && !reducedMotion.matches) {
        interval = setInterval(() => setCurrentIndex(prev => (prev + 1) % testimonials.length), 6000)
      }
    }
    const observer = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false
      updatePlayback()
    })
    observer.observe(section)
    document.addEventListener('visibilitychange', updatePlayback)
    reducedMotion.addEventListener('change', updatePlayback)
    return () => {
      clearInterval(interval)
      observer.disconnect()
      document.removeEventListener('visibilitychange', updatePlayback)
      reducedMotion.removeEventListener('change', updatePlayback)
    }
  }, [testimonials.length])

  const current = testimonials[currentIndex]

  return (
    <SectionShell id="stories" variant="blue-glow">
      <div className="max-w-4xl mx-auto">
        <SectionHeader
          eyebrow={copy.storiesEyebrow}
          title={copy.storiesTitle}
          description={copy.storiesDescription}
          align="center"
        />

        <div className="relative min-h-[320px] md:min-h-[280px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="bg-card border border-border p-10 md:p-14 text-center"
            >
              <div className="flex justify-center gap-1 mb-8">
                {[...Array(current.rating)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-white text-white" />
                ))}
              </div>

              <blockquote className="font-serif text-lg md:text-xl lg:text-2xl font-light text-foreground leading-relaxed mb-10 text-balance">
                &ldquo;{current.quote}&rdquo;
              </blockquote>

              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-px bg-white/30 mb-3" />
                <p className="text-sm font-medium tracking-[0.15em] uppercase text-white/70">
                  {current.author}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              aria-label={`Go to testimonial ${index + 1}`}
              className={`h-1 transition-all duration-300 ${
                index === currentIndex
                  ? 'w-8 bg-white'
                  : 'w-4 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </SectionShell>
  )
}
