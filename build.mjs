#!/usr/bin/env node
/* Builds the site from site.config.js + src/ into dist/.
 *   node build.mjs           build
 *   node build.mjs --serve   build, then preview on http://localhost:8080
 * No dependencies — plain Node.js (v18+). */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const require = createRequire(import.meta.url);
const cfg = require("./site.config.js");

const warnings = [];
const warn = msg => warnings.push(msg);
const BUILD_DATE = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/* ------------------------------------------------------------- helpers */
const { site, person, contact, programs, pages, tracking, forms } = cfg;
const siteUrl = site.url.replace(/\/$/, "");
const abs = p => siteUrl + p;
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = s => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const inr = n => "₹" + Number(n).toLocaleString("en-IN");
const get = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const current = p => p.launchPrice || p.price;
const pagePath = key => {
  if (!pages[key]) throw new Error(`Unknown page "${key}"`);
  return pages[key].path;
};
const programPath = k => pagePath(programs[k].page);
const wa = (msg = contact.defaultWhatsAppMessage) => `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(msg)}`;
const isoMinutes = m => `PT${Math.floor(m / 60) ? Math.floor(m / 60) + "H" : ""}${m % 60 ? (m % 60) + "M" : ""}`;
const P = k => {
  if (!programs[k]) throw new Error(`Unknown program "${k}"`);
  return programs[k];
};
const payHref = k => {
  P(k);
  return `${pagePath("apply")}?program=${k}`;
};
const bookHref = k => {
  const p = P(k);
  if (p.bookingLink) return p.bookingLink;
  return wa(`Hi Aryan, I'd like to book a slot for the ${p.name}.`);
};
const sameAs = [contact.linkedin, contact.instagram, contact.youtube].filter(Boolean);

// Map source filenames → public paths, for links written as href="growth.html"
const fileToPath = Object.fromEntries(Object.values(pages).map(p => [p.src, p.path]));

/* ------------------------------------------------------ image metadata */
function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const chunk = b.toString("ascii", 12, 16);
      if (chunk === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch (_) {}
  return null;
}

