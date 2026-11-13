/**
 * Add to backend.theaihive.io (Express). Then set in site.config.js:
 *   forms.browserRelayUrl = "https://backend.theaihive.io/api/v1/public/website-forms"
 *
 * Allows https://courses.aryanlohia.com to POST apply payloads; forwards with
 * application/json + X-Webhook-Secret (not browser text/plain ?secret= dedupes).
 */
const INBOUND_URL = process.env.EASYWITH_INBOUND_WEBHOOK_URL;
const INBOUND_SECRET = process.env.EASYWITH_INBOUND_WEBHOOK_SECRET;
const ALLOWED_ORIGINS = new Set(["https://courses.aryanlohia.com"]);

function easywithCors(req, res, next) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin.replace(/\/$/, ""))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

function buildPayload(in) {
  const data = in.data || {};
  const attr = in.attribution || {};
  const attrFlat = Object.fromEntries(
    Object.entries(attr).filter(([, v]) => v).map(([k, v]) => [`attribution_${k}`, v])
  );
  const fields = Object.entries(data).map(([name, value]) => ({ name, value: String(value) }));
  const form = String(in.form || "form").toLowerCase().replace(/[^a-z0-9-]/g, "") || "form";
  return {
    event: "form_submission",
    form,
    submittedAt: new Date().toISOString(),
    site: "https://courses.aryanlohia.com",
    page: in.page || "/",
    ...data,
    ...attrFlat,
    fields,
    data,
    attribution: attr,
    meta: { userAgent: in.meta?.userAgent || "" },
  };
}

// app.use(express.json({ limit: "64kb" }));
// app.options("/api/v1/public/website-forms", easywithCors);
// app.post("/api/v1/public/website-forms", easywithCors, async (req, res) => {
//   if (!INBOUND_URL || !INBOUND_SECRET) return res.status(503).json({ ok: false });
//   const r = await fetch(INBOUND_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "X-Webhook-Secret": INBOUND_SECRET,
//     },
//     body: JSON.stringify(buildPayload(req.body)),
//   });
//   const out = await r.json().catch(() => ({}));
//   res.status(r.status).json(out);
// });
