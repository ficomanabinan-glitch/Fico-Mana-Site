# Fico Mana Vercel Firewall rollout

These rules supplement the server-side limits in the application. They do not
replace authentication, authorization, Supabase RLS, or application rate limits.

Link the correct Vercel project first, then stage non-blocking log rules:

```sh
vercel link
vercel firewall overview

vercel firewall rules add "Log auth automation" \
  --condition '{"type":"path","op":"pre","value":"/auth/"}' \
  --action log --yes

vercel firewall rules add "Log booking write spikes" \
  --condition '{"type":"path","op":"eq","value":"/api/bookings"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action log --yes

vercel firewall rules add "Log receipt and RAW upload spikes" \
  --condition '{"type":"path","op":"pre","value":"/api/receipts/"}' \
  --or \
  --condition '{"type":"path","op":"pre","value":"/api/bookings/submit-raw-photo"}' \
  --action log --yes

vercel firewall rules add "Log portal and editor API spikes" \
  --condition '{"type":"path","op":"pre","value":"/api/portal/"}' \
  --or \
  --condition '{"type":"path","op":"pre","value":"/api/editor-workflow/"}' \
  --action log --yes

vercel firewall diff
```

Do not publish these as blocking rules immediately. Publish the log-only draft
yourself with `vercel firewall publish --yes`, observe legitimate production
traffic for at least several days, and verify mobile clients, staff uploads,
Google callbacks, and search crawlers are not misclassified.

After measuring normal traffic, create or edit targeted rate-limit rules. Start
at 5–10 times the observed legitimate peak and keep the exceeded action in log
mode during tuning. Example for booking writes:

```sh
vercel firewall rules add "Rate limit booking writes" \
  --condition '{"type":"path","op":"eq","value":"/api/bookings"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 30 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes

vercel firewall diff
```

Only after reviewing the Firewall Traffic dashboard should the owner change the
exceeded action to `rate_limit` or `challenge` and publish it. Vercel counters
are regional, so the application’s distributed limiter remains authoritative.

For emergency attacks, use Vercel Attack Mode from the dashboard or CLI. That
is an immediate production change and should be enabled only by the owner.
