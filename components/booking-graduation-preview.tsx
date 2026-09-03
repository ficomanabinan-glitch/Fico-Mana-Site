'use client'

import Image from 'next/image'

/** Full reference photo — shown uncropped so hood / toga / tassel labels stay visible. */
const SOURCE_IMAGE = '/booking_model1.jpg'

export default function BookingGraduationPreview() {
  return (
    <div className="w-full max-w-md mx-auto md:max-w-none border border-white/10 bg-black">
      <Image
        src={SOURCE_IMAGE}
        alt="Graduation attire reference — available hood, toga, and tassel styles"
        width={900}
        height={1200}
        className="block h-auto w-full"
        sizes="(max-width: 768px) 90vw, 480px"
        priority
      />
    </div>
  )
}
