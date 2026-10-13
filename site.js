// Shared EcoPave site JS: nav active, mobile sheet, reveal, year, optional parallax

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const supportsInert = "inert" in HTMLElement.prototype;

// ========= Year =========
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// ========= Reveal =========
const sections = document.querySelectorAll("main section.reveal");
if (sections.length) {
  const revealObserver = new IntersectionObserver(
    entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add("visible"); }),
    { threshold: 0.16 }
  );
  sections.forEach(section => revealObserver.observe(section));
}

// ========= Nav active (by pathname) =========
(function markActiveNav() {
  function norm(p) {
    if (!p) return "/";
    let out = p.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    out = out.replace(/\.html$/, "") || "/";
    if (out === "/index") return "/";
    return out;
  }
  const path = norm(location.pathname || "/");
  const links = document.querySelectorAll("[data-nav] a[data-path]");
  links.forEach(a => {
    const p = norm(a.getAttribute("data-path"));
    const isActive = p === path || (p !== "/" && path.startsWith(p + "/"));
    a.classList.toggle("active", isActive);
    a.setAttribute("aria-current", isActive ? "page" : "false");
  });
})();

// ========= Mobile sheet =========
const sheet = document.getElementById("mobile-sheet");
const menuBtn = document.getElementById("menu-btn");
const sheetClose = document.getElementById("sheet-close");
const sheetPanel = sheet ? sheet.querySelector(".sheet-panel") : null;
const sheetLinks = sheet ? sheet.querySelectorAll("a[data-sheet-link]") : [];
const sheetBackdrop = sheet ? sheet.querySelector("[data-sheet-close]") : null;

let scrollYBeforeLock = 0;
let lastFocusedEl = null;

const focusableSelector =
  "a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])";

function lockScroll(lock) {
  const root = document.documentElement;
  const body = document.body;
  if (lock) {
    scrollYBeforeLock = window.scrollY || window.pageYOffset || 0;
    body.style.position = "fixed";
    body.style.top = `-${scrollYBeforeLock}px`;
    body.style.left = "0";
    body.style.right = "0";
    root.style.overflow = "hidden";
  } else {
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    root.style.overflow = "";
    window.scrollTo(0, scrollYBeforeLock);
  }
}

function setPageInert(isInert) {
  const main = document.querySelector("main");
  const nav = document.querySelector("header.nav");
  const footer = document.querySelector("footer");
  const targets = [main, nav, footer].filter(Boolean);

  if (isInert) {
    if (supportsInert) targets.forEach(el => el.setAttribute("inert", ""));
    else targets.forEach(el => el.setAttribute("aria-hidden", "true"));
  } else {
    targets.forEach(el => { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); });
  }
}

function getVisibleFocusables(container) {
  return Array.from(container.querySelectorAll(focusableSelector))
    .filter(el => el.offsetParent !== null && !el.hasAttribute("disabled"));
}

function focusFirstInSheet() {
  if (!sheet) return;
  const focusables = getVisibleFocusables(sheet);
  const first = focusables[0] || sheetPanel || sheet;
  if (first && typeof first.focus === "function") first.focus();
}

function openSheet() {
  if (!sheet || !menuBtn) return;
  if (sheet.classList.contains("open")) return;

  lastFocusedEl = document.activeElement;
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  menuBtn.setAttribute("aria-expanded", "true");
  setPageInert(true);
  lockScroll(true);
  requestAnimationFrame(focusFirstInSheet);
}

function closeSheet() {
  if (!sheet || !menuBtn) return;
  if (!sheet.classList.contains("open")) return;

  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  menuBtn.setAttribute("aria-expanded", "false");
  setPageInert(false);
  lockScroll(false);

  if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
    requestAnimationFrame(() => lastFocusedEl.focus());
  }
}

menuBtn?.addEventListener("click", () => {
  const isOpen = sheet?.classList.contains("open");
  if (isOpen) closeSheet();
  else openSheet();
});
sheetClose?.addEventListener("click", closeSheet);
sheetBackdrop?.addEventListener("click", closeSheet);
sheetLinks?.forEach(a => a.addEventListener("click", closeSheet));

