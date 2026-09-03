'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getBookingUrl } from '@/lib/booking-packages'

const ficoIncludes = [
  'Free use of Toga & Cap',
  'Free use of Alampay',
  'Professional Photographer',
  '5 Edited/Enhanced Copies',
  'Professional Light Setup',
  '2 pegs (toga, uniform, or alampay)',
  '2 pcs. 4R-sized Prints',
  '4 pcs. Wallet-sized Prints',
  '1 pc. 8R Glass-to-Glass Frame',
  'Get ALL RAW Copies',
  'Receive 5 enhanced photos 14 days after selection',
]

const cappingIncludes = [
  'Free Makeup',
  '2 edited/enhanced',
  '1 layout/outfit',
  'All raw copies',
  '8r Glass to glass frame',
  '2 pcs. 4r size printed copies',
  '7-14 working days for editing process',
]

const packages = [
  {
    id: 'fico-package',
    name: 'FICO PACKAGE',
    subtitle: 'Available anytime from 8:00 AM – 4:00 PM',
    price: 'Php 3,500',
    includes: ficoIncludes,
  },
  {
    id: 'mana-makeup',
    name: 'MANA PACKAGE',
    subtitle: 'With Hair and Makeup',
    price: 'Php 6,500',
    includes: ficoIncludes,
  },
]

const otherPackages = [
  {
    id: 'capping-pinning',
    name: 'CAPPING AND PINNING PHOTOSHOOT',
    subtitle: 'Other service · 10 slots only per day',
    price: 'Php 4,000',
    includes: cappingIncludes,
  },
]

export default function Pricing() {
  return (
    <>
      <section
        id="pricing"
        className="relative py-16 md:py-20 overflow-hidden bg-black"
        style={{ fontFamily: 'var(--font-aileron)' }}
      >
        <Image
          src="/bg_pricing.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-20"
          priority={false}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-6 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-10 md:mb-12"
          >
            <p className="text-[9px] md:text-[10px] font-light tracking-[0.4em] uppercase text-white/40 mb-3">
              Graduation Packages
            </p>
            <h2 className="text-xl md:text-2xl font-normal tracking-[0.14em] uppercase text-white">
              Choose Your Package
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-5 md:gap-7">
            {packages.map((pkg, index) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                viewport={{ once: true }}
                className="border border-white/12 bg-black/40 backdrop-blur-sm px-6 py-7 md:px-8 md:py-9 flex flex-col"
              >
                <div className="mb-6 pb-6 border-b border-white/10 text-center md:text-left">
                  <h3 className="text-sm md:text-[15px] font-semibold tracking-[0.18em] text-white uppercase">
                    {pkg.name}
                  </h3>
                  {pkg.subtitle ? (
                    <p className="mt-2 text-[11px] md:text-xs font-light text-white/50 tracking-[0.08em]">
                      {pkg.subtitle}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] md:text-xs font-light text-transparent tracking-[0.08em] select-none">
                      -
                    </p>
                  )}
                  <p className="mt-4 text-lg md:text-xl font-light text-white tracking-[0.06em]">
                    {pkg.price}
                  </p>
                </div>

                <p className="text-[9px] font-medium tracking-[0.3em] uppercase text-white/35 mb-5 text-center md:text-left">
                  Includes
                </p>

                <ul className="divide-y divide-white/6 flex-1">
                  {pkg.includes.map((item, i) => (
                    <li
                      key={item}
                      className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="text-[9px] font-light tabular-nums text-white/25 w-4 shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] md:text-xs font-light text-white/70 tracking-[0.02em] leading-relaxed">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <Button
                    nativeButton={false}
                    render={<Link href={getBookingUrl(pkg.id)} />}
                    className={cn(
                      buttonVariants({ size: 'lg' }),
                      'w-full rounded-none bg-[#0500D0] hover:bg-[#03008F] text-white text-[9px] md:text-[10px] font-bold tracking-[0.16em] uppercase h-10',
                    )}
                    style={{ fontFamily: 'var(--font-aileron)' }}
                  >
                    Book This Package
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            viewport={{ once: true }}
            className="mt-12 md:mt-14 text-center"
          >
            <p className="text-[10px] md:text-[11px] font-light text-white/45 tracking-[0.08em] mb-5">
              Looking for solo, duo, family, or barkada sessions?
            </p>
            <Button
              nativeButton={false}
              render={<Link href="/packages" />}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'rounded-none border border-white/30 bg-transparent hover:bg-white/10 text-white text-[10px] md:text-[11px] font-bold tracking-[0.18em] uppercase h-11 md:h-12 px-8',
              )}
              style={{ fontFamily: 'var(--font-aileron)' }}
            >
              View More Packages
            </Button>
          </motion.div>
        </div>
      </section>

      <section
        id="additional-services"
        className="relative py-16 md:py-20 overflow-hidden bg-black border-t border-white/10"
        style={{ fontFamily: 'var(--font-aileron)' }}
      >
        <Image
          src="/capping_bg.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-20"
          priority={false}
        />

        <div className="relative z-10 max-w-2xl mx-auto px-6 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-10 md:mb-12"
          >
            <p className="text-[9px] md:text-[10px] font-light tracking-[0.4em] uppercase text-white/40 mb-3">
              Other Services
            </p>
            <h2 className="text-xl md:text-2xl font-normal tracking-[0.14em] uppercase text-white">
              Other Service
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 gap-5 md:gap-7">
            {otherPackages.map((pkg, index) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                viewport={{ once: true }}
                className="border border-white/12 bg-black/40 backdrop-blur-sm px-6 py-7 md:px-8 md:py-9 flex flex-col"
              >
                <div className="mb-6 pb-6 border-b border-white/10 text-center md:text-left">
                  <h3 className="text-sm md:text-[15px] font-semibold tracking-[0.18em] text-white uppercase">
                    {pkg.name}
                  </h3>
                  {pkg.subtitle ? (
                    <p className="mt-2 text-[11px] md:text-xs font-light text-white/50 tracking-[0.08em]">
                      {pkg.subtitle}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] md:text-xs font-light text-transparent tracking-[0.08em] select-none">
                      -
                    </p>
                  )}
                  <p className="mt-4 text-lg md:text-xl font-light text-white tracking-[0.06em]">
                    {pkg.price}
                  </p>
                </div>

                <p className="text-[9px] font-medium tracking-[0.3em] uppercase text-white/35 mb-5 text-center md:text-left">
                  Includes
                </p>

                <ul className="divide-y divide-white/6 flex-1">
                  {pkg.includes.map((item, i) => (
                    <li
                      key={item}
                      className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="text-[9px] font-light tabular-nums text-white/25 w-4 shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] md:text-xs font-light text-white/70 tracking-[0.02em] leading-relaxed">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <Button
                    nativeButton={false}
                    render={<Link href={getBookingUrl(pkg.id)} />}
                    className={cn(
                      buttonVariants({ size: 'lg' }),
                      'w-full rounded-none bg-[#0500D0] hover:bg-[#03008F] text-white text-[9px] md:text-[10px] font-bold tracking-[0.16em] uppercase h-10',
                    )}
                    style={{ fontFamily: 'var(--font-aileron)' }}
                  >
                    Book This Package
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
