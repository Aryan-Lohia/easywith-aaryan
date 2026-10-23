(function () {
  const S = window.SITE || { programs: {}, forms: {} };
  const inr = n => "₹" + Number(n).toLocaleString("en-IN");
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const waLink = msg => `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(msg)}`;

  // ---------- Tracking: one call fans out to GTM, GA4/Ads and Meta Pixel ----------
  const PIXEL = {
    generate_lead: "Lead",
    begin_checkout: "InitiateCheckout",
    purchase: "Purchase",
    contact: "Contact",
    view_item: "ViewContent",
  };
  function track(event, params = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...params });
    if (typeof window.gtag === "function") {
      window.gtag("event", event, params);
      const label = event === "generate_lead" ? S.ads.lead : event === "purchase" ? S.ads.purchase : "";
      if (S.ads.id && label) {
        window.gtag("event", "conversion", {
          send_to: `${S.ads.id}/${label}`,
          value: params.value, currency: params.currency, transaction_id: params.transaction_id,
        });
      }
    }
    if (typeof window.fbq === "function") {
      const px = { value: params.value, currency: params.currency, content_name: params.item_name || params.form };
      if (PIXEL[event]) window.fbq("track", PIXEL[event], px, params.transaction_id ? { eventID: params.transaction_id } : undefined);
      else window.fbq("trackCustom", event, params);
    }
  }
  window.track = track;

  const programParams = key => {
    const p = S.programs[key];
    return p ? { item_id: key, item_name: p.name, value: p.price, currency: S.currency } : {};
  };

  // Program page view
  const pageProgram = document.body.dataset.program;
  if (pageProgram) track("view_item", programParams(pageProgram));

  // ---------- Attribution: remember where the visitor first came from ----------
  (function captureAttribution() {
    const q = new URLSearchParams(location.search);
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];
    const found = {};
    keys.forEach(k => { if (q.get(k)) found[k] = q.get(k); });
    if (!store.get("ewa_attr") || Object.keys(found).length) {
      store.set("ewa_attr", {
        ...found,
        landing_page: location.pathname,
        referrer: document.referrer && !document.referrer.includes(location.host) ? document.referrer : "",
        first_seen: new Date().toISOString(),
      });
    }
  })();

  // ---------- Click tracking ----------
  document.addEventListener("click", e => {
    const a = e.target.closest("a");
    if (!a) return;
    if (a.dataset.pay) track("begin_checkout", programParams(a.dataset.pay));
    else if (a.dataset.book) track("schedule_click", programParams(a.dataset.book));
    else if (a.dataset.contact || /wa\.me|instagram\.com/.test(a.href)) {
      track("contact", { method: a.dataset.contact || (a.href.includes("wa.me") ? "whatsapp" : "instagram"), location: a.closest(".fab") ? "fab" : "page" });
    }
  });

  // ---------- Mobile menu ----------
  const menuBtn = document.querySelector(".menu-btn");
  const links = document.querySelector(".nav-links");
  if (menuBtn && links) {
    menuBtn.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", e => {
      if (e.target.closest("a")) { links.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
    });
  }

  // ---------- Sticky mobile CTA (and lift the floating buttons above it) ----------
  const sticky = document.querySelector(".sticky-cta");
  const hero = document.querySelector(".hero");
  const offer = document.querySelector("[data-offer]");
  if (sticky && hero && "IntersectionObserver" in window) {
    let pastHero = false, offerVisible = false;
    const update = () => {
      const show = pastHero && !offerVisible;
      sticky.classList.toggle("show", show);
      document.body.classList.toggle("sticky-on", show);
    };
    new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; update(); }).observe(hero);
    if (offer) new IntersectionObserver(([e]) => { offerVisible = e.isIntersecting; update(); }).observe(offer);
  }

  // ---------- Forms → relay / webhook, with a WhatsApp fallback ----------
  document.querySelectorAll("form[data-form]").forEach(form => {
    const started = Date.now();
    // Honeypot: invisible to people, irresistible to bots.
    const hp = document.createElement("div");
    hp.className = "hp";
    hp.setAttribute("aria-hidden", "true");
    hp.innerHTML = '<label>Website <input name="website" tabindex="-1" autocomplete="off"></label>';
    form.appendChild(hp);

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("[type=submit]");
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "Sending…";

      const fd = new FormData(form);
      const data = {};
      fd.forEach((v, k) => { data[k] = data[k] ? `${data[k]}, ${v}` : v; });
      const payload = {
        form: form.dataset.form,
        page: location.pathname + location.search,
        elapsedMs: Date.now() - started,
        data,
        attribution: store.get("ewa_attr") || {},
      };

      let delivered = false;
      if (S.forms.endpoint) {
        try {
          const res = await fetch(S.forms.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
          });
          delivered = res.ok;
        } catch (_) { delivered = false; }
      }

      track("generate_lead", { form: form.dataset.form, delivered });

      const ok = document.getElementById(form.dataset.success);
      form.hidden = true;
      if (ok) {
        if (!delivered) {
          // Couldn't reach the webhook: hand the visitor a ready-to-send WhatsApp message.
          const text = Object.entries(data)
            .filter(([k, v]) => v && k !== "website")
            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
            .join("\n");
          const fb = document.createElement("div");
          fb.className = "fallback";
          fb.innerHTML = '<p>One last step: tap below to send your answers on WhatsApp.</p>';
          const a = document.createElement("a");
          a.className = "btn btn-orange";
          a.target = "_blank";
          a.rel = "noopener";
          a.href = waLink(`[${form.dataset.form}]\n${text}`);
          a.textContent = "Send on WhatsApp →";
          fb.appendChild(a);
          ok.appendChild(fb);
        }
        ok.classList.add("show");
        ok.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      btn.disabled = false;
      btn.innerHTML = label;
    });
  });

  // ---------- Application form: pre-select the program, show project questions for the Intensive ----------
  const apply = document.querySelector("[data-apply]");
  if (apply) {
    const extras = [...apply.querySelectorAll("[data-show-for]")];
    const goalLabel = apply.querySelector("[data-goal-label]");
    const sync = () => {
      const chosen = (apply.querySelector("input[name=program]:checked") || {}).value;
      extras.forEach(box => {
        const on = box.dataset.showFor === chosen;
        box.hidden = !on;
        // Hidden questions must not block submission or be sent.
        box.querySelectorAll("input, select, textarea").forEach(el => { el.disabled = !on; });
      });
      if (goalLabel) goalLabel.textContent = chosen === "implementation" ? "What do you want to build?" : "What do you want to achieve with AI?";
    };
    const wanted = new URLSearchParams(location.search).get("program");
    const radio = wanted && apply.querySelector(`input[name=program][value="${CSS.escape(wanted)}"]`);
    if (radio) radio.checked = true;
    apply.addEventListener("change", e => { if (e.target.name === "program") sync(); });
    sync();
  }

  // ---------- "Find my program" quiz ----------
  const quiz = document.querySelector("[data-quiz]");
  if (quiz) {
    const steps = [...quiz.querySelectorAll(".quiz-step")];
    const bar = quiz.querySelector(".quiz-progress div");
    const answers = {};
    let i = 0;
    const show = n => {
      steps.forEach((s, k) => s.classList.toggle("active", k === n));
      bar.style.width = Math.min(100, (n / (steps.length - 1)) * 100) + "%";
      i = n;
    };
    quiz.addEventListener("click", e => {
      const opt = e.target.closest(".option");
      if (opt) {
        answers[steps[i].dataset.q] = opt.dataset.v;
        if (i + 1 === steps.length - 1) render();
        show(i + 1);
        return;
      }
      if (e.target.closest(".quiz-restart")) show(0);
      else if (e.target.closest(".quiz-back")) show(Math.max(0, i - 1));
    });

    // Mirrors the "How to recommend the right package" table in the blueprint.
    function recommend(a) {
      if (a.goal === "build" && a.experience !== "none") return "implementation";
      if (a.goal === "build") return "growth";
      if (a.depth === "one" || a.goal === "unsure") return "clarity";
      if (a.depth === "skill") return "growth";
      return a.experience === "none" ? "clarity" : "growth";
    }
    const why = {
      clarity: "You have a specific problem (or aren't sure yet what you need). One focused 90-minute session will get you the right tools and a workflow you can use the same day, with no long commitment.",
      growth: "You want AI to become a real, repeatable skill rather than a one-off fix. Four weekly sessions take you from foundations to a finished mini-project built around your own work.",
      implementation: "You have a concrete idea and some AI experience. Over four guided build sessions we'll design, build and test one working prototype, and you'll understand every decision behind it.",
    };
    function render() {
      const key = recommend(answers);
      const p = S.programs[key];
      const out = quiz.querySelector(".quiz-result");
      out.querySelector("h3").textContent = p.name;
      out.querySelector("[data-why]").textContent = why[key];
      out.querySelector("[data-rp]").textContent = (p.priceIsFrom ? "from " : "") + inr(p.price);
      const cta = out.querySelector("[data-go]");
      cta.href = p.url;
      cta.firstChild.textContent = key === "implementation" ? "See how it works " : "See the program ";
      track("quiz_complete", { recommendation: key, ...answers });
    }
    show(0);
  }

  // ---------- Thank-you page ----------
  const ty = document.querySelector("[data-thankyou]");
  if (ty) {
    const q = new URLSearchParams(location.search);
    const key = S.programs[q.get("program")] ? q.get("program") : "clarity";
    const p = S.programs[key];
    ty.querySelectorAll("[data-program-name]").forEach(el => { el.textContent = p.name; });
    ty.querySelectorAll("[data-ty-book]").forEach(el => { el.href = p.bookingLink; });
    const hidden = ty.querySelector("input[name=program]");
    if (hidden) hidden.value = p.name;
    ty.querySelectorAll("[data-only]").forEach(el => { el.hidden = el.dataset.only !== key; });

    // Count a purchase only when the link carries a payment reference (?payment_id=…), and only once.
    const paymentId = q.get("payment_id");
    const seen = store.get("ewa_purchases") || [];
    if (paymentId && !seen.includes(paymentId)) {
      track("purchase", { ...programParams(key), transaction_id: paymentId });
      store.set("ewa_purchases", seen.concat(paymentId).slice(-20));
    }
  }
})();
