'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import SectionHeader from '@/components/section-header'

type FaqItem = {
  question: string
  content: React.ReactNode
}

const faqs: FaqItem[] = [
  {
    question: 'How long is a typical graduation session?',
    content: (
      <>
        <p>
          The graduation photoshoot itself takes approximately <strong>10–15 minutes</strong>.
        </p>
        <p className="mt-3">
          If you avail of our <strong>MANA Package</strong>, the Hair and Makeup session takes around{' '}
          <strong>1 hour and 30 minutes</strong>, making the total session time approximately{' '}
          <strong>2 hours per person</strong>.
        </p>
      </>
    ),
  },
  {
    question: 'Do you provide different toga colors?',
    content: (
      <>
        <p>Yes! We provide the following toga options:</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Plain Green Toga</li>
          <li>Plain Black Toga</li>
        </ul>
        <p className="mt-4">
          We also have hoods available in different colors depending on your course, including:
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-1 columns-1 sm:columns-2">
          <li>White</li>
          <li>Orange</li>
          <li>Violet</li>
          <li>Green</li>
          <li>Yellow and Green</li>
          <li>Red</li>
          <li>Black</li>
          <li>Pink</li>
          <li>Red and White</li>
          <li>Dark Blue</li>
          <li>Light Blue</li>
          <li>Gray and Green</li>
        </ul>
        <p className="mt-4">
          If you&apos;re unsure which hood color matches your course, feel free to ask our team.
        </p>
      </>
    ),
  },
  {
    question: 'Are contact lenses included in the package?',
    content: (
      <p>
        No. Contact lenses are <strong>not included</strong> in any of our packages. If you prefer to
        wear contact lenses during your session, please bring your own.
      </p>
    ),
  },
  {
    question: 'Do you provide eyelashes?',
    content: (
      <p>
        Yes, eyelashes are included <strong>exclusively in our MANA Package</strong>. They are not
        included in our other packages unless stated otherwise.
      </p>
    ),
  },
]

export default function FAQ() {
  const [expandedId, setExpandedId] = useState<number | null>(0)

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.1 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4 },
    },
  }

  return (
    <section className="py-24 md:py-32 px-6 md:px-12 bg-background">
      <div className="max-w-3xl mx-auto">
        <SectionHeader
          eyebrow="Support"
          title="Frequently Asked Questions"
          description="Everything you need to know before your session."
          align="center"
        />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="space-y-3"
        >
          {faqs.map((faq, index) => {
            const isOpen = expandedId === index
            return (
              <motion.div
                key={index}
                variants={itemVariants}
                className={`border transition-colors duration-300 ${
                  isOpen ? 'border-primary/30 bg-card' : 'border-border bg-card/50'
                }`}
              >
                <button
                  onClick={() => setExpandedId(isOpen ? null : index)}
                  className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left"
                >
                  <h3 className="font-medium text-sm md:text-base text-balance pr-4">
                    {faq.question}
                  </h3>
                  <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/5 text-white">
                    {isOpen ? (
                      <Minus className="w-4 h-4" strokeWidth={1.5} />
                    ) : (
                      <Plus className="w-4 h-4" strokeWidth={1.5} />
                    )}
                  </span>
                </button>

                <motion.div
                  initial={false}
                  animate={{
                    height: isOpen ? 'auto' : 0,
                    opacity: isOpen ? 1 : 0,
                  }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-5 border-t border-border/50">
                    <div className="pt-4 text-sm text-white/70 leading-relaxed">
                      {faq.content}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
