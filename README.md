# Easy with Aaryan: website & funnel

Everything is controlled from **`site.config.js`**. You never need to edit the HTML to change prices, links, tags or SEO.

```bash
node build.mjs            # build the site into dist/
node build.mjs --serve    # build + preview at http://localhost:8080
```

After building, upload the **contents of `dist/`** to your hosting — or use **GitHub Pages** (see below). The build lists anything still missing from the config.

## GitHub Pages (`courses.aryanlohia.com`)

Pushes to `main` run `.github/workflows/deploy-pages.yml` and publish `dist/` automatically.

**Custom domain DNS** (at your `aryanlohia.com` registrar):

| Type | Name / Host | Value |
|------|-------------|--------|
| `CNAME` | `courses` | `Aryan-Lohia.github.io` |

Then in the repo: **Settings → Pages → Custom domain** → `courses.aryanlohia.com` → Save → enable **Enforce HTTPS** once the certificate is ready.

**Note:** GitHub Pages is static only — `forms.mode: "relay"` (PHP) does not run here. Use `forms.mode: "direct"` or `"whatsapp"` in `site.config.js`, or keep form relay on PHP hosting elsewhere.

## Folder map

| Path | What it is |
|---|---|
| `site.config.js` | The one file you edit. **Never upload it**: it holds your webhook secret. |
| `src/pages/` | Page content. Headers, footers, SEO tags and structured data are added by the build. |
| `src/assets/` | CSS, JS, images, social share images, icons |
| `src/api/submit.php` | Form relay: signs and forwards form submissions to your webhook |
| `dist/` | The finished site (generated, so don't edit it) |

## Go-live checklist

1. **Domain:** set `site.url`.
2. **Payments:** there's no payment gateway. Every Book / Enrol / Apply button opens the application form (`/apply/?program=…`). You confirm the slot on WhatsApp and share UPI or bank details. Once paid, send the learner `https://YOUR-DOMAIN/thank-you/?program=growth&payment_id=<UPI ref>`, which handles booking and the needs assessment and records the purchase in analytics.
3. **Booking:** paste Calendly / Cal.com links into `programs.<name>.bookingLink`.
4. **Instagram:** set `contact.instagram` (the floating button appears automatically).
5. **Forms:** set `forms.webhookUrl` and `forms.webhookSecret` (see below).
6. **Tracking:** paste your GA4 / GTM / Meta Pixel / Clarity / Google Ads IDs into `tracking`.
7. **Search engines:** add the site in Google Search Console and Bing Webmaster Tools (verification codes go in `tracking`), then submit `https://YOUR-DOMAIN/sitemap.xml`.
8. **Testimonials:** send `/feedback/` to learners after each program, then copy approved quotes (where they ticked consent) into `testimonials`.

## Forms → webhook

All forms (application, contact, needs assessment, feedback) post to `/api/submit.php`, which:
- blocks other websites, bots (hidden honeypot field + too-fast submissions) and floods (8 per IP per 10 min)
- strips HTML and forwards clean JSON to `forms.webhookUrl`
- falls back to a pre-filled WhatsApp message if delivery fails

Payload:
```json
{
  "event": "form_submission",
  "form": "application",
  "submittedAt": "2026-10-23T09:30:00+00:00",
  "site": "https://www.easywithaaryan.com",
  "page": "/apply/",
  "data": { "program": "growth", "name": "…", "phone": "…", "goal": "…" },
  "attribution": { "utm_source": "instagram", "utm_campaign": "…", "landing_page": "/", "referrer": "…" },
  "meta": { "ip": "…", "userAgent": "…" }
}
```

Form names: `application` (all programs; `data.program` says which), `contact`, `needs-assessment`, `testimonial`.

Headers sent with every request:
- `X-Webhook-Event: form.<form-name>`
- `X-Webhook-Timestamp: <unix seconds>`
- `X-Webhook-Signature: sha256=<HMAC-SHA256 of "<timestamp>.<raw body>" using your secret>`
- `X-Webhook-Secret: <your secret>` (for tools such as n8n header auth that can only compare a header value)
- plus anything in `forms.extraHeaders`

To verify the signature in Node:
```js
const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
```

The relay needs PHP hosting (Hostinger has it). On a static-only host, set `forms.mode: "direct"`; the browser then posts straight to the webhook, unsigned, because a secret in the browser would be public.

## Tracking events

Sent to GTM `dataLayer`, GA4 / Google Ads and Meta Pixel when configured:

| Event | When | Meta Pixel |
|---|---|---|
| `view_item` | Program page viewed | ViewContent |
| `begin_checkout` | Book / Enrol / Apply button clicked | InitiateCheckout |
| `generate_lead` | Any form submitted (+ Google Ads lead conversion) | Lead |
| `contact` | WhatsApp / Instagram clicked | Contact |
| `quiz_complete` | "Find my program" quiz finished | custom |
| `purchase` | Thank-you page opened with `?payment_id=…` (once per payment; + Ads purchase conversion) | Purchase |

## SEO built in

Unique titles and descriptions per page · canonical URLs · Open Graph / Twitter share images · JSON-LD structured data (organisation, person, website, breadcrumbs, a Course for each program with price and schedule, FAQ) · `sitemap.xml` with images · `robots.txt` · `llms.txt` for AI search engines · clean keyword URLs (`/ai-growth-plan/`) with 301 redirects from old `.html` URLs · HTTPS + single-host redirects · image sizes and lazy loading · preloaded hero image · caching and compression · `noindex` on thank-you and form pages.