document.addEventListener("keydown", (e) => {
  if (!sheet?.classList.contains("open")) return;

  if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
  if (e.key !== "Tab") return;

  const focusables = getVisibleFocusables(sheet);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

function closeIfDesktop() {
  if (!sheet?.classList.contains("open")) return;
  if (window.innerWidth > 980) closeSheet();
}
window.addEventListener("resize", closeIfDesktop, { passive: true });
window.addEventListener("orientationchange", closeIfDesktop, { passive: true });

// ========= Optional hero micro-parallax (only if present) =========
const heroMedia = document.querySelector(".hero-media img");
if (heroMedia && !prefersReducedMotion) {
  let ticking = false;
  function onScrollParallax() {
    if (sheet?.classList.contains("open")) { ticking = false; return; }
    const rect = heroMedia.getBoundingClientRect();
    const windowH = window.innerHeight || document.documentElement.clientHeight;
    const progress = 1 - Math.min(Math.max(rect.top / windowH, 0), 1);
    const translate = (progress - 0.5) * 10;
    heroMedia.style.transform = `translateY(${translate}px) scale(1.02)`;
    ticking = false;
  }
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScrollParallax);
  }, { passive: true });
  requestAnimationFrame(onScrollParallax);
}


// ========= Modal (Netlify popup forms) =========
(function initModals(){
  const modals = document.querySelectorAll(".modal");
  if (!modals.length) return;

  function openModal(modal){
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    // lock scroll using existing helper if available
    try { lockScroll(true); } catch(e) {
      document.documentElement.style.overflow = "hidden";
    }
    // focus first field
    const first = modal.querySelector("input,select,textarea,button");
    if (first) setTimeout(()=>first.focus(), 0);
  }

  function closeModal(modal){
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    try { lockScroll(false); } catch(e) {
      document.documentElement.style.overflow = "";
    }
  }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-modal-open]");
    if (opener){
      e.preventDefault();
      const key = opener.getAttribute("data-modal-open");
      const modal = document.getElementById(`modal-${key}`);
      // set pack type if provided
      const pack = opener.getAttribute("data-pack");
      if (pack && modal){
        const hidden = modal.querySelector("#specPackType");
        if (hidden) hidden.value = pack;
      }
      openModal(modal);
      return;
    }
    const closer = e.target.closest("[data-modal-close]");
    if (closer){
      const modal = e.target.closest(".modal");
      closeModal(modal);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".modal.open");
    if (open) closeModal(open);
  });
})();


// ========= First-touch attribution (UTM, referrer, landing page) =========
(function initAttribution(){
  const KEY = "flexus_attr_v1";
  const keys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid"];
  let stored = {};
  try { stored = JSON.parse(sessionStorage.getItem(KEY) || "{}") || {}; } catch (_e) { stored = {}; }
  if (!stored.landing_page) stored.landing_page = (location.pathname || "/") + (location.search || "");
  if (!stored.referrer && document.referrer) stored.referrer = document.referrer;
  const params = new URLSearchParams(location.search);
  keys.forEach(k => {
    const v = params.get(k);
    if (v && !stored[k]) stored[k] = v;
  });
  try { sessionStorage.setItem(KEY, JSON.stringify(stored)); } catch (_e) {}

  function apply(form){
    if (!form) return;
    const values = {
      source: "flexusco.com",
      page: location.pathname || "/",
      landing_page: stored.landing_page || (location.pathname || "/"),
      referrer: stored.referrer || document.referrer || "",
      utm_source: stored.utm_source || "",
      utm_medium: stored.utm_medium || "",
      utm_campaign: stored.utm_campaign || "",
      utm_content: stored.utm_content || "",
      utm_term: stored.utm_term || "",
      gclid: stored.gclid || "",
      fbclid: stored.fbclid || ""
    };
    Object.keys(values).forEach(name => {
      const input = form.querySelector('input[name="' + name + '"]');
      if (input) input.value = values[name];
    });
  }

  window.__flexusApplyAttr = function(){
    document.querySelectorAll('form[data-netlify="true"]').forEach(apply);
  };
  window.__flexusApplyAttr();
})();

// ========= Sample request: address only when a tile is shipping =========
(function initSampleIntent(){
  const radios = document.querySelectorAll('input[name="RequestType"]');
  const wrap = document.getElementById("ship-wrap");
  const input = document.getElementById("ship");
  if (!radios.length || !wrap || !input) return;
  function sync(){
    const ship = document.querySelector('input[name="RequestType"][value="sample"]');
    const on = !!(ship && ship.checked);
    wrap.hidden = !on;
    input.required = on;
    input.disabled = !on;
  }
  radios.forEach(r => r.addEventListener("change", sync));
  sync();
})();

