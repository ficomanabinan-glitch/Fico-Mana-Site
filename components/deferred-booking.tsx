'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import ReceiptUploadEnhancer from '@/components/receipt-upload-enhancer'

const Booking = dynamic(() => import('@/components/booking'), {
  ssr: false,
  loading: () => <BookingPlaceholder />,
})
const BookingResubmit = dynamic(() => import('@/components/booking-resubmit'), {
  ssr: false,
  loading: () => null,
})

export default function DeferredBooking() {
  const boundary = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const element = boundary.current
    if (!element || mounted) return
    const show = () => setMounted(true)
    if (!('IntersectionObserver' in window)) {
      show()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          show()
          observer.disconnect()
        }
      },
      { rootMargin: '800px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [mounted])

  return (
    <div ref={boundary} id={mounted ? undefined : 'booking'}>
      {mounted ? (
        <>
          <Booking />
          <BookingResubmit />
          <ReceiptUploadEnhancer />
        </>
      ) : (
        <BookingPlaceholder />
      )}
    </div>
  )
}

function BookingPlaceholder() {
  return <div className="min-h-4 bg-black" aria-hidden="true" />
}
