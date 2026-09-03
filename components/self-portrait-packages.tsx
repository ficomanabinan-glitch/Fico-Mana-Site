'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ficoPackages,
  manaPackages,
  creativePackages,
  type SelfPortraitPackage,
} from '@/lib/self-portrait-packages'
import { getBookingUrl } from '@/lib/booking-packages'

function IncludeItem({ item }: { item: string }) {
  const isHighlight = /ALL (ENHANCED|RAW)|\d+ ENHANCED/i.test(item)
  const isMuted = /NO PRINTED/i.test(item)

  return (
    <span
      className={cn(
        'text-[11px] md:text-xs tracking-[0.02em] leading-relaxed',
        isHighlight && 'text-white font-medium',
        isMuted && 'text-white/40 font-light italic',
        !isHighlight && !isMuted && 'text-white/70 font-light',
      )}
    >
      {item}
    </span>
  )
}

function PackageCard({ pkg, index }: { pkg: SelfPortraitPackage; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="relative border border-white/12 bg-black/40 backdrop-blur-sm px-6 py-7 md:px-8 md:py-9 flex flex-col h-full"
    >
      {pkg.badge && (
        <span className="absolute top-4 right-4 text-[8px] font-semibold tracking-[0.2em] uppercase bg-[#0500D0] text-white px-2.5 py-1">
          {pkg.badge}
        </span>
      )}

      <div className="mb-6 pb-6 border-b border-white/10">
        <h3 className="text-sm md:text-[15px] font-semibold tracking-[0.18em] text-white uppercase">
          {pkg.tier}
        </h3>
        <p className="mt-2 text-[11px] md:text-xs font-light text-white/50 tracking-[0.08em] uppercase">
          {pkg.title}
        </p>
        <p className="mt-4 text-lg md:text-xl font-light text-white tracking-[0.06em]">
          {pkg.price}
        </p>
        {pkg.secondaryPrice && pkg.secondaryPriceLabel && (
          <p className="mt-2 text-[11px] md:text-xs font-light text-white/55 tracking-[0.04em] leading-relaxed">
            <span className="block text-white/40 uppercase tracking-[0.12em] text-[9px] mb-1">
              {pkg.secondaryPriceLabel}
            </span>
            {pkg.secondaryPrice}
          </p>
        )}
      </div>

      <p className="text-[9px] font-medium tracking-[0.3em] uppercase text-white/35 mb-5">
        Includes
      </p>

      <ul className="divide-y divide-white/6 flex-1">
        {pkg.includes.map((item, i) => (
          <li key={item} className="flex items-start gap-4 py-2.5 first:pt-0 last:pb-0">
            <span className="text-[9px] font-light tabular-nums text-white/25 w-4 shrink-0 pt-0.5">
              {String(i + 1).padStart(2, '0')}
            </span>
            <IncludeItem item={item} />
          </li>
        ))}
      </ul>

      {pkg.note && (
        <p className="mt-5 pt-4 border-t border-white/8 text-[10px] font-light text-white/45 leading-relaxed italic">
          Note: {pkg.note}
        </p>
      )}

      {pkg.bookVariants && pkg.bookVariants.length > 0 ? (
        <div className="mt-6 space-y-2">
          {pkg.bookVariants.map((variant) => (
            <Button
              key={variant.id}
              nativeButton={false}
              render={<Link href={getBookingUrl(variant.id)} />}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'w-full rounded-none border-white/25 bg-transparent hover:bg-white/10 text-white text-[9px] md:text-[10px] font-bold tracking-[0.12em] uppercase h-10',
              )}
            >
              {variant.label}
            </Button>
          ))}
        </div>
      ) : (
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
      )}
    </motion.div>
  )
}

function PackageGrid({ packages, singleColumn }: { packages: SelfPortraitPackage[]; singleColumn?: boolean }) {
  return (
    <div className={cn('grid gap-5 md:gap-7', singleColumn ? 'max-w-xl mx-auto' : 'sm:grid-cols-2')}>
      {packages.map((pkg, index) => (
        <PackageCard key={pkg.id} pkg={pkg} index={index} />
      ))}
    </div>
  )
}

function PackageSection({
  label,
  title,
  ladder,
  packages,
  className,
  singleColumn,
}: {
  label: string
  title: string
  ladder: string
  packages: SelfPortraitPackage[]
  className?: string
  singleColumn?: boolean
}) {
  return (
    <div className={cn('mb-16 md:mb-20 last:mb-0', className)}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="text-center mb-8 md:mb-10"
      >
        <p className="text-[9px] md:text-[10px] font-light tracking-[0.4em] uppercase text-white/40 mb-3">
          {label}
        </p>
        <h2 className="text-xl md:text-2xl font-normal tracking-[0.14em] uppercase text-white">
          {title}
        </h2>
        <p className="mt-3 text-[10px] md:text-[11px] font-light text-white/70 tracking-[0.08em]">
          {ladder}
        </p>
      </motion.div>

      <PackageGrid packages={packages} singleColumn={singleColumn} />
    </div>
  )
}