// ========= Materials quote: grade/color/address depend on the product =========
(function initMaterialsQuote(){
  const form = document.querySelector('form[name="materials-quote"]');
  if (!form) return;
  const gradeWrap = document.getElementById("mq-grade-wrap");
  const colorWrap = document.getElementById("mq-color-wrap");
  const addrWrap = document.getElementById("mq-address-wrap");
  const grade = document.getElementById("mq-grade");
  const color = document.getElementById("mq-color");
  const addr = document.getElementById("mq-address");
  function checked(value){
    const el = form.querySelector('input[name="Product"][value="' + value + '"]');
    return !!(el && el.checked);
  }
  function sync(){
    const granules = checked("colored-granules");
    const mulch = checked("rubber-mulch");
    const need = (form.querySelector('input[name="Need"]:checked') || {}).value || "quote";
    const wantSample = need === "sample" || need === "both";
    if (gradeWrap && grade){
      gradeWrap.hidden = !granules;
      grade.required = granules;
      grade.disabled = !granules;
    }
    if (colorWrap && color){
      const showColor = mulch || granules;
      colorWrap.hidden = !showColor;
      color.required = showColor;
      color.disabled = !showColor;
    }
    if (addrWrap && addr){
      addrWrap.hidden = !wantSample;
      addr.required = wantSample;
      addr.disabled = !wantSample;
    }
  }
  form.addEventListener("change", function(){
    sync();
    const note = document.getElementById("mq-product-note");
    if (note && form.querySelector('input[name="Product"]:checked')) note.hidden = true;
  });
  form.addEventListener("submit", function(e){
    if (form.querySelector('input[name="Product"]:checked')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const note = document.getElementById("mq-product-note");
    if (note) note.hidden = false;
    const first = form.querySelector('input[name="Product"]');
    if (first) first.focus();
  }, true);
  const params = new URLSearchParams(location.search);
  const product = params.get("product");
  const gradeParam = params.get("grade");
  if (product){
    const box = form.querySelector('input[name="Product"][value="' + product + '"]');
    if (box) box.checked = true;
  }
  if (grade && gradeParam){
    const opt = Array.from(grade.options).some(o => o.value === gradeParam);
    if (opt) grade.value = gradeParam;
  }
  sync();
})();

// ========= Open spec-pack modal when linked with ?pack= =========
(function openSpecFromQuery(){
  const pack = new URLSearchParams(location.search).get("pack");
  if (!pack) return;
  const opener = document.querySelector('[data-modal-open="spec"]');
  if (!opener) return;
  opener.setAttribute("data-pack", pack);
  opener.click();
})();

// ========= Toasts + Netlify form submit, then /thanks?from= =========
(function initToastsAndForms(){
  // Toast host
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.setAttribute('aria-live','polite');
    wrap.setAttribute('aria-atomic','true');
    document.body.appendChild(wrap);
  }

  function showToast({ title = '', message = '', variant = 'success', timeout = 5200 } = {}){
    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    toast.setAttribute('role', 'status');

    const content = document.createElement('div');
    const t = document.createElement('div');
    t.className = 'toast-title';
    t.textContent = title || (variant === 'error' ? 'Something went wrong' : 'Success');
    const m = document.createElement('div');
    m.className = 'toast-msg';
    m.textContent = message;
    content.appendChild(t);
    if (message) content.appendChild(m);

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.type = 'button';
    close.setAttribute('aria-label','Dismiss');
    close.textContent = '×';

    toast.appendChild(content);
    toast.appendChild(close);
    wrap.appendChild(toast);

    // animate in
    requestAnimationFrame(() => toast.classList.add('show'));

    let timer = null;
    function remove(){
      if (!toast.isConnected) return;
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }
    close.addEventListener('click', remove);
    if (timeout && timeout > 0) timer = setTimeout(remove, timeout);
    return { remove, toast, timer };
  }

  // Netlify expects urlencoded body. Keep action="/" so Netlify doesn't redirect.
  function encode(form){
    const data = new FormData(form);

    // Ensure Netlify always receives the form name (belt + suspenders)
    if (!data.has('form-name')){
      const n = form.getAttribute('name');
      if (n) data.append('form-name', n);
    }

    return new URLSearchParams(data).toString();
  }

  async function submitNetlifyForm(form){
    const body = encode(form);

    // Netlify records AJAX posts sent to the site root, not the action URL.
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    // Netlify forms typically return 200. Treat any 2xx as success.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  }

  if (window.__FLEXUS_FORMS_BOUND__) return;
  window.__FLEXUS_FORMS_BOUND__ = true;

  const forms = Array.from(document.querySelectorAll('form[data-netlify="true"]'));
  if (!forms.length) return;

  forms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      if (e.defaultPrevented) return;
      e.preventDefault();

      if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;
      if (typeof window.__flexusApplyAttr === 'function') window.__flexusApplyAttr();

      const formName = form.getAttribute('name') || '';
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const prevText = submitBtn ? (submitBtn.tagName === 'BUTTON' ? submitBtn.textContent : submitBtn.value) : '';

      if (submitBtn){
        submitBtn.disabled = true;
        if (submitBtn.tagName === 'BUTTON') submitBtn.textContent = 'Sending…';
        else submitBtn.value = 'Sending…';
      }

      try {
        await submitNetlifyForm(form);
        window.location.href = '/thanks?from=' + encodeURIComponent(formName);
      } catch (err){
        showToast({
          title: 'Submission failed',
          message: 'Please try again. If it continues, email us at info@flexusco.com.',
          variant: 'error',
          timeout: 7000
        });
        if (submitBtn){
          submitBtn.disabled = false;
          if (submitBtn.tagName === 'BUTTON') submitBtn.textContent = prevText;
          else submitBtn.value = prevText;
        }
      }
    });
  });
})();