/* ------------------------------------------------------- templating */
function render(html, pageKey) {
  // Conditional blocks: {{#launch:growth}}…{{/launch}}  {{#if:contact.instagram}}…{{/if}}
  html = html.replace(/\{\{#(launch|if):([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, type, arg, inner) => {
    const on = type === "launch" ? !!P(arg.trim()).launchPrice : !!get(cfg, arg.trim());
    return on ? inner : "";
  });

  // Tokens
  html = html.replace(/\{\{([a-z]+)(?::([^}]*))?\}\}/gi, (m, name, arg = "") => {
    switch (name) {
      case "price": return inr(current(P(arg)));
      case "was": return P(arg).launchPrice ? inr(P(arg).price) : "";
      case "pay": return esc(payHref(arg));
      case "book": return esc(bookHref(arg));
      case "url": { const [k, hash = ""] = arg.split("#"); return pagePath(k) + (hash ? "#" + hash : ""); }
      case "wa": return esc(wa(arg || undefined));
      case "email": return esc(contact.email);
      case "phone": return esc(contact.phone);
      case "year": return String(new Date().getFullYear());
      case "slots": return esc(cfg.slotsNote);
      case "cfg": return esc(get(cfg, arg));
      case "testimonials": return testimonialsSection(arg || "all");
      case "logos": return logoItems();
      default: return m;
    }
  });

  // Links to other source pages → clean URLs
  html = html.replace(/href="([\w-]+\.html)(\?[^"#]*)?(#[^"]*)?"/g, (m, file, query = "", hash = "") =>
    fileToPath[file] ? `href="${fileToPath[file]}${query}${hash}"` : m);

  // Data-driven attributes (prices, payment / booking / WhatsApp / email links)
  html = html.replace(/(<(\w+)[^>]*\sdata-price="(\w+)"[^>]*>)[^<]*(<\/\2>)/g,
    (_, open, tag, k, close) => open + inr(current(P(k))) + close);
  html = html.replace(/<(\w+)[^>]*\sdata-was="(\w+)"[^>]*>[^<]*<\/\1>/g,
    (m, tag, k) => (P(k).launchPrice ? m.replace(/>[^<]*</, `>${inr(P(k).price)}<`) : ""));
  html = html.replace(/<(\w+)[^>]*\sdata-launch-tag="(\w+)"[^>]*>[^<]*<\/\1>/g,
    (m, tag, k) => (P(k).launchPrice ? m : ""));
  html = html.replace(/<a\b[^>]*>/g, tag => {
    let href = null, external = false, mm;
    if ((mm = tag.match(/\sdata-pay="(\w+)"/))) { href = payHref(mm[1]); external = true; }
    else if ((mm = tag.match(/\sdata-book="(\w+)"/))) { href = bookHref(mm[1]); external = true; }
    else if ((mm = tag.match(/\sdata-wa(?:="([^"]*)")?[\s>]/))) { href = wa(mm[1] ? unesc(mm[1]) : undefined); external = true; }
    else if (/\sdata-email[\s>]/.test(tag)) href = "mailto:" + contact.email;
    if (href == null) return tag;
    let out = /\shref="/.test(tag) ? tag.replace(/\shref="[^"]*"/, ` href="${esc(href)}"`) : tag.replace("<a", `<a href="${esc(href)}"`);
    if (external && /^https?:/.test(href) && !/\starget=/.test(out)) out = out.replace("<a", '<a target="_blank" rel="noopener"');
    return out;
  });
  html = html.replace(/(<a[^>]*\sdata-email[^>]*>)(<\/a>)/g, `$1${esc(contact.email)}$2`);

  // Images: absolute paths, intrinsic size, first image is the LCP (eager), the rest lazy
  let first = true;
  html = html.replace(/<img\b[^>]*>/g, tag => {
    tag = tag.replace(/src="assets\//, 'src="/assets/');
    const src = (tag.match(/src="([^"]+)"/) || [])[1];
    if (src && src.startsWith("/assets/") && !/\swidth=/.test(tag)) {
      const dim = imageSize(path.join(SRC, src));
      if (dim) tag = tag.replace("<img", `<img width="${dim.w}" height="${dim.h}"`);
    }
    if (first && !/\sdata-lazy/.test(tag)) {
      if (!/fetchpriority/.test(tag)) tag = tag.replace("<img", '<img fetchpriority="high"');
      first = false;
    } else if (!/\sloading=/.test(tag)) {
      tag = tag.replace("<img", '<img loading="lazy" decoding="async"');
    }
    return tag;
  });
  return html;
}

function logoItems() {
  return (cfg.logos || []).map(l => {
    const file = l.file && path.join(SRC, "assets", "img", "logos", l.file);
    if (!file || !fs.existsSync(file)) {
      if (l.file) warn(`logos: "${l.file}" not found in src/assets/img/logos/ → showing "${l.name}" as text`);
      return `<li class="logo-text">${esc(l.name)}</li>`;
    }
    // Optical balance: wide wordmarks render shorter, round badges and crests taller.
    const d = imageSize(file) || { w: 1, h: 1 };
    const r = d.w / d.h;
    const h = r >= 4 ? 28 : r >= 3 ? 34 : r >= 2 ? 38 : r >= 1.3 ? 46 : r >= 0.9 ? 52 : 62;
    return `<li><img src="/assets/img/logos/${esc(l.file)}" alt="${esc(l.name)}" title="${esc(l.name)}" width="${d.w}" height="${d.h}" style="--h:${h}px" loading="lazy" decoding="async" data-lazy></li>`;
  }).join("\n      ");
}

function testimonialsSection(filter) {
  const all = cfg.testimonials || [];
  let list = filter === "all" ? all : all.filter(t => t.program === filter);
  if (!list.length) list = all;
  if (!list.length) return "";
  const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const cards = list.map(t => `
      <figure class="test">
        ${t.result ? `<span class="result">${esc(t.result)}</span>` : ""}
        <blockquote>“${esc(t.quote)}”</blockquote>
        <figcaption>
          ${t.photo ? `<img src="/assets/img/testimonials/${esc(t.photo)}" alt="${esc(t.name)}" width="42" height="42" loading="lazy">` : `<i aria-hidden="true">${esc(initials(t.name))}</i>`}
          <div><b>${esc(t.name)}</b><span>${esc(t.role || "")}${t.program && programs[t.program] ? " · " + esc(programs[t.program].name) : ""}</span></div>
        </figcaption>
      </figure>`).join("");
  return `
<section class="tight" aria-labelledby="testimonials-title">
  <div class="wrap">
    <div class="center"><span class="label">From people I've taught</span><h2 id="testimonials-title">What learners say</h2></div>
    <div class="tests">${cards}
    </div>
  </div>
</section>`;
}

/* ---------------------------------------------------- structured data */
function faqFrom(html) {
  const items = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  const strip = s => unesc(s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  return items.map(([, q, a]) => ({
    "@type": "Question",
    name: strip(q),
    acceptedAnswer: { "@type": "Answer", text: strip(a) },
  }));
}

function structuredData(key, page, body) {
  const url = abs(page.path);
  const ORG = siteUrl + "/#org", PERSON = siteUrl + "/#aryan", WEBSITE = siteUrl + "/#website";
  const prices = Object.values(programs).map(current);
  const graph = [
    {
      "@type": ["EducationalOrganization", "ProfessionalService"],
      "@id": ORG,
      name: site.name,
      url: siteUrl + "/",
      description: site.tagline,
      logo: { "@type": "ImageObject", url: abs("/assets/img/aryan-lohia-logo.png"), width: 512, height: 512 },
      image: abs("/assets/img/" + person.image),
      founder: { "@id": PERSON },
      email: contact.email,
      telephone: contact.phone,
      priceRange: `${inr(Math.min(...prices))} – ${inr(Math.max(...prices))}+`,
      address: { "@type": "PostalAddress", addressLocality: person.city, addressRegion: person.region, addressCountry: person.country },
      areaServed: { "@type": "Country", name: "India" },
      knowsAbout: person.knowsAbout,
      ...(sameAs.length && { sameAs }),
    },
    {
      "@type": "Person",
      "@id": PERSON,
      name: person.name,
      jobTitle: person.jobTitle,
      url: siteUrl + "/",
      image: abs("/assets/img/" + person.image),
      worksFor: { "@type": "Organization", name: person.company.name, url: person.company.url },
      alumniOf: { "@type": "CollegeOrUniversity", name: person.alumniOf },
      address: { "@type": "PostalAddress", addressLocality: person.city, addressRegion: person.region, addressCountry: person.country },
      knowsAbout: person.knowsAbout,
      ...(sameAs.length && { sameAs }),
    },
    { "@type": "WebSite", "@id": WEBSITE, url: siteUrl + "/", name: site.name, publisher: { "@id": ORG }, inLanguage: site.language },
    {
      "@type": "WebPage",
      "@id": url + "#webpage",
      url,
      name: page.title,
      description: page.description,
      isPartOf: { "@id": WEBSITE },
      about: { "@id": ORG },
      inLanguage: site.language,
      primaryImageOfPage: { "@type": "ImageObject", url: abs("/assets/img/" + (page.ogImage || site.defaultOgImage)) },
      dateModified: BUILD_DATE,
      ...(page.breadcrumb && { breadcrumb: { "@id": url + "#breadcrumb" } }),
    },
  ];

  if (page.breadcrumb) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": url + "#breadcrumb",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl + "/" },
        { "@type": "ListItem", position: 2, name: page.breadcrumb, item: url },
      ],
    });
  }

  for (const s of page.schema || []) {
    if (s === "courseList") {
      graph.push({
        "@type": "ItemList",
        "@id": url + "#programs",
        name: "1:1 AI training programs",
        itemListElement: Object.keys(programs).map((k, i) => ({ "@type": "ListItem", position: i + 1, url: abs(programPath(k)) })),
      });
    }
    if (s.startsWith("course:")) {
      const k = s.split(":")[1], p = P(k);
      const minutes = p.sessions * p.minutesPerSession;
      graph.push({
        "@type": "Course",
        "@id": url + "#course",
        name: p.name,
        description: p.description,
        url,
        provider: { "@id": ORG },
        inLanguage: site.language,
        educationalLevel: k === "implementation" ? "Intermediate" : "Beginner",
        teaches: person.knowsAbout.slice(0, 5),
        image: abs("/assets/img/" + (page.ogImage || site.defaultOgImage)),
        offers: {
          "@type": "Offer",
          category: "Paid",
          price: current(p),
          priceCurrency: cfg.currency,
          availability: "https://schema.org/InStock",
          url,
          ...(p.priceIsFrom && { description: `Starting price for a tightly scoped project` }),
        },
        hasCourseInstance: {
          "@type": "CourseInstance",
          courseMode: "Online",
          courseWorkload: isoMinutes(minutes),
          instructor: { "@id": PERSON },
          ...(p.sessions > 1 && {
            courseSchedule: { "@type": "Schedule", duration: isoMinutes(p.minutesPerSession), repeatCount: p.sessions, repeatFrequency: "Weekly" },
          }),
        },
      });
    }
  }

  const faq = faqFrom(body);
  if (faq.length) graph.push({ "@type": "FAQPage", "@id": url + "#faq", mainEntity: faq });

  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}