type Tab = 'fico' | 'mana' | 'creative'

export default function SelfPortraitPackages({ showBackLink = true }: { showBackLink?: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>('fico')

  return (
    <section
      id="self-portrait-packages"
      className="relative py-16 md:py-24 overflow-hidden bg-black"
      style={{ fontFamily: 'var(--font-aileron)' }}
    >
      <Image
        src="/bg_package.jpg"
        alt=""
        fill
        className="object-cover object-center opacity-[0.12]"
        priority={false}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-10 md:mb-12"
        >
          <p className="text-[9px] md:text-[10px] font-light tracking-[0.4em] uppercase text-white/40 mb-3">
            Self Portrait Studio
          </p>
          <h1 className="text-2xl md:text-3xl font-normal tracking-[0.14em] uppercase text-white">
            More Packages
          </h1>
          <p className="mt-4 text-[11px] md:text-xs font-light text-white/50 tracking-[0.06em] max-w-lg mx-auto leading-relaxed">
            Solo, duo, family, and barkada sessions — choose the package that fits your shoot.
          </p>
        </motion.div>

        {/* Mobile tabs */}
        <div className="flex md:hidden justify-center gap-2 mb-8 flex-wrap">
          {(
            [
              { id: 'fico' as const, label: 'FICO', sub: 'Solo & Duo' },
              { id: 'mana' as const, label: 'MANA', sub: 'Family & Barkada' },
              { id: 'creative' as const, label: 'CREATIVE', sub: 'Premium' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 max-w-[160px] py-3 px-4 border transition-colors',
                activeTab === tab.id
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/12 bg-transparent text-white/50',
              )}
            >
              <span className="block text-[11px] font-semibold tracking-[0.18em] uppercase">
                {tab.label}
              </span>
              <span className="block mt-1 text-[8px] font-light tracking-[0.1em] uppercase">
                {tab.sub}
              </span>
            </button>
          ))}
        </div>

        {/* Mobile: tabbed view */}
        <div className="md:hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'fico' ? (
              <motion.div
                key="fico"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
              >
                <PackageSection
                  label="Solo & Duo"
                  title="FICO Packages"
                  ladder="Digital only → All photos → Prints included"
                  packages={ficoPackages}
                  className="mb-0"
                />
              </motion.div>
            ) : activeTab === 'mana' ? (
              <motion.div
                key="mana"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <PackageSection
                  label="Group Sessions"
                  title="MANA Packages"
                  ladder="Digital only → All photos → Prints included"
                  packages={manaPackages}
                  className="mb-0"
                />
              </motion.div>
            ) : (
              <motion.div
                key="creative"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <PackageSection
                  label="Premium Studio"
                  title="Creative Package"
                  ladder="Light effects · curtain · creative direction · full RAW delivery"
                  packages={creativePackages}
                  className="mb-0"
                  singleColumn
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop: both sections */}
        <div className="hidden md:block">
          <PackageSection
            label="Solo & Duo"
            title="FICO Packages"
            ladder="Digital only → All photos → Prints included"
            packages={ficoPackages}
          />
          <PackageSection
            label="Group Sessions"
            title="MANA Packages"
            ladder="Digital only → All photos → Prints included"
            packages={manaPackages}
          />
          <PackageSection
            label="Premium Studio"
            title="Creative Package"
            ladder="Light effects · curtain · creative direction · full RAW delivery"
            packages={creativePackages}
            singleColumn
          />
        </div>

        {showBackLink ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="mt-14 md:mt-16 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              nativeButton={false}
              render={<Link href="/#booking" />}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'rounded-none bg-[#0500D0] hover:bg-[#03008F] text-[10px] md:text-[11px] font-bold tracking-[0.18em] uppercase h-11 md:h-12 px-8 w-full sm:w-auto',
              )}
            >
              Book a Session
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/#pricing" />}
              variant="outline"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'rounded-none border-white/40 bg-transparent text-white hover:bg-white/10 text-[10px] md:text-[11px] font-bold tracking-[0.18em] uppercase h-11 md:h-12 px-8 w-full sm:w-auto',
              )}
            >
              Graduation Packages
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="mt-14 md:mt-16 text-center"
          >
            <Button
              nativeButton={false}
              render={<Link href="/#booking" />}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'rounded-none bg-[#0500D0] hover:bg-[#03008F] text-[10px] md:text-[11px] font-bold tracking-[0.18em] uppercase h-11 md:h-12 px-8',
              )}
            >
              Book a Session
            </Button>
          </motion.div>
        )}
      </div>
    </section>
  )
}
