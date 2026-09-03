'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ease = [0.22, 1, 0.36, 1] as const

export default function Hero() {
  const { scrollY } = useScroll()
  const imageY = useTransform(scrollY, [0, 600], [0, 80])
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
    hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.9, ease },
    },
  }

  return (
    <section
      id="home"
      className="relative h-[100svh] min-h-[100svh] w-full overflow-hidden bg-[#1c2e22] sm:h-auto sm:min-h-screen sm:min-h-[100dvh] sm:bg-black"
    >
      {/* Mobile: static cover (no parallax) so the photo fills edge-to-edge with no top gap */}
      <div className="absolute inset-0 z-0 sm:hidden">
        <Image
          src="/model/model_2.jpg"
          alt="Graduation portrait at FICO MANA Studio"
          fill
          className="object-cover object-center brightness-[1.08] contrast-[1.04]"
          priority
          quality={95}
          sizes="100vw"
        />
        {/* Darken only the bottom for text/CTAs — keep the top of the photo clean */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      </div>

      {/* Desktop / tablet: parallax image */}
      <motion.div className="absolute inset-0 z-0 hidden sm:block" style={{ y: imageY }}>
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          transition={{ duration: 14, ease: 'easeOut' }}
        >
          <Image
            src="/model/model_2.jpg"
            alt="Graduation portrait at FICO MANA Studio"
            fill
            className="object-cover object-center brightness-[1.1] contrast-[1.04]"
            priority
            quality={95}
            sizes="100vw"
          />
        </motion.div>

        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent md:from-black/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-black/40" />
      </motion.div>

      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 flex h-full min-h-[100svh] flex-col justify-end px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-20 sm:min-h-[100dvh] sm:items-start sm:justify-start sm:px-6 sm:pb-12 sm:pt-32 md:px-12 md:pb-14 md:pt-40 lg:px-16 xl:px-20"
      >
        {/* Mobile — keep headline + CTAs inside the visible frame */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex w-full flex-col items-start text-left sm:hidden"
        >
          <motion.p
            variants={itemVariants}
            className="mb-4 max-w-[15rem] text-[12px] font-bold uppercase leading-[1.5] tracking-[0.2em] text-white"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            The Portrait of Success
          </motion.p>

          <motion.div variants={itemVariants} className="flex w-full flex-col items-start gap-3">
            <Button
              nativeButton={false}
              render={<Link href="#booking" />}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-11 w-full justify-center rounded-none bg-white px-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-black shadow-none transition-all duration-300 hover:bg-white/90',
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Reserve Your Session
            </Button>
            <Link
              href="/gallery"
              className="w-full py-1 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:text-white/75"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              View Gallery
            </Link>
          </motion.div>
        </motion.div>

        {/* Desktop */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="hidden w-full max-w-md flex-col items-start sm:flex md:max-w-2xl"
        >
          <motion.div variants={itemVariants} className="mb-5 flex items-center gap-3 md:mb-6">
            <span className="h-px w-10 bg-gradient-to-r from-white/70 to-white/0 sm:w-14" />
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.35em] text-white/50 sm:text-[10px]"
              style={{ fontFamily: 'var(--font-neue)' }}
            >
              Self Portrait Studio
            </span>
          </motion.div>

          <motion.p
            variants={itemVariants}
            className="mb-5 text-lg font-semibold uppercase tracking-[0.22em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] md:text-xl lg:text-2xl"
            style={{ fontFamily: 'var(--font-neue)' }}
          >
            <span className="text-white">The Portrait </span>
            <span className="text-white/90">of Success</span>
          </motion.p>

          <motion.p
            variants={itemVariants}
            className="mb-8 text-xl font-normal italic leading-snug text-white/95 md:mb-10 md:text-[1.75rem] lg:text-3xl"
            style={{ fontFamily: "'Times New Roman', Times, serif" }}
          >
            Creating Visuals That Celebrate Every Story
          </motion.p>

          <motion.div variants={itemVariants} className="flex w-auto flex-row gap-4">
            <Button
              nativeButton={false}
              render={<Link href="#booking" />}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-12 w-auto rounded-none bg-white px-8 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition-all duration-300 hover:bg-white/90',
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Reserve Your Session
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/gallery" />}
              variant="outline"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-12 w-auto rounded-none border-white/40 bg-black/20 px-8 text-[11px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm transition-all duration-300 hover:border-white/70 hover:bg-white/10',
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              View Gallery
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
          <span className="text-[9px] uppercase tracking-[0.3em]" style={{ fontFamily: 'var(--font-neue)' }}>
            Explore
          </span>
          <motion.span
            className="block h-8 w-px bg-gradient-to-b from-white/50 to-transparent"
            animate={{ scaleY: [0.6, 1, 0.6], opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.a>
      </motion.div>
    </section>
  )
}
