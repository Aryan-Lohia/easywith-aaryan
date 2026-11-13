/**
 * Cloudflare Worker: form relay for GitHub Pages → theaihive inbound webhook.
 * Browser POSTs JSON (form envelope); worker forwards with application/json + X-Webhook-Secret.
 */

const MAX_BODY = 64_000;

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || "https://courses.aryanlohia.com").replace(/\/$/, "");
  if (!origin || origin.replace(/\/$/, "") !== allowed) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function strip(v, max) {
  const s = String(v ?? "").replace(/<[^>]*>/g, "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function buildPayload(in, env, meta) {
  if (strip(in?.data?.website, 500)) return null;
  if ((in?.elapsedMs ?? 99999) < 2500) return null;

  const data = {};
  for (const [k, v] of Object.entries(in.data || {})) {
    if (k === "website" || v == null || v === "") continue;
    const key = k.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!key) continue;
    data[key] = strip(Array.isArray(v) ? v.join(", ") : v, 5000);
  }

  const attr = {};
  for (const [k, v] of Object.entries(in.attribution || {})) {
    const key = k.replace(/[^a-zA-Z0-9_-]/g, "");
    if (key) attr[key] = strip(v, 500);
  }

  const attrFlat = {};
  for (const [k, v] of Object.entries(attr)) {
    if (v) attrFlat[`attribution_${k}`] = v;
  }

  const fields = Object.entries(data).map(([name, value]) => ({ name, value }));
  const form = String(in.form || "form").toLowerCase().replace(/[^a-z0-9-]/g, "") || "form";

  return {
    event: "form_submission",
    form,
    submittedAt: new Date().toISOString(),
    site: env.SITE_URL || "https://courses.aryanlohia.com",
    page: strip(in.page, 300),
    ...data,
    ...attrFlat,
    fields,
    data,
    attribution: attr,
    meta,
  };
}

async function forwardWebhook(payload, env) {
  const url = env.WEBHOOK_URL;
  const secret = env.WEBHOOK_SECRET;
  if (!url || !secret) {
    return { ok: false, error: "relay_not_configured" };
  }

  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "EasyWithAaryan-CloudflareRelay/1.0",
    "X-Webhook-Event": `form.${payload.form}`,
    "X-Webhook-Timestamp": ts,
    "X-Webhook-Secret": secret,
  };

  const res = await fetch(url, { method: "POST", headers, body });
  let out = {};
  try {
    out = await res.json();
  } catch (_) {}

  const accepted = res.ok && out.ok === true && out.deduped !== true && (out.id != null || out.captured === true);
  return { ok: accepted, upstream: out, status: res.status };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      if (!cors) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const paths = ["/", "/api/submit", "/submit"];
    if (request.method !== "POST" || !paths.includes(url.pathname)) {
      return json({ ok: false, error: "not_found" }, 404, cors || {});
    }

    if (!cors) {
      return json({ ok: false, error: "origin_not_allowed" }, 403);
    }

    const rawText = await request.text();
    if (rawText.length > MAX_BODY) {
      return json({ ok: false, error: "too_large" }, 413, cors);
    }

    let inData;
    try {
      inData = JSON.parse(rawText);
    } catch (_) {
      return json({ ok: false, error: "bad_request" }, 400, cors);
    }

    const meta = {
      ip: request.headers.get("CF-Connecting-IP") || "",
      userAgent: strip(request.headers.get("User-Agent"), 400),
    };

    const payload = buildPayload(inData, env, meta);
    if (!payload) {
      return json({ ok: true }, 200, cors);
    }

    const result = await forwardWebhook(payload, env);
    return json(
      { ok: result.ok, error: result.ok ? null : result.upstream?.error || "not_delivered" },
      result.ok ? 200 : 502,
      cors
    );
  },
};
