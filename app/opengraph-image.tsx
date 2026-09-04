import { ImageResponse } from 'next/og'

export const alt = 'FICO MANA Studio — The Portrait of Success'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'linear-gradient(115deg, #142119 0%, #1c2e22 48%, #31513c 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            width: 520,
            height: 520,
            right: -80,
            top: -120,
            display: 'flex',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 360,
            height: 360,
            right: 80,
            bottom: -150,
            display: 'flex',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.045)',
            border: '1px solid rgba(255,255,255,0.08)',
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
              <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, letterSpacing: '0.18em' }}>
                FICO MANA
              </div>
              <div style={{ display: 'flex', fontSize: 10, fontWeight: 600, letterSpacing: '0.42em', opacity: 0.62 }}>
                STUDIO
              </div>
            </div>
            <div style={{ display: 'flex', fontSize: 12, letterSpacing: '0.16em', opacity: 0.72 }}>
              WWW.FICOMANA.COM
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', width: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: 22 }}>
              <div style={{ display: 'flex', width: 54, height: 1, background: 'rgba(255,255,255,0.58)' }} />
              <div style={{ display: 'flex', fontSize: 12, fontWeight: 600, letterSpacing: '0.32em', opacity: 0.65 }}>
                SELF PORTRAIT STUDIO
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 19,
              }}
            >
              The Portrait of Success
            </div>

            <div
              style={{
                display: 'flex',
                maxWidth: 690,
                fontFamily: 'Georgia, Times New Roman, serif',
                fontSize: 42,
                lineHeight: 1.08,
                fontStyle: 'italic',
                marginBottom: 32,
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
                CABUYAO, LAGUNA
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