/* ------------------------------------------------------ tracking tags */
function trackingHead() {
  const t = tracking, out = [];
  if (t.googleTagManagerId) out.push(`<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${esc(t.googleTagManagerId)}');</script>`);
  const gtagIds = [t.googleAnalyticsId, t.googleAdsId].filter(Boolean);
  if (gtagIds.length) {
    out.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(gtagIds[0])}"></script>`);
    out.push(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gtagIds.map(id => `gtag('config','${esc(id)}');`).join("")}</script>`);
  }
  if (t.metaPixelId) out.push(`<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(t.metaPixelId)}');fbq('track','PageView');</script>`);
  if (t.microsoftClarityId) out.push(`<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${esc(t.microsoftClarityId)}");</script>`);
  return out.join("\n");
}
function trackingBody() {
  const t = tracking, out = [];
  if (t.googleTagManagerId) out.push(`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${esc(t.googleTagManagerId)}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`);
  if (t.metaPixelId) out.push(`<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${esc(t.metaPixelId)}&amp;ev=PageView&amp;noscript=1"></noscript>`);
  return out.join("\n");
}

/* ------------------------------------------------------------ layout */
function head(key, page, body) {
  const url = abs(page.path);
  const ogImg = abs("/assets/img/" + (page.ogImage || site.defaultOgImage));
  const lcp = (body.match(/<img\b[^>]*fetchpriority="high"[^>]*>/) || [])[0];
  const lcpSrc = lcp && (lcp.match(/src="([^"]+)"/) || [])[1];
  const t = tracking;
  return `<!doctype html>
<html lang="${site.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${key === "notfound" ? "" : `<link rel="canonical" href="${url}">\n`}<meta name="robots" content="${page.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">
<meta name="author" content="${esc(person.name)}">
<meta name="theme-color" content="${site.themeColor}">
<meta name="geo.region" content="${person.regionCode}">
<meta name="geo.placename" content="${esc(person.city)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${site.locale}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImg}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(page.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${ogImg}">
${t.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(t.googleSiteVerification)}">\n` : ""}${t.bingSiteVerification ? `<meta name="msvalidate.01" content="${esc(t.bingSiteVerification)}">\n` : ""}${t.metaDomainVerification ? `<meta name="facebook-domain-verification" content="${esc(t.metaDomainVerification)}">\n` : ""}<link rel="icon" href="/assets/img/mark.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Playfair+Display:ital,wght@0,500;1,500&family=Poppins:wght@500;600&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
${lcpSrc ? `<link rel="preload" as="image" href="${lcpSrc}" fetchpriority="high">\n` : ""}${structuredData(key, page, body)}
${trackingHead()}
</head>`;
}

const brand = `<a href="/" class="brand" aria-label="${esc(site.name)}, home"><img src="/assets/img/mark.svg" alt="" width="30" height="40"><span class="brand-name">Aryan<small>Lohia</small></span></a>`;

function header(key, page) {
  if (page.minimal) {
    const back = page.back ? `<a href="${pagePath(page.back.page)}${page.back.hash || ""}" class="btn btn-sm btn-line">← ${esc(page.back.label)}</a>` : "";
    return `<header class="nav"><div class="wrap">${brand}${back}</div></header>`;
  }
  const links = cfg.nav.map(n => {
    const href = pagePath(n.page) + (n.hash || "");
    const cur = n.page === key && !n.hash ? ' aria-current="page"' : "";
    return `<li><a href="${key === n.page && n.hash ? n.hash : href}"${cur}>${esc(n.label)}</a></li>`;
  }).join("");
  const cta = page.cta || { label: "Find my program", page: "home", hash: "#find" };
  const ctaHref = cta.href || pagePath(cta.page) + (cta.hash || "");
  return `<header class="nav">
  <div class="wrap">
    ${brand}
    <nav aria-label="Main"><ul class="nav-links" id="nav-links">${links}</ul></nav>
    <a href="${ctaHref}" class="btn btn-sm nav-cta">${render(cta.label, key)}</a>
    <button class="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links"><span></span><span></span><span></span></button>
  </div>
