// Shared EcoPave site JS: nav active, mobile sheet, reveal, year, optional parallax

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const supportsInert = "inert" in HTMLElement.prototype;

// Header stays above the page. Content scrolls in .site-scroll so the bar never covers fields.
(function pinHeader() {
  const nav = document.querySelector("header.nav");
  if (!nav || document.querySelector(".site-scroll")) return;
  const sheetEl = document.getElementById("mobile-sheet");
  const scroller = document.createElement("div");
  scroller.className = "site-scroll";
  const keep = new Set([nav, sheetEl].filter(Boolean));
  [...document.body.childNodes].forEach(node => {
    if (node.nodeType === 1 && keep.has(node)) return;
    if (node.nodeType === 3 && !String(node.textContent || "").trim()) return;
    scroller.appendChild(node);
  });
  document.body.appendChild(scroller);
  document.body.classList.add("has-fixed-nav");
  const to = new URLSearchParams(location.search).get("to");
  const hashId = to || (location.hash ? decodeURIComponent(location.hash.slice(1)) : "");
  if (hashId) {
    const target = document.getElementById(hashId);
    if (target) {
      if (to && history.replaceState) {
        history.replaceState(null, "", (location.pathname || "/") + "#" + hashId);
      }
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }
  }
})();

function pageScroller() {
  return document.querySelector(".site-scroll");
}

document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = decodeURIComponent(a.getAttribute("href").slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ block: "start" });
  if (history.pushState) history.pushState(null, "", "#" + id);
});

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

function linkKey(href) {
  try {
    const url = new URL(href, location.origin);
    const path = (url.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/");
    return path + url.hash;
  } catch (e) {
    return href || "";
  }
}

// Pages that hide the link row still need those destinations, and the header CTAs, in the menu.
(function fillSheet() {
  if (!sheet) return;
  const body = sheet.querySelector(".sheet-body");
  if (!body) return;
  let cta = body.querySelector(".sheet-cta");
  if (!cta) {
    cta = document.createElement("div");
    cta.className = "sheet-cta";
    body.appendChild(cta);
  }
  const have = new Set([...body.querySelectorAll("a")].map(a => linkKey(a.getAttribute("href"))));
  document.querySelectorAll(".nav-links a").forEach(a => {
    const key = linkKey(a.getAttribute("href"));
    if (!key || have.has(key)) return;
    const link = a.cloneNode(true);
    link.className = "sheet-link";
    link.setAttribute("data-sheet-link", "");
    body.insertBefore(link, cta);
    have.add(key);
  });
  document.querySelectorAll(".nav-actions a.pill").forEach(a => {
    const key = linkKey(a.getAttribute("href"));
    if (!key || have.has(key)) return;
    const link = a.cloneNode(true);
    link.setAttribute("data-sheet-link", "");
    cta.appendChild(link);
    have.add(key);
  });
})();

const sheetLinks = sheet ? sheet.querySelectorAll("a[data-sheet-link]") : [];
const sheetBackdrop = sheet ? sheet.querySelector("[data-sheet-close]") : null;

let scrollYBeforeLock = 0;
let lastFocusedEl = null;

const focusableSelector =
  "a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])";

function lockScroll(lock) {
  const scroller = pageScroller();
  if (scroller) {
    if (lock) {
      scrollYBeforeLock = scroller.scrollTop || 0;
      scroller.style.overflow = "hidden";
    } else {
      scroller.style.overflow = "";
      scroller.scrollTop = scrollYBeforeLock;
    }
    return;
  }
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
  if (window.innerWidth > 1439) closeSheet();
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
  const scrollTarget = pageScroller() || window;
  scrollTarget.addEventListener("scroll", () => {
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

  const formSelector = (window.FlexusTrack && FlexusTrack.FORM_SELECTOR) || "form[data-flexus-form]";
  window.__flexusApplyAttr = function(){
    document.querySelectorAll(formSelector).forEach(apply);
  };
  window.__flexusApplyAttr();
  // Capture phase fills attribution before the browser builds the native POST.
  // Do not preventDefault. A static HTTP 200 is not proof Netlify stored the form.
  document.addEventListener("submit", function (e) {
    const form = e.target;
    if (!form || !form.matches || !form.matches(formSelector)) return;
    apply(form);
  }, true);
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
  const granuleColorWrap = document.getElementById("mq-granule-color-wrap");
  const addrWrap = document.getElementById("mq-address-wrap");
  const grade = document.getElementById("mq-grade");
  const color = document.getElementById("mq-color");
  const granuleColor = document.getElementById("mq-granule-color");
  const addr = document.getElementById("mq-address");
  function checked(value){
    const el = form.querySelector('input[name="Product"][value="' + value + '"]');
    return !!(el && el.checked);
  }
  function setField(wrap, input, on){
    if (!wrap || !input) return;
    wrap.hidden = !on;
    input.required = !!on;
    input.disabled = !on;
  }
  function sync(){
    const granules = checked("colored-granules");
    const mulch = checked("rubber-mulch");
    const need = (form.querySelector('input[name="Need"]:checked') || {}).value || "quote";
    const wantSample = need === "sample" || need === "both";
    setField(gradeWrap, grade, granules);
    setField(colorWrap, color, mulch);
    setField(granuleColorWrap, granuleColor, granules);
    setField(addrWrap, addr, wantSample);
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
  if (color) color.value = "";
  if (granuleColor) granuleColor.value = "";
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

// ========= Sticky mobile call / project bar =========
(function initMobileBar(){
  if (document.querySelector('.mobile-action-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'mobile-action-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Contact Flexus');
  bar.innerHTML = '<a class="pill" href="tel:+17707426016">Call</a><a class="pill primary" href="/contact?topic=spec-support">Specification support</a>';
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



// Old sample links used ?blend= codes. Note the palette on the contact form. Do not rewrite headings.
(function prefillBlend() {
  const params = new URLSearchParams(window.location.search);
  const blend = params.get('blend');
  if (!blend) return;

  const blendMap = {
    'CE275': 'Charcoal Earth',
    'SD255': 'Sand Dune',
    'NT265': 'Natural Trail',
    'CG218': 'Coastal Granite',
  };
  const blendName = blendMap[blend];
  if (!blendName) return;

  function init() {
    const topic = document.getElementById('topic');
    if (topic) {
      topic.value = 'sample';
      topic.dispatchEvent(new Event('change'));
    }
    const sampleSeries = document.getElementById('sample-series');
    if (sampleSeries) sampleSeries.value = 'AP';
    const notes = document.getElementById('notes');
    if (notes && !notes.value) {
      notes.value = 'Pavement sample, AP palette: ' + blendName + '.';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