// ========= Sticky mobile call / project bar =========
(function initMobileBar(){
  if (document.querySelector('.mobile-action-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'mobile-action-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Contact Flexus');
  bar.innerHTML = '<a class="pill" href="tel:+17707426016">Call</a><a class="pill primary" href="/installers#apply">Start a project</a>';
  document.body.appendChild(bar);
})();


/* ===== Overview Hero Carousel ===== */
(function () {
  const root = document.querySelector('[data-carousel]');
  if (!root) return;

  const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
  const dotsWrap = root.querySelector('[data-carousel-dots]');
  const dots = dotsWrap ? Array.from(dotsWrap.querySelectorAll('[data-carousel-dot]')) : [];
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');

  if (!slides.length) return;

  let idx = 0;
  let timer = null;

  function setActive(i) {
    idx = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is-active', k === idx));
    dots.forEach((d, k) => d.classList.toggle('is-active', k === idx));
  }

  function next() { setActive(idx + 1); }
  function prev() { setActive(idx - 1); }

  function startAuto() {
    stopAuto();
    // Only auto-rotate if there are multiple slides
    if (slides.length < 2) return;
    timer = window.setInterval(next, 6500);
  }

  function stopAuto() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  // Buttons
  if (nextBtn) nextBtn.addEventListener('click', () => { next(); startAuto(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); startAuto(); });

  // Dots
  dots.forEach((d) => {
    d.addEventListener('click', () => {
      const i = Number(d.getAttribute('data-carousel-dot'));
      if (!Number.isNaN(i)) {
        setActive(i);
        startAuto();
      }
    });
  });

  // Pause on hover/focus (desktop) and when page is hidden
  root.addEventListener('mouseenter', stopAuto);
  root.addEventListener('mouseleave', startAuto);
  root.addEventListener('focusin', stopAuto);
  root.addEventListener('focusout', startAuto);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAuto();
    else startAuto();
  });

  // Init
  setActive(0);
  startAuto();
})();



// ========= AP Palette blend pre-fill (request-sample page) =========
(function prefillBlend() {
  const params = new URLSearchParams(window.location.search);
  const blend = params.get('blend');
  if (!blend) return;

  const blendMap = {
    'CE275': 'Charcoal Earth (CE275)',
    'SD255': 'Sand Dune (SD255)',
    'NT265': 'Natural Trail (NT265)',
    'CG218': 'Coastal Granite (CG218)',
  };

  const blendName = blendMap[blend];
  if (!blendName) return;

  // Wait for DOM
  function init() {
    // Pre-select Series → AP
    const seriesEl = document.getElementById('series');
    if (seriesEl) {
      seriesEl.value = 'AP';
    }

    // Pre-select Lift → 200
    const liftsEl = document.getElementById('lifts');
    if (liftsEl) {
      liftsEl.value = '200';
    }

    // Pre-fill Project context with blend note
    const projectEl = document.getElementById('project');
    if (projectEl && !projectEl.value) {
      projectEl.value = `Requesting sample for AP blend: ${blendName}`;
    }

    // Update page heading to acknowledge the blend
    const heading = document.querySelector('.hero .h1');
    if (heading) {
      heading.textContent = 'Request a Sample';
    }

    const lede = document.querySelector('.hero .lede');
    if (lede) {
      lede.textContent = `You're requesting a sample for AP blend ${blendName}. Fill in your details and we'll get it out to you.`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
