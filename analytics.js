// Client events that enhanced measurement does not already own.
// Observed 2026-11-06 on property 537730101, stream G-5T6ESYM3SB:
// Form interactions ON, File downloads ON, Outbound clicks ON.
// forms and downloads stay false until that Admin toggle is confirmed off
// and a later deploy changes only the matching flag below.
// Renaming form_start or file_download does not dedupe the enhanced event.
// Do not use debug_mode as an exclusion switch.
(function () {
  "use strict";
  if (window.__FLEXUS_ANALYTICS_BOUND__) return;
  window.__FLEXUS_ANALYTICS_BOUND__ = true;
  var track = window.FlexusTrack;
  if (!track) return;

  var OWNER = { forms: false, downloads: false };
  var enabled = track.enabledEvents(OWNER);

  function emit(name, params) {
    if (typeof gtag !== "function") return;
    if (enabled.indexOf(name) === -1) return;
    var safe = track.sanitize ? track.sanitize(name, params) : params;
    if (!safe) return;
    gtag("event", name, safe);
  }

  function topicEnum(form) {
    var select = form && form.querySelector ? form.querySelector("#topic") : null;
    return track.topicEnum ? track.topicEnum(select ? select.value : "") : "";
  }

  if (enabled.indexOf("contact_click") !== -1 || enabled.indexOf("cta_click") !== -1 || enabled.indexOf("file_download") !== -1) {
    document.addEventListener("click", function (event) {
      if (!event.isTrusted) return;
      var el = event.target && event.target.nodeType === 1 ? event.target : (event.target && event.target.parentElement);
      if (!el || !el.closest) return;
      var link = el.closest("a[href]");
      if (!link) return;
      var href = link.getAttribute("href") || "";
      if (href.indexOf("tel:") === 0 || href.indexOf("mailto:") === 0) {
        emit("contact_click", {
          method: href.indexOf("tel:") === 0 ? "phone" : "email",
          placement: track.anchorPlacement(link)
        });
        return;
      }
      var intent = track.ctaIntent(href);
      var placement = track.ctaPlacement(link);
      if (intent && placement) emit("cta_click", { intent: intent, placement: placement });
      if (enabled.indexOf("file_download") !== -1 && track.pdfEvent) {
        var pdf = track.pdfEvent(href);
        if (pdf) emit("file_download", pdf);
      }
    }, true);
  }

  if (enabled.indexOf("material_select") !== -1 && track.materialEvent) {
    document.addEventListener("change", function (event) {
      var params = track.materialEvent(event.target, event.isTrusted);
      if (params) emit("material_select", params);
    }, true);
  }

  if (enabled.indexOf("form_start") !== -1) {
    var started = false;
    document.addEventListener("focusin", function (event) {
      if (!event.isTrusted || started) return;
      var form = event.target && event.target.form;
      if (!form || !form.matches || !form.matches(track.FORM_SELECTOR)) return;
      started = true;
      emit("form_start", { form_id: "contact" });
    }, true);
    document.addEventListener("submit", function (event) {
      if (!event.isTrusted) return;
      var form = event.target;
      if (!form || !form.matches || !form.matches(track.FORM_SELECTOR)) return;
      var topic = topicEnum(form);
      if (!topic) return;
      if (event.defaultPrevented) {
        emit("form_error", { form_id: "contact", topic: topic, error_code: "invalid" });
        return;
      }
      emit("form_attempt", { form_id: "contact", topic: topic });
    }, false);
  }
})();
