'use client'

import { useWebsiteContent } from '@/lib/website-content-client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'

export default function About() {
  const { copy } = useWebsiteContent()
  const storyParagraphs = copy.aboutBody.split(/\n\s*\n/)
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
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/40 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-white/90 text-xs tracking-label uppercase font-medium">
                {copy.aboutCaption}
              </p>
            </div>
          </motion.div>

          <div className="min-w-0">
            <SectionHeader
              eyebrow={copy.aboutEyebrow}
              title={copy.aboutTitle}
            />

            <div className="space-y-5 md:space-y-6 -mt-6 md:-mt-10">
              {storyParagraphs.map((paragraph, index) => (
                <motion.p
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  viewport={{ once: true, margin: '-40px' }}
                  className="text-sm md:text-base text-white/70 leading-relaxed text-justify"
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
