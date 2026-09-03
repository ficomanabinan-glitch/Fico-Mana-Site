'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Mail, ArrowUpRight } from 'lucide-react'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z" />
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.59 4.23.82.96 1.93 1.66 3.16 2.05.02 1.33.01 2.66.02 4-.98-.05-1.94-.35-2.8-.83-.8-.44-1.49-1.07-2-1.84v6.23c.04 1.35-.3 2.72-1.02 3.86-.88 1.33-2.3 2.27-3.88 2.58-1.57.34-3.26.13-4.7-.58-1.5-.72-2.73-2.02-3.37-3.62-.64-1.57-.61-3.37.07-4.92.68-1.58 2.02-2.84 3.65-3.48.96-.39 2-.54 3.03-.45v4.06c-.7-.14-1.46-.02-2.09.31-.67.33-1.19.95-1.41 1.67-.28.84-.13 1.79.39 2.49.52.71 1.36 1.12 2.24 1.12.87 0 1.69-.41 2.19-1.12.35-.5.5-1.12.47-1.74V.02z" />
    </svg>
  )
}

const contactMethods = [
  {
    icon: FacebookIcon,
    label: 'Facebook',
    value: 'FICOMANA',
    href: 'https://www.facebook.com/FICOMANA',
  },
  {
    icon: InstagramIcon,
    label: 'Instagram',
    value: '@ficomanastudio',
    href: 'https://www.instagram.com/ficomanastudio/',
  },
  {
    icon: TikTokIcon,
    label: 'TikTok',
    value: '@ficomanastudio',
    href: 'https://www.tiktok.com/@ficomanastudio?_r=1',
  },
  {
    icon: Mail,
    label: 'Email',
    value: 'ficomanaph@gmail.com',
    href: 'mailto:ficomanaph@gmail.com',
  },
]

export default function Contact() {
  return (
    <SectionShell id="contact" variant="gradient">
      <div className="grid lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
        <div>
          <SectionHeader
            eyebrow="Get In Touch"
            title="Ready to Create?"
            description="Connect with us and let's bring your vision to life."
          />

          <div className="grid sm:grid-cols-2 gap-4">
            {contactMethods.map((method, index) => {
              const Icon = method.icon
              return (
                <motion.a
                  key={index}
                  href={method.href}
                  target={method.href.startsWith('mailto:') ? undefined : '_blank'}
                  rel={method.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  viewport={{ once: true }}
                  className="group flex items-center gap-4 p-5 bg-white/[0.03] border border-white/10 hover:border-white/30 transition-all duration-300"
                >
                  <div className="w-10 h-10 flex items-center justify-center bg-white/10 border border-white/20 shrink-0">
                    <Icon className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-medium tracking-[0.2em] uppercase text-white/60 mb-1">
                      {method.label}
                    </p>
                    <p className="font-medium text-sm truncate text-white">{method.value}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-white/40 group-hover:text-white shrink-0" />
                </motion.a>
              )
            })}
          </div>

          <a
            href="#booking"
            className="inline-flex mt-8 items-center justify-center bg-primary text-primary-foreground px-10 py-3.5 text-xs font-bold tracking-[0.18em] uppercase hover:bg-[#03008F] transition-colors"
          >
            Book Now
          </a>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="relative aspect-[4/3] overflow-hidden border border-white/10"
        >
          <Image
            src="/retail_bg.jpg"
            alt="Cabuyao Retail Plaza — FICO MANA Studio location"
            fill
            className="object-cover object-center"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6">
            <p className="text-[10px] tracking-[0.25em] uppercase text-white/70 mb-1">Visit Us</p>
            <p className="text-sm text-white font-medium">Cabuyao Retail Plaza, Laguna</p>
          </div>
        </motion.div>
      </div>
    </SectionShell>
  )
}
