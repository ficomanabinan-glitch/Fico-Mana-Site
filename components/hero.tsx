'use client'

import { useWebsiteContent } from '@/lib/website-content-client'

import { motion, useScroll, useTransform } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ease = [0.22, 1, 0.36, 1] as const

export default function Hero() {
  const { copy } = useWebsiteContent()
  const { scrollY } = useScroll()
  const contentY = useTransform(scrollY, [0, 600], [0, 40])
  const contentOpacity = useTransform(scrollY, [0, 400], [1, 0.3])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.35 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.9, ease },
    },
  }

  return (
    <section
      id="home"
      className="relative h-[100svh] min-h-[100svh] w-full overflow-hidden bg-[#1c2e22] sm:h-auto sm:min-h-screen sm:min-h-[100dvh] sm:bg-black"
    >
      {/* One responsive image avoids downloading separate hidden mobile and desktop copies. */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/model/model_2.jpg"
          alt="Graduation portrait at FICO MANA Studio"
          fill
          className="object-cover object-center brightness-[1.08] contrast-[1.04] sm:brightness-[1.1]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent sm:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/75 via-black/45 to-transparent sm:block" />
        <div className="absolute inset-0 hidden bg-gradient-to-t from-black/80 via-transparent to-transparent sm:block md:from-black/70" />
        <div className="absolute inset-0 hidden bg-gradient-to-t from-black/25 to-black/40 sm:block" />
      </div>

      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 flex h-full min-h-[100svh] flex-col justify-end px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-20 sm:min-h-[100dvh] sm:items-start sm:justify-start sm:px-6 sm:pb-12 sm:pt-32 md:px-12 md:pb-14 md:pt-40 lg:px-16 xl:px-20"
      >
        {/* One semantic headline shared across both responsive layouts. */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex w-full flex-col items-start text-left sm:max-w-md md:max-w-2xl"
        >
          <motion.div variants={itemVariants} className="mb-5 hidden items-center gap-3 sm:flex md:mb-6">
            <span className="h-px w-14 bg-gradient-to-r from-white/70 to-white/0" />
            <span className="text-caption font-semibold uppercase tracking-label text-white/50" style={{ fontFamily: 'var(--font-neue)' }}>
              {copy.heroTagline}
            </span>
          </motion.div>
          <motion.h1
            variants={itemVariants}
            className="mb-4 max-w-[15rem] text-[12px] font-bold uppercase leading-[1.5] tracking-label text-white sm:mb-5 sm:max-w-none sm:text-lg sm:font-semibold sm:drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] md:text-xl lg:text-2xl"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {copy.heroTitle}
          </motion.h1>

          <motion.div variants={itemVariants} className="flex w-full flex-col items-start gap-3 sm:hidden">
            <Button
              nativeButton={false}
              render={<Link href="#booking" />}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-11 w-full justify-center rounded-none bg-white px-4 text-caption font-semibold uppercase tracking-label text-black shadow-none transition-all duration-300 hover:bg-white/90',
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {copy.reserveLabel}
            </Button>
            <Link
              href="/gallery"
              className="w-full py-1 text-center text-caption font-semibold uppercase tracking-label text-white transition-colors hover:text-white/75"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {copy.galleryLabel}
            </Link>
          </motion.div>
          <motion.p
            variants={itemVariants}
            className="mb-8 hidden text-xl font-normal italic leading-snug text-white/95 sm:block md:mb-10 md:text-[1.75rem] lg:text-3xl"
            style={{ fontFamily: "'Times New Roman', Times, serif" }}
          >
            {copy.heroDescription}
          </motion.p>

          <motion.div variants={itemVariants} className="hidden w-auto flex-row gap-4 sm:flex">
            <Button
              nativeButton={false}
              render={<Link href="#booking" />}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-12 w-auto rounded-none bg-white px-8 text-caption font-semibold uppercase tracking-label text-black transition-all duration-300 hover:bg-white/90',
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {copy.reserveLabel}
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/gallery" />}
              variant="outline"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-12 w-auto rounded-none border-white/40 bg-black/20 px-8 text-caption font-semibold uppercase tracking-label text-white backdrop-blur-sm transition-all duration-300 hover:border-white/70 hover:bg-white/10',
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {copy.galleryLabel}
            </Button>
          </motion.div>
        </motion.div>

        <motion.a
          href="#gallery"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 0.8, ease }}
          className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/40 transition-colors duration-300 hover:text-white/70 md:flex"
          aria-label="Scroll to gallery"
        >
          <span className="text-caption uppercase tracking-label" style={{ fontFamily: 'var(--font-neue)' }}>
            {copy.exploreLabel}
          </span>
          <motion.span
            className="block h-8 w-px bg-gradient-to-b from-white/50 to-transparent"
            animate={{ scaleY: [0.6, 1, 0.6], opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2.2, repeat: 2, ease: 'easeInOut' }}
          />
        </motion.a>
      </motion.div>
    </section>
  )
}
