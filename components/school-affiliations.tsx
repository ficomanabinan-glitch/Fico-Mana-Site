'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'

const partnerSchools = [
  {
    name: 'Philippine Law School – Lacson College',
    short: 'PLS',
    tag: 'Official Photographer',
    logo: '/pl.jpg',
  },
  {
    name: 'Our Lady of Fatima University – Laguna Campus',
    short: 'OLFU',
    tag: 'Official Photographer',
    logo: '/fatima.jpg',
  },
]

export default function SchoolAffiliations() {
  return (
    <SectionShell id="affiliations" variant="elevated">
      <SectionHeader
        eyebrow="Institutional Partners"
        title="Trusted by Leading Institutions"
        description="Proudly chosen as the official photography partner of respected institutions, capturing milestones with excellence, professionalism, and artistry."
        align="center"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory md:grid md:grid-cols-2 md:max-w-3xl md:mx-auto md:overflow-visible md:pb-0 md:gap-6"
      >
        {partnerSchools.map((school, index) => (
          <motion.div
            key={school.short}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
            viewport={{ once: true }}
            className="min-w-[220px] md:min-w-0 snap-start border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 flex flex-col gap-4"
          >
            <div className="w-16 h-16 rounded-full border border-white/15 bg-white overflow-hidden flex items-center justify-center shrink-0">
              <Image
                src={school.logo}
                alt={`${school.name} logo`}
                width={64}
                height={64}
                className="w-full h-full object-contain p-0.5"
              />
            </div>
            <div>
              <p className="text-[9px] font-semibold tracking-[0.2em] uppercase text-white mb-2">
                {school.tag}
              </p>
              <h3 className="text-sm font-semibold text-white leading-snug">{school.name}</h3>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </SectionShell>
  )
}
