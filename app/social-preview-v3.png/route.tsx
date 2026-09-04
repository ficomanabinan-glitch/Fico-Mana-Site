import { ImageResponse } from 'next/og'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

export const runtime = 'nodejs'

const HERO_IMAGE_URL = `${CANONICAL_SITE_URL}/model/model_2.jpg`
const FALLBACK_BACKGROUND = '#1c2e22'

export async function GET() {
  let heroImage: ArrayBuffer | null = null

  try {
    const response = await fetch(HERO_IMAGE_URL, {
      cache: 'force-cache',
      headers: {
        Accept: 'image/jpeg,image/*;q=0.8,*/*;q=0.5',
      },
    })

    if (response.ok) {
      heroImage = await response.arrayBuffer()
    }
  } catch {
    // Keep a branded fallback so the social image endpoint never fails entirely.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: FALLBACK_BACKGROUND,
          color: 'white',
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        {heroImage ? (
          <>
            <img
              src={heroImage as unknown as string}
              alt=""
              width={1200}
              height={630}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 38%',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, rgba(7,18,12,0.97) 0%, rgba(7,18,12,0.90) 43%, rgba(7,18,12,0.46) 67%, rgba(7,18,12,0.10) 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 145,
                background:
                  'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.48) 100%)',
              }}
            />
          </>
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, rgba(8,22,14,0.98) 0%, rgba(8,22,14,0.92) 48%, rgba(8,22,14,0.72) 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: 340,
                height: 340,
                borderRadius: 999,
                right: -10,
                top: -40,
                background: 'rgba(255,255,255,0.05)',
              }}
            />
          </>
        )}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '58px 64px 52px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                letterSpacing: '0.24em',
                fontWeight: 700,
                fontSize: 25,
              }}
            >
              FICO MANA
              <span
                style={{
                  marginTop: 3,
                  fontSize: 8,
                  letterSpacing: '0.34em',
                  color: 'rgba(255,255,255,0.58)',
                }}
              >
                STUDIO
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 10,
                letterSpacing: '0.15em',
                color: 'rgba(255,255,255,0.60)',
              }}
            >
              WWW.FICOMANA.COM
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 'auto',
              marginBottom: 8,
              maxWidth: 610,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 20,
                fontSize: 11,
                letterSpacing: '0.28em',
                color: 'rgba(255,255,255,0.60)',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  width: 40,
                  height: 1,
                  background: 'rgba(255,255,255,0.55)',
                }}
              />
              SELF PORTRAIT STUDIO
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 26,
                letterSpacing: '0.13em',
                fontWeight: 700,
                marginBottom: 15,
              }}
            >
              THE PORTRAIT OF SUCCESS
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 38,
                lineHeight: 1.08,
                fontWeight: 400,
                maxWidth: 590,
              }}
            >
              Creating Visuals That Celebrate Every Story
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                marginTop: 26,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 38,
                  padding: '0 24px',
                  background: 'white',
                  color: '#111',
                  fontSize: 9,
                  letterSpacing: '0.12em',
                  fontWeight: 700,
                }}
              >
                RESERVE YOUR SESSION
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 9,
                  letterSpacing: '0.15em',
                  color: 'rgba(255,255,255,0.68)',
                }}
              >
                CABUYAO, LAGUNA
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control':
          'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    },
  )
}