</header>`;
}

const ICONS = {
  whatsapp: `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6a10.6 10.6 0 0 1-5.4-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Z"/><path fill="currentColor" d="M11.6 9.6c.3 0 .6 0 .8.6l1.1 2.6c.1.3 0 .6-.1.8l-.7.9c-.2.2-.3.5-.1.8a9 9 0 0 0 4.3 3.8c.3.1.6 0 .8-.2l1-1.2c.2-.3.5-.3.8-.2l2.6 1.2c.3.2.5.3.5.5 0 .9-.4 1.8-1.1 2.3-1 .7-2.4.8-4.4 0a14 14 0 0 1-6.5-6.2c-.8-1.6-.7-3.1.3-4.3.3-.4.6-.6.7-.6Z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>`,
};

function fab() {
  if (!cfg.fab.enabled) return "";
  const items = [];
  if (cfg.fab.instagram && contact.instagram) items.push(`<a class="fab-btn fab-ig" href="${esc(contact.instagram)}" target="_blank" rel="noopener" aria-label="Follow on Instagram" data-contact="instagram">${ICONS.instagram}<span class="fab-tip">Instagram</span></a>`);
  if (cfg.fab.whatsapp && contact.whatsapp) items.push(`<a class="fab-btn fab-wa" href="${esc(wa())}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp" data-contact="whatsapp">${ICONS.whatsapp}<span class="fab-tip">Chat with me</span></a>`);
  return items.length ? `<div class="fab fab-${cfg.fab.position === "left" ? "left" : "right"}">${items.join("")}</div>` : "";
}

function footer(key, page) {
  const scripts = `<script src="/assets/js/site.js" defer></script>\n<script src="/assets/js/main.js" defer></script>`;
  const legal = `<a href="${pagePath("terms")}">Terms</a> · <a href="${pagePath("refund")}">Refunds</a> · <a href="${pagePath("privacy")}">Privacy</a>`;
  if (page.minimal) {
    return `<footer class="footer footer-slim"><div class="wrap footer-base"><span>© ${new Date().getFullYear()} ${esc(person.name)} · ${legal}</span><span><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></span></div></footer>\n${fab()}\n${scripts}`;
  }
  const social = [
    contact.whatsapp && `<li><a href="${esc(wa())}" target="_blank" rel="noopener" data-contact="whatsapp">WhatsApp</a></li>`,
    `<li><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>`,
    contact.instagram && `<li><a href="${esc(contact.instagram)}" target="_blank" rel="noopener me" data-contact="instagram">Instagram</a></li>`,
    contact.linkedin && `<li><a href="${esc(contact.linkedin)}" target="_blank" rel="noopener me">LinkedIn</a></li>`,
    contact.youtube && `<li><a href="${esc(contact.youtube)}" target="_blank" rel="noopener me">YouTube</a></li>`,
  ].filter(Boolean).join("");
  return `<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        ${brand}
        <p class="mt-s" style="max-width:300px">${esc(site.name)}: ${esc(site.tagline.charAt(0).toLowerCase() + site.tagline.slice(1))}</p>
        <p class="mt-s" style="font-size:14px">1:1 AI training online across India, from ${esc(person.city)}, ${esc(person.region)}.</p>
      </div>
      <div><h2 class="footer-h">Programs</h2><ul>${Object.keys(programs).map(k => `<li><a href="${programPath(k)}">${esc(programs[k].name)}</a></li>`).join("")}</ul></div>
      <div><h2 class="footer-h">Get in touch</h2><ul><li><a href="${pagePath("contact")}">Contact</a></li>${social}</ul></div>
      <div><h2 class="footer-h">Policies</h2><ul><li><a href="${pagePath("terms")}">Terms &amp; Conditions</a></li><li><a href="${pagePath("refund")}">Cancellation &amp; Refunds</a></li><li><a href="${pagePath("delivery")}">Service Delivery</a></li><li><a href="${pagePath("privacy")}">Privacy Policy</a></li></ul></div>
    </div>
    <div class="footer-base"><span>© ${new Date().getFullYear()} ${esc(person.name)} · ${esc(person.city)}, India</span><span>Training outcomes depend on individual effort. No income or employment results are guaranteed.</span></div>
  </div>
