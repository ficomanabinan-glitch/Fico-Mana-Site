'use client'

import { motion } from 'framer-motion'
import { Volume2, VolumeX, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const REEL_VIDEO = '/breanna-reel.mp4'
const PLAY_LEAD_VH = 1.75
const PRELOAD_LEAD_VH = 2.5
const PAUSE_ABOVE_VH = 1.2

export default function Reels() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const shouldPlayRef = useRef(false)
  const hasLoadedRef = useRef(false)
  const preloadStartedRef = useRef(false)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    const section = sectionRef.current
    if (!video || !section) return

    video.loop = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.muted = true
    video.defaultMuted = true
    video.preload = 'auto'

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      video.load()
    }

    const showPreviewFrame = () => {
      if (video.paused && video.readyState >= 2 && video.currentTime === 0) {
        video.currentTime = 0.01
      }
    }

    const playVideo = () => {
      if (!shouldPlayRef.current) return
      video.muted = muted
      if (!video.paused) return
      void video
        .play()
        .then(() => setPlaying(true))
        .catch(() => {
          video.muted = true
          setMuted(true)
          void video
            .play()
            .then(() => setPlaying(true))
            .catch(showPreviewFrame)
        })
    }

    const pauseVideo = () => {
      if (video.paused) return
      video.pause()
      setPlaying(false)
    }

    const syncPlayback = () => {
      const { top, bottom } = section.getBoundingClientRect()
      const vh = window.innerHeight
      const playThreshold = vh * (1 + PLAY_LEAD_VH)
      const preloadThreshold = vh * (1 + PRELOAD_LEAD_VH)
      const pauseAboveThreshold = vh * PAUSE_ABOVE_VH

      if (top <= preloadThreshold && !preloadStartedRef.current) {
        preloadStartedRef.current = true
        video.load()
      }

      const wantsPlay = top <= playThreshold && bottom > 0
      const forcePause = bottom <= 0 || top > pauseAboveThreshold

      if (wantsPlay) {
        shouldPlayRef.current = true
      } else if (forcePause) {
        shouldPlayRef.current = false
      }

      if (shouldPlayRef.current) playVideo()
      else if (forcePause) pauseVideo()
    }

    const onVideoReady = () => {
      showPreviewFrame()
      if (shouldPlayRef.current) playVideo()
    }

    syncPlayback()

    video.addEventListener('loadeddata', onVideoReady)
    video.addEventListener('canplay', onVideoReady)
    video.addEventListener('canplaythrough', onVideoReady)

    const touchOpts = { passive: true, capture: true } as const
    window.addEventListener('touchstart', syncPlayback, touchOpts)
    window.addEventListener('touchmove', syncPlayback, touchOpts)
    window.addEventListener('scroll', syncPlayback, { passive: true })
    window.addEventListener('wheel', syncPlayback, { passive: true })
    window.addEventListener('resize', syncPlayback)

    const observer = new IntersectionObserver(() => syncPlayback(), {
      threshold: 0,
      rootMargin: `0px 0px ${Math.round(PLAY_LEAD_VH * 100)}% 0px`,
    })
    observer.observe(section)

    const retryTimers = [0, 50, 150, 300, 600].map((ms) => window.setTimeout(syncPlayback, ms))

    return () => {
      retryTimers.forEach((id) => window.clearTimeout(id))
      video.removeEventListener('loadeddata', onVideoReady)
      video.removeEventListener('canplay', onVideoReady)
      video.removeEventListener('canplaythrough', onVideoReady)
      window.removeEventListener('touchstart', syncPlayback, touchOpts)
      window.removeEventListener('touchmove', syncPlayback, touchOpts)
      window.removeEventListener('scroll', syncPlayback)
      window.removeEventListener('wheel', syncPlayback)
      window.removeEventListener('resize', syncPlayback)
      observer.disconnect()
      video.pause()
    }
  }, [muted])

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    const next = !muted
    setMuted(next)
    video.muted = next
    shouldPlayRef.current = true
    void video.play().then(() => setPlaying(true)).catch(() => {})
  }

  const tapToPlay = () => {
    const video = videoRef.current
    if (!video) return
    shouldPlayRef.current = true
    void video.play().then(() => setPlaying(true)).catch(() => {})
  }

  return (
    <section
      ref={sectionRef}
      id="reels"
      className="relative overflow-hidden bg-black border-t border-white/6 py-12 sm:py-16 md:py-20 lg:py-28 px-4 sm:px-6 md:px-8 lg:px-12"
    >
      <div className="max-w-7xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, margin: '-80px' }}
          className="relative w-[210px] sm:w-[250px] md:w-[290px] lg:w-[320px] xl:w-[340px]"
        >
          {/* Side buttons */}
          <div className="pointer-events-none absolute -left-[3px] top-[17%] z-30 h-7 w-[3px] rounded-l-sm bg-gradient-to-b from-zinc-500 to-zinc-700" />
          <div className="pointer-events-none absolute -left-[3px] top-[24%] z-30 h-11 w-[3px] rounded-l-sm bg-gradient-to-b from-zinc-500 to-zinc-700" />
          <div className="pointer-events-none absolute -left-[3px] top-[34%] z-30 h-11 w-[3px] rounded-l-sm bg-gradient-to-b from-zinc-500 to-zinc-700" />
          <div className="pointer-events-none absolute -right-[3px] top-[28%] z-30 h-14 w-[3px] rounded-r-sm bg-gradient-to-b from-zinc-500 to-zinc-700" />

          <div className="relative rounded-[2.65rem] sm:rounded-[2.9rem] md:rounded-[3.15rem] lg:rounded-[3.35rem] bg-gradient-to-b from-zinc-300 via-zinc-500 to-zinc-800 p-[2px] sm:p-[3px] shadow-[0_28px_70px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.35)]">
            <div className="overflow-hidden rounded-[2.55rem] sm:rounded-[2.8rem] md:rounded-[3.05rem] lg:rounded-[3.25rem] bg-black ring-1 ring-white/10">
              <div className="relative aspect-[9/19.5] bg-black">
                {/* Dynamic Island */}
                <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[78px] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] sm:top-3 sm:h-[24px] sm:w-[86px] md:h-[26px] md:w-[92px]" />

                <video
                  ref={videoRef}
                  src={REEL_VIDEO}
                  className="absolute inset-0 h-full w-full object-cover"
                  playsInline
                  loop
                  muted
                  preload="auto"
                  onClick={tapToPlay}
                />

                {!playing && (
                  <button
                    type="button"
                    onClick={tapToPlay}
                    className="absolute inset-0 z-10 flex items-center justify-center bg-black/25"
                    aria-label="Play reel"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black">
                      <Play className="ml-0.5 h-6 w-6 fill-current" />
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleMute}
                  className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                  aria-label={muted ? 'Unmute reel' : 'Mute reel'}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          viewport={{ once: true }}
          className="mt-8 sm:mt-10 md:mt-12 lg:mt-14 text-center px-4"
        >
          <h2
            className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-[0.05em] sm:tracking-[0.08em] uppercase text-white"
            style={{ fontFamily: 'var(--font-aileron)' }}
          >
            Graduation Shoot Reel
          </h2>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm md:text-base lg:text-lg font-light tracking-[0.25em] sm:tracking-[0.35em] uppercase text-white/80">
            Sample
          </p>
        </motion.div>
      </div>
    </section>
  )
}
