# Homepage social preview

## Delivery contract

- Preferred homepage: `https://www.ficomana.com/`.
- Static image: `https://www.ficomana.com/social/ficomana-homepage-v4.jpg`.
- JPEG, sRGB, opaque, 1200 x 630, 78,749 bytes. Exported from the existing
  `public/preview.png` homepage screenshot. The entire screenshot is retained;
  narrow background bands accommodate the required ratio without clipping text.
- The original screenshot and legacy dynamic image route remain available for
  old references. Neither is selected by the new metadata.
- Root metadata includes all requested Open Graph image properties and an X
  `summary_large_image` card. Homepage canonical is page-scoped, so it is not
  inherited as the canonical for private/client routes.
- Metadata URLs use the canonical public domain independently of local/preview
  environment settings. Business links and authentication URL helpers are unchanged.
- Next serializes origin-only canonical and `og:url` values without a terminal
  slash. They match exactly and normalize to `https://www.ficomana.com/`. Global
  trailing-slash routing was deliberately not changed.
- The versioned social directory receives `public, max-age=31536000, immutable`.
  Never overwrite a published card: export a new filename and update metadata.
- The card is a committed public file: no runtime rendering, remote fetch,
  database, storage grant, cookie or image-optimization route is needed to serve it.

## Findings before the change

Read-only production requests on 2026-09-07 found:

- `https://ficomana.com/` already returned 308 to the preferred www homepage.
- The www homepage and previous image returned 200 for a request using the
  Facebook crawler user agent. No authentication cookie was required.
- The previous image was `preview.png?v=2`, 1891 x 900, 2,010,933 bytes.
- Basic Open Graph tags existed in initial HTML, but there was no homepage
  canonical tag, secure image URL, image width or image height.
- `robots.txt` allowed the public homepage/image; its private/API exclusions are
  unchanged. Public paths return before session/database work in middleware.
- Existing CSP, framing protection, HSTS, private API cache rules and access
  controls are unchanged. A crawler user-agent string does not bypass security.
- Production's working apex redirect was retained instead of adding a redundant
  redirect or changing the deployment architecture.

These findings identify fixable delivery weaknesses, not a proven sole cause of
Messenger's inconsistent rendering. No Meta-origin IP/server log correlation or
account-specific Messenger behavior was available during implementation.

## Verification commands

```sh
pnpm social:export
node --test tests/social-preview.test.ts
pnpm build
pnpm social:check
# Against a running local production build (metadata still points to production):
pnpm social:check http://127.0.0.1:4277
```

The read-only checker tests desktop/mobile and Facebook/Meta/X user agents,
initial HTML head tags, exact canonical/OG identity, GET and HEAD 200, absence of
redirects/cookies, image MIME/dimensions/hash/cache headers, robots, and the
production apex redirect with a tracking query. Passing simulated user agents
does not prove Meta's actual crawler network is allowed by a managed firewall.

## Meta and Messenger acceptance checks (manual)

1. Open [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/)
   while signed in. Enter exactly `https://www.ficomana.com/` and choose Debug,
   then Scrape Again after deployment.
2. Record the fresh scrape time, response code 200, canonical URL, correct image
   URL, 1200 x 630 dimensions, title and description. Also scrape the apex URL and
   confirm it resolves to the same object. Do not append cache-busting query
   strings to the shared homepage: that tests a different URL, not this fix.
3. Open the image directly in a signed-out browser. It must load immediately.
4. With the owner's chosen recipient/account, send the exact preferred homepage
   in a new Messenger conversation from a device/account that has not shared it
   before. Wait for the composer preview before sending. Check both sender and
   recipient displays and record device/app versions and screenshots.
5. If Debugger works but Messenger does not, distinguish an old message from a
   newly composed message; compare exact URL variants, app/device and network.
   Debugger success verifies a scrape, not every Messenger client's cached card
   or display policy. Correlate real crawler requests with Vercel security/request
   logs before changing firewall rules. Do not disable security globally.

The static versioned image avoids reusing a potentially cached old image URL;
the shared homepage URL remains stable. A re-scrape cannot guarantee retroactive
changes to old sent messages or force a particular Messenger card size.

`fb:app_id` is not part of the Open Graph protocol's required preview properties.
No fabricated application ID is added. Meta-specific application integrations
would need a real owner-provided ID; adding one is not a cache repair.

Primary references:

- [Open Graph required and structured image properties](https://ogp.me/)
- [Meta Sharing documentation](https://developers.facebook.com/docs/sharing/webmasters/)
- [Meta crawler documentation](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/)
- [Meta's Messenger encrypted-chat link preview feature announcement](https://about.fb.com/news/2023/01/expanding-features-for-end-to-end-encryption-on-messenger/amp/)

The Meta developer documentation returned rate-limit errors during research.
Browser control also timed out. Do not report the Debugger or fresh-device test
as passed without completing the manual checks above.
