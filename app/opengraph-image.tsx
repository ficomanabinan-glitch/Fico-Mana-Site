import { ImageResponse } from 'next/og'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export const alt = 'FICO MANA Studio — The Portrait of Success'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  const heroImage = `${CANONICAL_SITE_URL}/model/model_2.jpg`

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#1c2e22',
          color: '#ffffff',
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <img
          src={heroImage}
          alt=""
          width="1200"
          height="630"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.58) 42%, rgba(0,0,0,0.12) 74%, rgba(0,0,0,0.06) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 45%)',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '46px 58px 48px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ fontSize: 29, fontWeight: 700, letterSpacing: '0.18em' }}>FICO MANA</div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.42em', opacity: 0.62 }}>
                STUDIO
              </div>
            </div>
            <div style={{ display: 'flex', gap: '30px', fontSize: 11, letterSpacing: '0.16em', opacity: 0.72 }}>
              <span>GALLERY</span>
              <span>PACKAGES</span>
              <span>BOOK A SESSION</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', width: 650 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: 22 }}>
              <div style={{ display: 'flex', width: 54, height: 1, background: 'rgba(255,255,255,0.58)' }} />
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.32em', opacity: 0.65 }}>
                SELF PORTRAIT STUDIO
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 31,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                marginBottom: 19,
                textShadow: '0 3px 18px rgba(0,0,0,0.45)',
              }}
            >
              The Portrait of Success
            </div>

            <div
              style={{
                display: 'flex',
                maxWidth: 620,
                fontFamily: 'Georgia, Times New Roman, serif',
                fontSize: 38,
                lineHeight: 1.12,
                fontStyle: 'italic',
                marginBottom: 30,
                textShadow: '0 3px 18px rgba(0,0,0,0.42)',
              }}
            >
              Creating Visuals That Celebrate Every Story
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 48,
                  padding: '0 30px',
                  background: '#ffffff',
                  color: '#050505',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                }}
              >
                RESERVE YOUR SESSION
              </div>
              <div style={{ display: 'flex', fontSize: 12, letterSpacing: '0.12em', opacity: 0.78 }}>
                www.ficomana.com
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
