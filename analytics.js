// Flexus analytics — GA4 event tracking
(function(){
  'use strict';

  if (window.__FLEXUS_ANALYTICS_BOUND__) return;
  window.__FLEXUS_ANALYTICS_BOUND__ = true;

  function track(eventName, params){
    if (typeof gtag !== 'function') return;
    gtag('event', eventName, params || {});
  }

  // PDF download click tracking
  // Fires 'file_download' event with file name and series label
  function bindDownloads(){
    var links = document.querySelectorAll('a[href$=".pdf"][download], a[href*="/pdfs/"]');
    links.forEach(function(link){
      link.addEventListener('click', function(){
        var href = link.getAttribute('href') || '';
        var parts = href.split('/');
        var fileName = parts[parts.length - 1].replace('.pdf','').replace(/_/g,' ');
        var series = href.indexOf('/ap/') !== -1 ? 'AP' : href.indexOf('/cp/') !== -1 ? 'CP' : 'unknown';
        track('file_download', {
          file_name: fileName,
          file_extension: 'pdf',
          link_url: href,
          series: series
        });
      });
    });
  }

  // Form submission tracking
  // Fires before redirect to /thanks — hooks into the forms.js submit flow
  function bindForms(){
    document.querySelectorAll('form[data-netlify="true"]').forEach(function(form){
      form.addEventListener('submit', function(){
        var name = form.getAttribute('name') || 'unknown';
        var eventName = 'form_submit';
        var label = name;

        if (name === 'sample-request')  label = 'Sample Request';
        if (name === 'spec-pack-request') label = 'Spec Pack Request';
        if (name === 'installer-application') label = 'Installer Application';

        track(eventName, {
          form_name: label,
          form_id: name
        });
      }, true); // capture phase — fires before forms.js preventDefault
    });
  }

  // Budget estimator CTA clicks
  function bindEstimatorCTAs(){
    document.querySelectorAll('.budget-cta-row a').forEach(function(link){
      link.addEventListener('click', function(){
        var series = (document.querySelector('.budget-btn[data-series].active') || {}).dataset && document.querySelector('.budget-btn[data-series].active').dataset.series || 'unknown';
        var lift = (document.querySelector('.budget-btn[data-lift].active') || {}).dataset && document.querySelector('.budget-btn[data-lift].active').dataset.lift || 'unknown';
        var area = document.getElementById('area-slider') ? document.getElementById('area-slider').value : 'unknown';
        var label = (link.textContent || '').trim();
        track('estimator_cta_click', {
          cta_label: label,
          series: series,
          lift: lift,
          area_sf: parseInt(area) || 0
        });
      });
    });
  }

  // Nav CTA clicks (Spec Pack + Request Sample in header)
  function bindNavCTAs(){
    document.querySelectorAll('.nav-actions a.pill, .sheet-cta a.pill').forEach(function(link){
      link.addEventListener('click', function(){
        track('nav_cta_click', {
          cta_label: (link.textContent || '').trim(),
          destination: link.getAttribute('href') || ''
        });
      });
    });
  }

  function init(){
    bindDownloads();
    bindForms();
    bindEstimatorCTAs();
    bindNavCTAs();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
