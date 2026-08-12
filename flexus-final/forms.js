// Flexus: Netlify AJAX forms + toasts (runs even if site.js errors)
(function(){
  'use strict';

  if (window.__FLEXUS_FORMS_BOUND__) return;
  window.__FLEXUS_FORMS_BOUND__ = true;

  function ensureToastWrap(){
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      (document.body || document.documentElement).appendChild(wrap);
    }
    wrap.style.zIndex = '99999';
    wrap.style.position = 'fixed';
    wrap.style.left = '16px';
    wrap.style.right = '16px';
    wrap.style.bottom = '16px';
    wrap.style.pointerEvents = 'none';
    return wrap;
  }

  function showToast(opts){
    const o = opts || {};
    const title = o.title || '';
    const message = o.message || '';
    const variant = o.variant || 'success';
    const timeout = typeof o.timeout === 'number' ? o.timeout : 5200;

    const wrap = ensureToastWrap();
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + variant;
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');

    const content = document.createElement('div');
    content.className = 'toast-content';

    const t = document.createElement('div');
    t.className = 'toast-title';
    t.textContent = title;

    const m = document.createElement('div');
    m.className = 'toast-msg';
    m.textContent = message;

    content.appendChild(t);
    if (message) content.appendChild(m);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label','Close');
    close.textContent = '×';

    toast.appendChild(content);
    toast.appendChild(close);
    wrap.appendChild(toast);

    function remove(){
      if (!toast.isConnected) return;
      toast.classList.remove('show');
      setTimeout(()=>{ try{ toast.remove(); }catch(_e){} }, 220);
    }

    close.addEventListener('click', remove);
    setTimeout(()=> toast.classList.add('show'), 0);
    if (timeout > 0) setTimeout(remove, timeout);

    return { toast, remove };
  }

  function collectFormData(form){
    const data = new FormData(form);
    // Ensure form-name is present — required for Netlify AJAX submissions
    const formName = form.getAttribute('name') || data.get('form-name');
    if (formName && !data.get('form-name')) data.set('form-name', formName);
    return new URLSearchParams(data).toString();
  }

  function unlockScroll(){
    try{
      const body = document.body;
      const root = document.documentElement;
      const top = body.style.top;
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      root.style.overflow = '';
      if (top && top.startsWith('-')){
        const y = Math.abs(parseInt(top,10) || 0);
        window.scrollTo(0, y);
      }
    } catch(_e){}
  }

  function closeParentModal(form){
    const modal = form.closest && form.closest('.modal');
    if (modal && modal.classList.contains('open')){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
      unlockScroll();
    }
  }

  async function submitNetlify(form){
    // Per Netlify docs, AJAX submissions for static HTML forms must POST to '/'.
    // Netlify intercepts this at the CDN level regardless of which page you're on.
    const body = collectFormData(form);

    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  }

  function bind(){
    const forms = Array.from(document.querySelectorAll('form[data-netlify="true"][data-netlify-ajax="true"]'));
    if (!forms.length) return;

    forms.forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;

        const formName = form.getAttribute('name') || '';

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        const prevText = submitBtn ? (submitBtn.tagName === 'BUTTON' ? submitBtn.textContent : submitBtn.value) : '';
        if (submitBtn){
          submitBtn.disabled = true;
          if (submitBtn.tagName === 'BUTTON') submitBtn.textContent = 'Sending…';
          else submitBtn.value = 'Sending…';
        }

        try{
          await submitNetlify(form);
          closeParentModal(form);
          // Redirect to thank-you page — Netlify doesn't do this automatically for AJAX
          window.location.href = '/thanks?from=' + encodeURIComponent(formName);
        }catch(err){
          showToast({
            title: 'Submission failed',
            message: 'Please try again. If it continues, email us at support@flexusco.com.',
            variant: 'error',
            timeout: 7000
          });
        }finally{
          if (submitBtn){
            submitBtn.disabled = false;
            if (submitBtn.tagName === 'BUTTON') submitBtn.textContent = prevText;
            else submitBtn.value = prevText;
          }
        }
      });
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

})();