</footer>
${fab()}
${scripts}`;
}

function buildPage(key) {
  const page = pages[key];
  const srcFile = path.join(SRC, "pages", page.src);
  if (!fs.existsSync(srcFile)) throw new Error(`Missing page source: src/pages/${page.src}`);
  const body = render(fs.readFileSync(srcFile, "utf8"), key);
  const program = Object.keys(programs).find(k => programs[k].page === key);
  const html = `${head(key, page, body)}
<body data-page="${key}"${program ? ` data-program="${program}"` : ""}>
${trackingBody()}
<a class="skip-link" href="#main">Skip to content</a>
${header(key, page)}
<main id="main">
${body}
</main>
${footer(key, page)}
</body>
</html>
`;
  const out = page.path.endsWith("/") ? path.join(DIST, page.path, "index.html") : path.join(DIST, page.path);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

/* ------------------------------------------------------ public config */
function runtimeConfig() {
  const pub = {
    siteName: site.name,
    whatsapp: contact.whatsapp,
    defaultWhatsAppMessage: contact.defaultWhatsAppMessage,
    currency: cfg.currency,
    forms: {
      mode: forms.mode,
      endpoint: forms.mode === "relay" ? "/api/submit.php" : forms.mode === "direct" ? forms.webhookUrl : "",
    },
    ads: {
      id: tracking.googleAdsId,
      lead: tracking.googleAdsConversionLabels.lead,
      purchase: tracking.googleAdsConversionLabels.purchase,
    },
    programs: Object.fromEntries(Object.entries(programs).map(([k, p]) => [k, {
      name: p.name,
      price: current(p),
      priceIsFrom: !!p.priceIsFrom,
      url: programPath(k),
      bookingLink: bookHref(k),
    }])),
  };
  return `/* Generated by build.mjs from site.config.js — do not edit. */\nwindow.SITE = ${JSON.stringify(pub, null, 2)};\n`;
}

/* ------------------------------------------------- server-side relay */
function relayConfigPhp() {
  const origins = forms.allowedOrigins?.length ? forms.allowedOrigins : [siteUrl, siteUrl.replace("://www.", "://")];
  const conf = {
    siteUrl,
    webhookUrl: forms.webhookUrl,
    webhookSecret: forms.webhookSecret,
    extraHeaders: forms.extraHeaders || {},
    allowedOrigins: [...new Set(origins.map(o => o.replace(/\/$/, "")))],
    notifyEmail: forms.notifyEmail,
    fromName: site.name,
  };
  const php = v => {
    if (Array.isArray(v)) return `[${v.map(php).join(", ")}]`;
    if (v && typeof v === "object") return `[${Object.entries(v).map(([k, x]) => `${php(k)} => ${php(x)}`).join(", ")}]`;
    return `'${String(v ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  };
  return `<?php\n// Generated by build.mjs from site.config.js — do not edit, do not share.\nreturn ${php(conf)};\n`;
}

