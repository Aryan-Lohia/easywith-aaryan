/* ==========================================================================
   EASY WITH AARYAN — THE ONE FILE YOU EDIT
   --------------------------------------------------------------------------
   Every link, price, tracking tag, SEO title, testimonial and form setting
   lives here. After editing, run:

       node build.mjs            → builds the site into /dist
       node build.mjs --serve    → builds and previews at http://localhost:8080

   Then upload the CONTENTS of /dist to your hosting (e.g. Hostinger public_html).

   This file is NOT uploaded. Values marked [SERVER-ONLY] never reach the
   browser; everything else is public by nature (it's on the website).
   ========================================================================== */

module.exports = {

  /* ------------------------------------------------------------------ SITE */
  site: {
    name: "Easy with Aaryan",
    // Your live domain, no trailing slash. Used for canonical URLs, sitemap,
    // social previews and structured data. MUST be correct before launch.
    url: "https://courses.aryanlohia.com",
    language: "en-IN",
    locale: "en_IN",
    themeColor: "#0D0D0D",
    tagline: "Personal 1:1 AI training that starts with your goals.",
    // Default social share image (1200×630), relative to /assets/img/
    defaultOgImage: "og/og-home.jpg",
    // Hostname for GitHub Pages (writes dist/CNAME on build)
    githubPagesDomain: "courses.aryanlohia.com",
  },

  /* ---------------------------------------------------------------- PERSON */
  person: {
    name: "Aryan Lohia",
    jobTitle: "Software Developer & AI Educator",
    image: "aryan-lohia-ai-trainer.webp",
    company: { name: "AI Hive", url: "https://theaihive.io" },
    alumniOf: "Sikkim Manipal Institute of Technology",
    city: "Siliguri",
    region: "West Bengal",
    regionCode: "IN-WB",
    country: "IN",
    knowsAbout: [
      "Artificial Intelligence", "Generative AI", "ChatGPT", "Prompt Engineering",
      "AI Automation", "AI Agents", "Software Development", "AI Education",
    ],
  },

  /* --------------------------------------------------------------- CONTACT */
  contact: {
    whatsapp: "919239827178",            // international format, digits only (91 + 9239827178)
    phone: "+91 92398 27178",            // same number: calls and WhatsApp
    email: "aryan@theaihive.org",
    // Full profile URLs. Leave "" to hide a button/link everywhere.
    instagram: "https://www.instagram.com/easywithaaryan",                        // e.g. "https://www.instagram.com/yourhandle"
    linkedin: "https://www.linkedin.com/in/Aryan-Lohia",
    youtube: "",
    defaultWhatsAppMessage: "Hi Aryan, I'd like to know more about your AI programs.",
  },

  /* --------------------------------------------------- FLOATING BUTTONS */
  fab: {
    enabled: true,
    whatsapp: true,                       // shows if contact.whatsapp is set
    call: true,                           // shows a call button for contact.phone
    instagram: true,                      // shows if contact.instagram is set
    position: "right",                    // "right" | "left"
  },

  /* ---------------------------------------------- ENQUIRY POPUP & SCARCITY
     Popup opens once per visit, 15 seconds after landing on a program page.
     Scarcity lines rotate in a small note. Only say things that are true. */
  engagement: {
    enquiryDelayMs: 15000,
    enquiryPages: ["home", "clarity", "growth", "implementation", "contact"],
    fomoPages: ["home", "clarity", "growth", "implementation"],
    fomo: [
      "Limited 1:1 slots each month. When this month fills, the next opening is the month after.",
      "Clarity and Growth are on launch pricing for a short time.",
      "Sessions are live and one-to-one, so only a handful of people train with me each month.",
    ],
  },

  /* ----------------------------------------------------- TRACKING TAGS
     Paste IDs to switch each one on. Leave "" to switch off.            */
  tracking: {
    googleTagManagerId: "",               // "GTM-XXXXXXX"
    googleAnalyticsId: "G-89XGBBMWR6",    // "G-XXXXXXXXXX" (skip if GA4 runs inside GTM)
    googleAdsId: "",                      // "AW-XXXXXXXXX"
    googleAdsConversionLabels: {          // from Google Ads → Conversions
      lead: "",
      purchase: "",
    },
    metaPixelId: "",                      // "123456789012345"
    microsoftClarityId: "",               // "abcdefghij"
    // Search-engine ownership verification (content="" value only)
    googleSiteVerification: "",
    bingSiteVerification: "",
    metaDomainVerification: "",
  },

  /* ----------------------------------------------------------------- FORMS
     How form submissions are delivered:
       "relay"    → your server (dist/api/submit.php) signs and forwards to the
                    webhook. Secret stays private. Needs PHP hosting (Hostinger ✓).
       "direct"   → the browser posts straight to webhookUrl. Works on any host,
                    but the secret is NOT sent (it would be public), and the
                    webhook must allow CORS (n8n / Make do; Zapier doesn't).
       "whatsapp" → no webhook; answers open as a pre-filled WhatsApp message.
     If delivery fails for any reason, the visitor gets the WhatsApp fallback. */
  forms: {
    mode: "relay",
    webhookUrl: "",                       // [SERVER-ONLY in relay mode] n8n / Make / Pabbly / your API
    webhookSecret: "",                    // [SERVER-ONLY] used to sign requests (HMAC-SHA256)
    extraHeaders: {},                     // [SERVER-ONLY] e.g. { "Authorization": "Bearer …" }
    allowedOrigins: [],                   // [SERVER-ONLY] defaults to site.url
    notifyEmail: "",                      // [SERVER-ONLY] optional: also email each submission (uses PHP mail())
  },

  /* -------------------------------------------------------------- PROGRAMS */
  currency: "INR",
  slotsNote: "Limited 1:1 slots each month",
  programs: {
    clarity: {
      name: "AI Clarity Session",
      short: "Clarity Session",
      page: "clarity",
      price: 2499,
      launchPrice: 1499,                  // null = launch offer off
      sessions: 1,
      minutesPerSession: 90,
      bookingLink: "",                    // Calendly / Cal.com 90-min event
      description: "One personalised 90-minute 1:1 session to understand which AI tools fit your goal and leave with a workflow you can use immediately.",
    },
    growth: {
      name: "AI Growth Plan",
      short: "Growth Plan",
      page: "growth",
      price: 7999,
      launchPrice: 5999,
      sessions: 4,
      minutesPerSession: 90,
      bookingLink: "",
      description: "A personalised four-week 1:1 AI program: foundations, real-work workflows, automation and a completed capstone project.",
    },
    implementation: {
      name: "AI Implementation Intensive",
      short: "Implementation Intensive",
      page: "implementation",
      price: 14999,                       // shown as "from ₹14,999"
      launchPrice: null,
      priceIsFrom: true,
      sessions: 4,
      minutesPerSession: 90,
      bookingLink: "",                    // discovery-call booking link
      description: "Four guided 1:1 build sessions to design, build, test and document one AI-powered workflow or prototype.",
    },
  },

  /* -------------------------------------------------------------- POLICIES */
  policies: {
    rescheduleNoticeHours: 24,
    reschedulesPerSession: 1,
    growthValidityWeeks: 6,
    refundRescheduleWindowDays: 14,       // if I cancel, I must offer a new slot within this window
    refundProcessingDays: 7,              // working days to process an eligible refund
    lastUpdated: "2026-10-23",
  },

  /* ---------------------------------------------------------- TESTIMONIALS
     Real testimonials only, with the person's permission (collect them via
     /feedback/). Each section stays hidden until it has at least one entry.
     program: "clarity" | "growth" | "implementation" | "workshop"           */
  testimonials: [
    // {
    //   name: "Full name",
    //   role: "Role, City",
    //   program: "growth",
    //   result: "Built a weekly reporting assistant",
    //   quote: "What they said, in their words.",
    //   photo: "",                       // optional: file in /src/assets/img/testimonials/
    // },
  ],

  /* ----------------------------------------------------------------- LOGOS
     "Workshops, talks & software for" strip on the home page.
     file → image in src/assets/img/logos/ (transparent PNG/WebP works best).
     Leave file "" to show the name as a text wordmark until you have the logo.
     Sizes are balanced automatically from each logo's shape.               */
  logos: [
    { name: "Google Developer Student Clubs", file: "google-developer-student-clubs.webp" },
    { name: "BNI", file: "bni.webp" },
    { name: "FICCI FLO", file: "ficci-flo.webp" },
    { name: "TiE Siliguri", file: "tie-siliguri.webp" },
    { name: "Lions Clubs International", file: "lions-international.webp" },
    { name: "Nexis", file: "nexis.webp" },
    { name: "ChatterBox, JD Speakers Institute", file: "chatterbox.webp" },
    { name: "Army Medical Corps, Indian Army", file: "army-medical-corps.webp" },
    { name: "GlobalReach Siliguri", file: "globalreach.webp" },
    { name: "Business N Buddies (BNB)", file: "bnb.webp" },
    { name: "Mahabir Electricals", file: "" },
    { name: "Sinhal Brothers", file: "" },
    { name: "RTI", file: "" },
  ],

  /* ------------------------------------------------------------ NAVIGATION */
  nav: [
    { label: "Clarity Session", page: "clarity" },
    { label: "Growth Plan", page: "growth" },
    { label: "Implementation", page: "implementation" },
    { label: "Find my program", page: "home", hash: "#find" },
  ],

  /* ----------------------------------------------------------------- PAGES
     path   → public URL       title  → ≤ 60 chars   description → ≤ 155 chars
     schema → extra structured data for the page
     noindex: true keeps a page out of Google (thank-you, forms).          */
  pages: {
    home: {
      src: "index.html", path: "/",
      title: "1:1 AI Training & Coaching Online in India | Aryan Lohia",
      description: "One-on-one AI training with Aryan Lohia, a developer building AI for 30+ businesses. Learn ChatGPT & AI tools for study, work or business, online across India.",
      ogImage: "og/og-home.jpg",
      schema: ["courseList"],
      priority: 1.0,
      cta: { label: "Apply", page: "apply" },
    },
    clarity: {
      src: "clarity.html", path: "/ai-clarity-session/",
      title: "AI Clarity Session: 90-Min 1:1 AI Coaching | Aryan Lohia",
      description: "One personalised 90-minute AI session. Find the right AI tools for your goal, solve a real problem together and leave with a workflow you can use today.",
      ogImage: "og/og-clarity.jpg",
      schema: ["course:clarity"],
      breadcrumb: "AI Clarity Session",
      priority: 0.9,
      cta: { label: "Book · {{price:clarity}}", href: "#offer" },
    },
    growth: {
      src: "growth.html", path: "/ai-growth-plan/",
      title: "AI Growth Plan: 4-Week 1:1 AI Course Online | Aryan Lohia",
      description: "A personalised 4-week one-on-one AI course. Learn ChatGPT and AI tools, build real workflows and automations, and finish with a completed AI project.",
      ogImage: "og/og-growth.jpg",
      schema: ["course:growth"],
      breadcrumb: "AI Growth Plan",
      priority: 0.9,
      cta: { label: "Enrol · {{price:growth}}", href: "#offer" },
    },
    implementation: {
      src: "implementation.html", path: "/ai-implementation-intensive/",
      title: "AI Implementation Intensive: Build an AI Prototype 1:1",
      description: "Turn your AI idea into a working prototype in four guided 1:1 build sessions. Architecture, build, testing and handover with Aryan Lohia of AI Hive.",
      ogImage: "og/og-implementation.jpg",
      schema: ["course:implementation"],
      breadcrumb: "AI Implementation Intensive",
      priority: 0.8,
      cta: { label: "Apply", page: "apply", hash: "?program=implementation" },
    },
    apply: {
      src: "apply.html", path: "/apply/",
      title: "Book Your 1:1 AI Program | Aryan Lohia",
      description: "Apply for the AI Clarity Session, AI Growth Plan or AI Implementation Intensive. Share your goal and I'll confirm your slot within one working day.",
      noindex: true, minimal: true,
      back: { label: "All programs", page: "home", hash: "#programs" },
    },
    thankyou: {
      src: "thank-you.html", path: "/thank-you/",
      title: "You're in! Next steps | Easy with Aaryan",
      description: "Book your session and share your goals.",
      noindex: true, minimal: true,
    },
    feedback: {
      src: "feedback.html", path: "/feedback/",
      title: "Share your feedback | Easy with Aaryan",
      description: "Tell me how your session went.",
      noindex: true, minimal: true,
    },
    contact: {
      src: "contact.html", path: "/contact/",
      title: "Contact Aryan Lohia | AI Trainer in Siliguri, India",
      description: "Get in touch with Aryan Lohia for 1:1 AI training, workshops or AI implementation. WhatsApp, email or LinkedIn, based in Siliguri, West Bengal.",
      breadcrumb: "Contact",
      priority: 0.6,
    },
    terms: {
      src: "terms.html", path: "/terms/",
      title: "Terms & Conditions | Easy with Aaryan",
      description: "Terms and conditions for 1:1 AI training programs by Aryan Lohia.",
      breadcrumb: "Terms & Conditions", priority: 0.3,
    },
    refund: {
      src: "refund-policy.html", path: "/refund-policy/",
      title: "Cancellation & Refund Policy | Easy with Aaryan",
      description: "Payments are non-refundable unless a paid session is not delivered. Read the full cancellation, rescheduling and refund policy.",
      breadcrumb: "Cancellation & Refund Policy", priority: 0.3,
    },
    delivery: {
      src: "delivery-policy.html", path: "/delivery-policy/",
      title: "Service Delivery Policy | Easy with Aaryan",
      description: "How and when 1:1 AI training sessions are delivered after payment.",
      breadcrumb: "Service Delivery Policy", priority: 0.3,
    },
    privacy: {
      src: "privacy.html", path: "/privacy/",
      title: "Privacy Policy | Easy with Aaryan",
      description: "How Easy with Aaryan collects, uses and protects your personal information.",
      breadcrumb: "Privacy Policy", priority: 0.3,
    },
    notfound: {
      src: "404.html", path: "/404.html",
      title: "Page not found | Easy with Aaryan",
      description: "This page doesn't exist.",
      noindex: true, sitemap: false,
    },
  },
};
