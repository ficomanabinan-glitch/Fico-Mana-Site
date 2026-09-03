'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'

const storyParagraphs = [
  'FICO MANA Studio began as a self-portrait studio in February 2023, built from the shared dream of a couple who refused to let challenges define their future. Despite limited resources, uncertainties, and the struggles of starting from the ground up, they continued to pursue their passion with determination and faith. Every obstacle became a reason to work harder, turning a simple dream into a studio dedicated to celebrating life\'s most meaningful moments through photography.',
  'Within its first year, FICO MANA quickly became one of the most trusted photography studios in Cabuyao, earning the support of the local community and opening doors to new opportunities. The studio was honored to become the official photographer for various City and Barangay pageants, further establishing its reputation for quality, creativity, and professionalism.',
  'Today, FICO MANA Studio is a creative photography studio dedicated to capturing life\'s most meaningful moments. The studio specializes in timeless graduation portraits, creative portrait sessions, self-portrait experiences, and modern photobooth services. Every session is crafted with professional lighting, premium equipment, and artistic direction to deliver photographs that are authentic, elegant, and unforgettable.',
  'As FICO MANA Studio continues to grow, its commitment remains the same, to provide every client with an exceptional experience and portraits that stand the test of time. Every milestone is captured with passion, creativity, and excellence, ensuring that each photograph reflects not only how clients look, but also the story behind their achievements.',
]

export default function About() {
  return (
    <SectionShell id="about" variant="gradient">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true }}
            className="relative aspect-[4/5] overflow-hidden"
          >
            <Image
              src="/model/model_5.jpg"
              alt="FICO MANA Studio portrait session"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/40 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-white/90 text-xs tracking-[0.25em] uppercase font-medium">
                Est. Fico Mana Studio
              </p>
            </div>
          </motion.div>

          <div className="min-w-0">
            <SectionHeader
              eyebrow="Our Story"
              title="About FICO MANA"
            />

            <div className="space-y-5 md:space-y-6 -mt-6 md:-mt-10">
              {storyParagraphs.map((paragraph, index) => (
                <motion.p
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  viewport={{ once: true, margin: '-40px' }}
                  className="text-sm md:text-base text-white/70 leading-relaxed"
                >
                  {paragraph}
                </motion.p>
              ))}
            </div>
          </div>
        </div>
    </SectionShell>
  )
}
