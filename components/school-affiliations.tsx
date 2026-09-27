'use client'

import { useWebsiteContent } from '@/lib/website-content-client'

import { motion } from 'framer-motion'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'


export default function SchoolAffiliations() {
  const { copy } = useWebsiteContent()
  const partnerSchools = [
    {
      name: copy.partner1Name,
      short: 'PLS',
      tag: copy.partner1Tag,
      logo: 'https://phillaw.edu.ph/assets/img/phillaw-logo.png',
    },
    {
      name: copy.partner2Name,
      short: 'OLFU',
      tag: copy.partner2Tag,
      logo: '/fatima.jpg',
    },
  ]

  return (
    <SectionShell id="affiliations" variant="elevated">
      <SectionHeader
        eyebrow={copy.schoolsEyebrow}
        title={copy.schoolsTitle}
        description={copy.schoolsDescription}
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
            className="min-w-[220px] md:min-w-0 snap-start border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-4"
          >
            <div className="w-16 h-16 rounded-full border border-white/15 bg-white overflow-hidden flex items-center justify-center shrink-0">
              <img
                src={school.logo}
                alt={`${school.name} logo`}
                width={64}
                height={64}
                loading="lazy"
                className="w-full h-full object-contain p-0.5"
              />
            </div>
            <div>
              <p className="text-caption font-semibold tracking-label uppercase text-white mb-2">
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
