'use client'

import { motion } from 'framer-motion'
import { GraduationCap, Award, Calendar, BookOpen } from 'lucide-react'

interface SchoolContract {
  name: string
  location: string
  contractYear: string
  description: string
  tag: string
}

const schoolContracts: SchoolContract[] = [
  {
    name: 'Philippine Law School – Lacson College',
    location: 'Cabuyao, Laguna',
    contractYear: 'Official Photographer',
    description:
      'Official photography partner for graduation portraits and milestone sessions, delivering excellence, professionalism, and artistry.',
    tag: 'Official Photographer',
  },
  {
    name: 'Our Lady of Fatima University – Laguna Campus',
    location: 'Laguna Campus',
    contractYear: 'Official Photographer',
    description:
      'Proudly chosen as the official photography partner, capturing student milestones with the same standards of quality and care.',
    tag: 'Official Photographer',
  },
]

export default function SchoolPortfolio() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] }
    }
  }

  return (
    <section id="partnerships" className="py-24 bg-white border-t border-b border-slate-100 font-sans">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        
        {/* Header */}
        <div className="max-w-2xl mb-16 space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="text-primary text-[10px] font-bold tracking-[0.25em] uppercase">
              Institutional Partners
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-serif text-slate-800 font-light tracking-wide leading-tight">
            Official School Portfolios & Contracts
          </h2>
          <p className="text-sm text-slate-500 font-light leading-relaxed">
            Proudly chosen as the official photography partner of respected institutions, capturing milestones with excellence, professionalism, and artistry.
          </p>
        </div>

        {/* Contracts Grid */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid md:grid-cols-2 gap-8"
        >
          {schoolContracts.map((school, index) => (
            <motion.div 
              key={index}
              variants={cardVariants}
              className="group bg-slate-50 border border-slate-200/80 p-8 transition-all duration-300 hover:bg-white hover:border-primary/30 hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-bold tracking-widest text-primary uppercase bg-primary/5 px-2.5 py-1 border border-primary/10">
                    {school.tag}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 font-semibold">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{school.contractYear}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-800 group-hover:text-primary transition-colors">
                    {school.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">{school.location}</p>
                </div>

                <p className="text-xs text-slate-500 font-light leading-relaxed">
                  {school.description}
                </p>
              </div>

              <div className="border-t border-slate-200/50 pt-4 mt-6 flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                <span className="flex items-center gap-1">
                  <GraduationCap className="w-4 h-4 text-primary" /> Yearbook contract
                </span>
                <span className="flex items-center gap-1">
                  <Award className="w-4 h-4 text-primary" strokeWidth={2.5} /> Verified Studio
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Dynamic institution logo strip */}
        <div className="mt-20 border-t border-slate-100 pt-12 text-center space-y-6">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Trusted by Graduating Classes & Student Bodies
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-40 hover:opacity-60 transition-opacity duration-300">
            <div className="font-serif font-semibold text-lg text-slate-700 tracking-wider">PLS</div>
            <div className="font-serif font-semibold text-lg text-slate-700 tracking-wider">OLFU</div>
          </div>
        </div>

      </div>
    </section>
  )
}
