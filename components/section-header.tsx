'use client'

import { motion } from 'framer-motion'

interface SectionHeaderProps {
  eyebrow: string
  title: string
  description?: string
  align?: 'left' | 'center'
}

export default function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'left',
}: SectionHeaderProps) {
  const isCenter = align === 'center'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true }}
      className={`mb-14 md:mb-20 ${isCenter ? 'text-center' : ''}`}
    >
      <div className={`flex items-center gap-4 mb-5 ${isCenter ? 'justify-center' : ''}`}>
        {!isCenter && <span className="h-px w-10 bg-white" />}
        <span className="label-premium text-white">{eyebrow}</span>
        {isCenter && <span className="h-px w-10 bg-white" />}
      </div>
      <h2 className="heading-lg text-white mb-4">{title}</h2>
      {description && (
        <p
          className={`text-base md:text-lg text-white/70 leading-relaxed max-w-2xl ${
            isCenter ? 'mx-auto' : ''
          }`}
        >
          {description}
        </p>
      )}
    </motion.div>
  )
}
