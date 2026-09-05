'use client'

import { useEffect, useState } from 'react'
import { bookingPackages, type BookingPackage } from '@/lib/booking-packages'
import { getBookingPackages } from '@/lib/data-store'

export function usePublicPackages() {
  const [packages, setPackages] = useState<BookingPackage[]>(bookingPackages)

  useEffect(() => {
    let active = true
    getBookingPackages()
      .then((items) => {
        if (active) setPackages(items)
      })
      .catch((error) => {
        console.error('Public package catalog failed to load:', error)
        if (active) setPackages([])
      })
    return () => {
      active = false
    }
  }, [])

  return packages
}
