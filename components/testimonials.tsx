'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'

const testimonials = [
  {
    id: 1,
    quote: 'Galing ng team ng Fico Mana. Very professional at naasikaso po kami ng maayos. Mula hair and make up, pati directing sa pictures. Sana gawin na sila official photographers of PLS para same ang standards ng grad pic. Thank you to the whole team.',
    author: 'Student from Philippine Law School',
    rating: 5,
  },
  {
    id: 2,
    quote: 'Thank you Fico Mana for the incredible work! These photos are exactly what I needed as I wrap up my final semester and prepare for graduation. Thank you for making me look and feel ready for the next chapter!',
    author: 'Leanne Genecela',
    rating: 5,
  },
  {
    id: 3,
    quote: 'Thank you so much, Fico Mana, for making my grad photo look so beautiful! It\'s a 1M/10 po Highly recommended!',
    author: 'Jea May Demillo',
    rating: 5,
  },
  {
    id: 4,
    quote: 'Hello po! Kakauwi lang po namin ng brother ko. Maraming salamat po for today! I\'m so happy and grateful po ang ganda ng pictures! natupad isa sa mga pangarap ko excited na ko ipost yung pics! Pero sa July 3 pa po yung graduation ko hehe BTS po muna.',
    author: 'Rain Ara Pega',
    rating: 5,
  },
]

export default function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  const current = testimonials[currentIndex]

  return (
    <SectionShell id="stories" variant="blue-glow">
      <div className="max-w-4xl mx-auto">
        <SectionHeader
          eyebrow="Testimonials"
          title="Client Stories"
          description="Hear from those who've experienced the magic of a FICO MANA session."
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
