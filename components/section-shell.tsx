import { cn } from '@/lib/utils'

type SectionVariant = 'base' | 'gradient' | 'elevated' | 'blue-glow'

const variantClasses: Record<SectionVariant, string> = {
  base: 'bg-black',
  gradient: 'bg-gradient-to-b from-[#0500D0]/25 via-black to-black',
  elevated: 'bg-gradient-to-b from-black via-[#222222] to-black',
  'blue-glow': 'bg-gradient-to-br from-[#0500D0]/15 via-black to-black',
}

export default function SectionShell({
  id,
  variant = 'base',
  className,
  children,
}: {
  id?: string
  variant?: SectionVariant
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative py-16 sm:py-20 md:py-28 px-4 sm:px-6 md:px-12 border-t border-white/6 overflow-hidden',
        variantClasses[variant],
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(5,0,208,0.12),transparent_55%)]" />
      <div className="relative z-10 max-w-7xl mx-auto">{children}</div>
    </section>
  )
}
