'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu as MenuIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type NavLink = { href: string; label: string }
type NavDropdown = { label: string; links: NavLink[] }
type NavItem = NavLink | NavDropdown

function isDropdown(item: NavItem): item is NavDropdown {
  return 'links' in item
}

const navItems: NavItem[] = [
  { href: '/#home', label: 'Home' },
  {
    label: 'Explore',
    links: [
      { href: '/gallery', label: 'Gallery' },
      { href: '/#reels', label: 'Reels' },
    ],
  },
  {
    label: 'Packages',
    links: [
      { href: '/#pricing', label: 'Pricing' },
      { href: '/packages', label: 'All Packages' },
    ],
  },
  {
    label: 'About',
    links: [
      { href: '/#about', label: 'Our Story' },
      { href: '/#affiliations', label: 'Schools' },
    ],
  },
  { href: '/#contact', label: 'Contact' },
]

function NavAnchor({ href, label, className }: { href: string; label: string; className: string }) {
  return (
    <a href={href} className={cn(className, 'group/nav relative')}>
      <span className="relative inline-block">
        {label}
        <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-white transition-all duration-300 ease-out group-hover/nav:w-full group-hover/nav:shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
      </span>
    </a>
  )
}

function NavDropdownMenu({
  label,
  links,
  linkClass,
}: {
  label: string
  links: NavLink[]
  linkClass: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          linkClass,
          'group/trigger relative inline-flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0 outline-none',
        )}
      >
        <span className="relative inline-block">
          {label}
          <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-white transition-all duration-300 ease-out group-hover/trigger:w-full group-aria-expanded/trigger:w-full group-aria-expanded/trigger:shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
        </span>
        <ChevronDown
          className={cn(
            'size-3 opacity-50 transition-all duration-300 ease-out group-hover/trigger:opacity-90',
            open && 'rotate-180 opacity-100',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-full z-[100] -translate-x-1/2 pt-3"
            role="menu"
          >
            <div className="min-w-[12.5rem] overflow-hidden border border-white/10 bg-gradient-to-b from-[#222222]/98 to-black/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)_inset] py-2">
              <div className="mx-3 mb-2 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="relative mx-1.5 block rounded-sm px-3.5 py-2.5 text-[10px] tracking-[0.16em] uppercase text-white/65 outline-none transition-all duration-200 ease-out before:absolute before:left-0 before:top-1/2 before:h-0 before:w-0.5 before:-translate-y-1/2 before:bg-primary before:opacity-0 before:transition-all before:duration-200 hover:bg-white/[0.07] hover:pl-4 hover:text-white hover:before:h-3.5 hover:before:opacity-100"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  const [isScrolled, setIsScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  const goHome = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setOpen(false)
    if (pathname === '/') {
      e.preventDefault()
      const home = document.getElementById('home')
      if (home) {
        home.scrollIntoView({ behavior: 'smooth' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30)
    }
    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const linkClass = (mobile = false) =>
    cn(
      'font-semibold uppercase transition-colors duration-300 ease-out',
      mobile
        ? 'text-sm tracking-[0.15em] text-white/85 hover:text-white py-3 border-b border-white/[0.08] w-full text-left'
        : 'text-[10px] tracking-[0.2em]',
      !mobile &&
        (isScrolled
          ? 'text-white/75 hover:text-white'
          : 'text-white/90 hover:text-white'),
    )

  const bookButtonClass = cn(
    'inline-flex shrink-0 items-center justify-center rounded-none text-[9px] sm:text-xs md:text-sm font-semibold tracking-[0.14em] sm:tracking-[0.2em] uppercase h-9 sm:h-10 md:h-12 px-3 sm:px-6 md:px-8 transition-all duration-300',
    'hidden md:inline-flex',
    isScrolled
      ? 'bg-white text-black hover:bg-white/90'
      : 'bg-white text-black hover:bg-white/90',
  )

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] px-4 sm:px-6 md:px-12 lg:px-16 pb-2 sm:pb-3 pt-2 sm:pt-[max(0.625rem,env(safe-area-inset-top,0px))] transition-[background-color,backdrop-filter,box-shadow,border-color] duration-500 ease-out',
        isScrolled
          ? 'bg-black/90 backdrop-blur-xl border-b border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.35)]'
          : 'bg-transparent border-b border-transparent',
      )}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4">
        <Link
          href="/"
          onClick={goHome}
          className={cn(
            'flex items-center shrink-0 py-1 cursor-pointer transition-opacity duration-300 hover:opacity-90',
            open && 'opacity-35',
          )}
          aria-label="FICO MANA — Home"
        >
          <Image
            src="/fico_navbar.png?v=3"
            alt="Fico Mana studio"
            width={410}
            height={292}
            className="h-10 w-auto sm:h-12 md:h-14 object-contain object-left"
            priority
          />
        </Link>

        <div className="hidden md:flex items-center justify-center gap-6 lg:gap-8">
          {navItems.map((item) =>
            isDropdown(item) ? (
              <NavDropdownMenu
                key={item.label}
                label={item.label}
                links={item.links}
                linkClass={linkClass()}
              />
            ) : (
              <NavAnchor key={item.href} href={item.href} label={item.label} className={linkClass()} />
            ),
          )}
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <Link href="/#booking" className={bookButtonClass}>
            Book Session
          </Link>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className={cn(
                    'md:hidden rounded-none border transition-all duration-300',
                    open && 'hidden',
                    isScrolled
                      ? 'border-white/25 bg-white/[0.06] text-white hover:bg-white/12 hover:border-white/40'
                      : 'border-white/35 bg-black/25 text-white hover:bg-black/40 hover:border-white/55 backdrop-blur-sm',
                  )}
                />
              }
            >
              <MenuIcon className="size-4" strokeWidth={2.25} />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent
              side="right"
              overlayClassName="bg-black/80 backdrop-blur-md supports-backdrop-filter:backdrop-blur-md"
              className="w-[min(100vw-2rem,20rem)] sm:max-w-xs border-l border-white/10 bg-gradient-to-b from-[#1c1c1c] via-[#141414] to-black text-white shadow-[-12px_0_40px_rgba(0,0,0,0.55)] gap-0 p-0"
            >
              <SheetHeader className="shrink-0 border-b border-white/[0.08] px-4 pt-4 pb-4">
                <SheetTitle className="text-left text-[10px] tracking-[0.28em] uppercase text-white/75 font-semibold">
                  Navigation
                </SheetTitle>
              </SheetHeader>
              <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
                <AnimatePresence>
                  {open &&
                    navItems.map((item, index) => (
                      <motion.div
                        key={isDropdown(item) ? item.label : item.href}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{
                          delay: index * 0.045,
                          duration: 0.35,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        {isDropdown(item) ? (
                          <div className="flex flex-col border-b border-white/[0.08] pb-2 mb-1">
                            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white pt-3 pb-2">
                              {item.label}
                            </p>
                            {item.links.map((link) => (
                              <SheetClose
                                key={link.href}
                                render={
                                  <Link
                                    href={link.href}
                                    className={cn(
                                      linkClass(true),
                                      'pl-3 border-l-2 border-transparent hover:border-primary/70 hover:bg-white/[0.04] whitespace-nowrap',
                                    )}
                                  />
                                }
                              >
                                {link.label}
                              </SheetClose>
                            ))}
                          </div>
                        ) : (
                          <SheetClose
                            render={
                              <Link
                                href={item.href}
                                className={cn(linkClass(true), 'hover:bg-white/[0.04]')}
                              />
                            }
                          >
                            {item.label}
                          </SheetClose>
                        )}
                      </motion.div>
                    ))}
                </AnimatePresence>
              </nav>
              <div className="shrink-0 border-t border-white/[0.08] bg-black px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
                <SheetClose
                  render={
                    <Link
                      href="/#booking"
                      className="flex w-full items-center justify-center rounded-none bg-white px-4 py-3 text-sm font-bold tracking-[0.16em] uppercase text-black transition-colors hover:bg-white/90"
                    >
                      Book Session
                    </Link>
                  }
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.nav>
  )
}
