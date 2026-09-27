'use client'

import { useWebsiteContent } from '@/lib/website-content-client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import SectionHeader from '@/components/section-header'

export default function FAQ() {
  const { copy } = useWebsiteContent()
  const faqs = ([1, 2, 3, 4] as const).map(number => ({
    question: copy[`faq${number}Question`],
    content: <p className="whitespace-pre-line">{copy[`faq${number}Answer`]}</p>,
  }))
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
          eyebrow={copy.faqEyebrow}
          title={copy.faqTitle}
          description={copy.faqDescription}
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
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
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
                  id={`faq-answer-${index}`}
                  aria-hidden={!isOpen}
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
