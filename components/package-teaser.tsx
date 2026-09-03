'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ficoPackages, manaPackages } from '@/lib/self-portrait-packages'
import { getBookingUrl } from '@/lib/booking-packages'

const highlights = [
  ficoPackages.find((p) => p.id === 'fico-2')!,
  manaPackages.find((p) => p.id === 'mana-2')!,
]

export default function PackageTeaser() {
  return (
    <section
      className="relative py-14 md:py-16 overflow-hidden bg-black border-t border-white/6"
      style={{ fontFamily: 'var(--font-aileron)' }}
    >
      <Image
        src="/bg_package.jpg"
        alt=""
        fill
        className="object-cover object-center opacity-[0.08]"
        priority={false}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-8 md:mb-10"
        >
          <p className="text-[9px] md:text-[10px] font-light tracking-[0.4em] uppercase text-white/40 mb-3">
            Self Portrait Studio
          </p>
          <h2 className="text-xl md:text-2xl font-normal tracking-[0.14em] uppercase text-white">
            Popular Packages
          </h2>
          <p className="mt-3 text-[10px] md:text-[11px] font-light text-white/45 tracking-[0.06em]">
            Solo, duo, family & barkada — starting at Php 350
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5 md:gap-7">
          {highlights.map((pkg, index) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              viewport={{ once: true }}
              className="relative border border-white/12 bg-black/40 backdrop-blur-sm px-6 py-7 md:px-8 md:py-9"
            >
              {pkg.badge && (
                <span className="absolute top-4 right-4 text-[8px] font-semibold tracking-[0.2em] uppercase bg-[#0500D0] text-white px-2.5 py-1">
                  {pkg.badge}
                </span>
              )}
              <h3 className="text-sm md:text-[15px] font-semibold tracking-[0.18em] text-white uppercase">
                {pkg.tier}
              </h3>
              <p className="mt-2 text-[11px] md:text-xs font-light text-white/50 tracking-[0.08em] uppercase">
                {pkg.title}
              </p>
              <p className="mt-4 text-lg md:text-xl font-light text-white tracking-[0.06em]">
                {pkg.price}
              </p>
              <ul className="mt-5 space-y-2">
                {pkg.includes.slice(0, 3).map((item) => (
                  <li key={item} className="text-[11px] font-light text-white/65 leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                nativeButton={false}
                render={<Link href={getBookingUrl(pkg.id)} />}
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'mt-6 w-full rounded-none border-white/25 bg-transparent hover:bg-white/10 text-white text-[9px] md:text-[10px] font-bold tracking-[0.16em] uppercase h-10',
                )}
              >
                Book This Package
              </Button>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          viewport={{ once: true }}
          className="mt-10 text-center"
        >
          <Button
            nativeButton={false}
            render={<Link href="/packages" />}
            className={cn(
              buttonVariants({ size: 'lg' }),
              'rounded-none border border-white/30 bg-transparent hover:bg-white/10 text-white text-[10px] md:text-[11px] font-bold tracking-[0.18em] uppercase h-11 md:h-12 px-8',
            )}
          >
            See All Packages
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