/* --------------------------------------------------------- site files */
function siteFiles(builtKeys) {
  const indexable = builtKeys.filter(k => !pages[k].noindex && pages[k].sitemap !== false);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${indexable.map(k => `  <url>
    <loc>${abs(pages[k].path)}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <priority>${(pages[k].priority ?? 0.5).toFixed(1)}</priority>
    <image:image><image:loc>${abs("/assets/img/" + (pages[k].ogImage || site.defaultOgImage))}</image:loc></image:image>
  </url>`).join("\n")}
</urlset>
`;
  const robots = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${abs("/sitemap.xml")}
`;
  const llms = `# ${site.name}

> ${site.tagline} One-to-one AI training and coaching by ${person.name}, a software developer and AI educator from ${person.city}, India, and founder of ${person.company.name}. Sessions are live online across India.

## Programs
${Object.entries(programs).map(([k, p]) => `- [${p.name}](${abs(programPath(k))}): ${p.description} ${p.priceIsFrom ? "From " : ""}${inr(current(p))}. ${p.sessions} × ${p.minutesPerSession}-minute session${p.sessions > 1 ? "s" : ""}.`).join("\n")}

## About ${person.name}
- ${person.jobTitle}; founder of ${person.company.name} (AI automation systems for 30+ businesses)
- 50+ software products built, 80+ workshops conducted, 1000+ people impacted
- B.Tech Computer Science, ${person.alumniOf}

## Contact
- [Contact page](${abs(pagePath("contact"))})
- Email: ${contact.email}
- WhatsApp: ${contact.phone}

## Policies
- [Terms](${abs(pagePath("terms"))}) · [Refund policy](${abs(pagePath("refund"))}) · [Privacy](${abs(pagePath("privacy"))})
`;
  const manifest = {
    name: site.name, short_name: "Easy with Aaryan", start_url: "/", display: "browser",
    background_color: "#FAF8F3", theme_color: site.themeColor, lang: site.language,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  const host = new URL(siteUrl).host;
  const bare = host.replace(/^www\./, "");
  const wantsWww = host.startsWith("www.");
  const htaccess = `# Generated by build.mjs
Options -Indexes
DirectoryIndex index.html index.php
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Force HTTPS
  RewriteCond %{HTTPS} off
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://${host}%{REQUEST_URI} [L,R=301]
  # One canonical host
  RewriteCond %{HTTP_HOST} ^${(wantsWww ? bare : "www." + bare).replace(/\./g, "\\.")}$ [NC]
  RewriteRule ^ https://${host}%{REQUEST_URI} [L,R=301]
  # Old .html URLs → clean URLs
${Object.values(pages).filter(p => p.path.endsWith("/") && p.path !== "/").map(p => `  RewriteRule ^${p.src.replace(".", "\\.")}$ ${p.path} [L,R=301]`).join("\n")}
  RewriteRule ^index\\.html$ / [L,R=301]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  <FilesMatch "\\.(css|js|webp|png|jpg|jpeg|svg|woff2)$">
    Header set Cache-Control "public, max-age=2592000"
  </FilesMatch>
  <FilesMatch "\\.(html|xml|txt)$">
    Header set Cache-Control "public, max-age=600"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript text/javascript application/json image/svg+xml text/xml application/xml text/plain
</IfModule>
`;
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemap);
  fs.writeFileSync(path.join(DIST, "robots.txt"), robots);
  fs.writeFileSync(path.join(DIST, "llms.txt"), llms);
  fs.writeFileSync(path.join(DIST, "site.webmanifest"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(DIST, ".htaccess"), htaccess);
}

/* --------------------------------------------------------------- run */
function checks() {
  if (!/^https:\/\//.test(siteUrl)) warn("site.url should start with https://");
  for (const [k, p] of Object.entries(programs)) {
    if (!p.bookingLink) warn(`programs.${k}.bookingLink is empty → booking buttons open WhatsApp`);
  }
  if (!contact.instagram) warn("contact.instagram is empty → Instagram button/link hidden");
  if (forms.mode !== "whatsapp" && !forms.webhookUrl) warn(`forms.webhookUrl is empty → form answers will be sent via WhatsApp`);
  if (forms.mode === "relay" && forms.webhookUrl && !forms.webhookSecret) warn("forms.webhookSecret is empty → webhook requests are unsigned");
  if (forms.mode === "direct" && forms.webhookSecret) warn("forms.mode is \"direct\": the secret is NOT sent from the browser (it would be public). Use \"relay\" to sign requests.");
  if (!Object.values(tracking).some(v => typeof v === "string" && v)) warn("No tracking tags configured (GA4 / GTM / Meta Pixel / Clarity)");
  if (!cfg.testimonials?.length) warn("No testimonials yet → testimonial sections are hidden");
  for (const [k, p] of Object.entries(pages)) {
    if (p.title.length > 60) warn(`pages.${k}.title is ${p.title.length} chars (aim for ≤ 60)`);
    if (p.description.length > 160) warn(`pages.${k}.description is ${p.description.length} chars (aim for ≤ 155)`);
  }
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.cpSync(path.join(SRC, "assets"), path.join(DIST, "assets"), { recursive: true });
  for (const f of ["favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]) {
    const from = path.join(SRC, "assets", "img", "icons", f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(DIST, f));
  }
  fs.writeFileSync(path.join(DIST, "assets", "js", "site.js"), runtimeConfig());

  // Server-side form relay
  fs.mkdirSync(path.join(DIST, "api"), { recursive: true });
  fs.copyFileSync(path.join(SRC, "api", "submit.php"), path.join(DIST, "api", "submit.php"));
  fs.writeFileSync(path.join(DIST, "api", "config.php"), relayConfigPhp());
  fs.writeFileSync(path.join(DIST, "api", ".htaccess"), `<Files "config.php">\n  Require all denied\n</Files>\nOptions -Indexes\n`);

  const keys = Object.keys(pages);
  for (const k of keys) buildPage(k);
  siteFiles(keys);
  if (site.githubPagesDomain) {
    fs.writeFileSync(path.join(DIST, "CNAME"), site.githubPagesDomain.trim() + "\n");
  }
  checks();

  console.log(`\n✓ Built ${keys.length} pages → dist/  (${BUILD_DATE})`);
  if (warnings.length) {
    console.log(`\n${warnings.length} thing${warnings.length > 1 ? "s" : ""} to finish in site.config.js:`);
    for (const w of warnings) console.log("  • " + w);
  }
  console.log("");
}

build();

if (process.argv.includes("--serve")) {
  const port = 8080;
  const hasPhp = spawnSync("php", ["-v"]).status === 0;
  if (hasPhp) {
    console.log(`Previewing with PHP (forms relay works) → http://localhost:${port}\n`);
    spawn("php", ["-S", `localhost:${port}`, "-t", DIST], { stdio: "inherit" });
  } else {
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
    http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = path.join(DIST, p);
      if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": types[".html"] }); fs.createReadStream(path.join(DIST, "404.html")).pipe(res); return; }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    }).listen(port, () => console.log(`Previewing → http://localhost:${port}  (install PHP to test the forms relay)\n`));
  }
}
