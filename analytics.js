// Custom events for the existing G-5T6ESYM3SB snippet. No new tag is loaded here.
(function () {
  if (window.__FLEXUS_ANALYTICS_BOUND__) return;
  window.__FLEXUS_ANALYTICS_BOUND__ = true;
  var track = window.FlexusTrack;
  if (!track) return;

  var started = false;

  function topicSelected(form) {
    var select = form.querySelector("#topic");
    return track.topicEnum(select ? select.value : "");
  }

  function formOf(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (el) {
      if (el.matches && el.matches(track.FORM_SELECTOR)) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener("focusin", function (e) {
    if (!e.isTrusted || started) return;
    var form = formOf(e.target);
    if (!form) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag !== "input" && tag !== "select" && tag !== "textarea") return;
    started = true;
    track.emit("form_start", { form_id: "contact" });
  }, true);

  document.addEventListener("invalid", function (e) {
    if (!e.isTrusted) return;
    var form = e.target && e.target.form;
    if (!form || !form.matches || !form.matches(track.FORM_SELECTOR)) return;
    if (form.__flexusInvalid) return;
    form.__flexusInvalid = true;
    setTimeout(function () { form.__flexusInvalid = false; }, 0);
    var topic = topicSelected(form);
    if (!topic) return;
    track.emit("form_error", { form_id: "contact", topic: topic, error_code: "invalid" });
  }, true);

  document.addEventListener("submit", function (e) {
    if (!e.isTrusted) return;
    var form = e.target;
    if (!form || !form.matches || !form.matches(track.FORM_SELECTOR)) return;
    var topic = topicSelected(form);
    if (!topic) return;
    if (e.defaultPrevented) {
      if (!form.__flexusInvalid) track.emit("form_error", { form_id: "contact", topic: topic, error_code: "invalid" });
      return;
    }
    if (form.checkValidity && !form.checkValidity()) return;
    track.emit("form_attempt", { form_id: "contact", topic: topic });
  }, false);

  document.addEventListener("change", function (e) {
    var eventParams = track.materialEvent(e.target, e.isTrusted);
    if (eventParams) track.emit("material_select", eventParams);
  }, true);

  document.addEventListener("click", function (e) {
    if (!e.isTrusted) return;
    var el = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
    if (!el || !el.closest) return;
    var link = el.closest("a[href]");
    if (!link) return;
    var href = link.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0 || href.indexOf("mailto:") === 0) {
      track.emit("contact_click", {
        method: href.indexOf("tel:") === 0 ? "phone" : "email",
        placement: track.anchorPlacement(link)
      });
      return;
    }
    var intent = track.ctaIntent(href);
    var placement = track.ctaPlacement(link);
    if (intent && placement) track.emit("cta_click", { intent: intent, placement: placement });
    var pdf = track.pdfEvent(href);
    if (pdf) track.emit("file_download", pdf);
  }, true);

  var path = (location.pathname || "/").replace(/\.html$/, "");
  if (path === "/thanks" || path === "/success") {
    var lead = null;
    try { lead = track.leadEventFromVisit(window.sessionStorage); } catch (_e) { lead = null; }
    if (lead) track.emit("generate_lead", lead);
  }
})();
