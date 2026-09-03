'use client'

import { motion } from 'framer-motion'
import { BookOpen, Camera, Users, Download, Sparkles } from 'lucide-react'
import SectionHeader from '@/components/section-header'

const steps = [
  {
    number: '01',
    title: 'Reserve',
    description: 'Book your private session at your preferred date and time.',
    icon: BookOpen,
  },
  {
    number: '02',
    title: 'Arrive',
    description: 'Step into our intimate studio designed for creative freedom.',
    icon: Camera,
  },
  {
    number: '03',
    title: 'Create',
    description: 'Express yourself fully with professional lighting and equipment.',
    icon: Sparkles,
  },
  {
    number: '04',
    title: 'Select',
    description: 'Review and curate your favorite moments instantly.',
    icon: Users,
  },
  {
    number: '05',
    title: 'Take Home',
    description: 'Receive your high-resolution images and lasting memories.',
    icon: Download,
  },
]

export default function Experience() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.15 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
    },
  }

  return (
    <section id="experience" className="py-24 md:py-32 px-6 md:px-12 bg-secondary">
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          eyebrow="How It Works"
          title="The Experience"
          description="From booking to final delivery — a seamless, private journey designed entirely around you."
        />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 md:gap-6"
        >
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.number}
                variants={itemVariants}
                className="relative bg-card p-6 md:p-8 group hover:shadow-lg hover:shadow-primary/5 transition-shadow duration-500"
              >
                {index < steps.length - 1 && (
                  <span className="hidden lg:block absolute top-10 -right-3 w-6 h-px bg-primary/20 z-10" />
                )}
                <div className="flex items-center justify-between mb-6">
                  <span className="font-serif text-3xl font-light text-primary/30 group-hover:text-primary/60 transition-colors">
                    {step.number}
                  </span>
                  <div className="w-10 h-10 flex items-center justify-center bg-primary/5 group-hover:bg-primary/10 transition-colors">
                    <Icon className="w-4 h-4 text-primary" strokeWidth={1.5} />
                  </div>
                </div>
                <h3 className="text-sm font-medium tracking-[0.15em] uppercase mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
