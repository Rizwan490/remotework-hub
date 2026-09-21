/* =============================================================================
   ads.js — AD SLOT ARCHITECTURE
   -----------------------------------------------------------------------------
   The site ships with EMPTY, clearly-labelled ad containers. No advertising is
   rendered until you set `enabled: true` below and paste your publisher code.

   HOW TO TURN ADS ON
   ------------------
   1. Set ADS_CONFIG.enabled = true
   2. Set ADS_CONFIG.provider = 'adsense' | 'adsterra' | 'hilltopads' | 'custom'
   3. Paste the ad code your network gives you into the matching slot string.
      Each string is raw HTML (and may contain <script> tags — they are
      re-created so the browser executes them).
   4. For AdSense only: also set adsense.client so the loader script is added.

   WHERE THE CODE GOES
   -------------------
      header   -> <div class="ad-slot" data-ad="header">    (below the navbar)
      inline   -> <div class="ad-slot" data-ad="inline">    (between listings)
      sidebar  -> <div class="ad-slot" data-ad="sidebar">   (job detail sidebar)
      footer   -> <div class="ad-slot" data-ad="footer">    (above the footer)
      mobile   -> <div class="ad-slot" data-ad="mobile">    (mobile-only slot)

   RULES THIS FILE ENFORCES
   ------------------------
   * No auto-clicking, no pop-unders, no forced or timed redirects.
   * No hidden ads — a disabled slot renders nothing and collapses to 0 height.
   * Ad slots are always labelled "Advertisement" so they can never be mistaken
     for a job listing or an Apply button.
   ========================================================================== */

'use strict';

const ADS_CONFIG = {
  enabled: false,
  provider: 'none', // 'none' | 'adsense' | 'adsterra' | 'hilltopads' | 'custom'

  /* Paste publisher HTML/JS for each placement. Empty string = slot stays off. */
  header: '',
  inline: '',
  sidebar: '',
  footer: '',
  mobile: '',

  /* AdSense only — the loader is injected once when a client id is present. */
  adsense: {
    client: '' // e.g. 'ca-pub-0000000000000000'
  },

  /* Show the small "Advertisement" caption above each filled slot. */
  showLabel: true,

  /* How many job cards before an inline ad slot is inserted on list pages. */
  inlineEvery: 6
};

const Ads = (() => {
  let loaderInjected = false;

  function injectAdSenseLoader() {
    if (loaderInjected) return;
    const client = (ADS_CONFIG.adsense && ADS_CONFIG.adsense.client) || '';
    if (ADS_CONFIG.provider !== 'adsense' || !client) return;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src =
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
      encodeURIComponent(client);
    document.head.appendChild(s);
    loaderInjected = true;
  }

  /* Publisher snippets usually contain <script>. innerHTML will not execute
     those, so each script node is rebuilt and re-appended. */
  function writeSnippet(container, html) {
    const frag = document.createRange().createContextualFragment(html);
    container.appendChild(frag);
    container.querySelectorAll('script').forEach((old) => {
      const s = document.createElement('script');
      for (const attr of old.attributes) s.setAttribute(attr.name, attr.value);
      s.text = old.textContent;
      old.replaceWith(s);
    });
  }

  function fill(slot) {
    if (slot.dataset.adFilled === '1') return;
    const key = slot.dataset.ad;
    const code = ADS_CONFIG[key];
    if (!ADS_CONFIG.enabled || !code) return; // stays empty and collapsed

    slot.dataset.adFilled = '1';
    slot.classList.add('is-active');

    if (ADS_CONFIG.showLabel) {
      const label = document.createElement('span');
      label.className = 'ad-slot__label';
      label.textContent = 'Advertisement';
      slot.appendChild(label);
    }

    const body = document.createElement('div');
    body.className = 'ad-slot__body';
    slot.appendChild(body);
    writeSnippet(body, code);
  }

  /* Fill slots only when they scroll near the viewport — keeps the first paint
     fast and avoids requesting ads the visitor never sees. */
  function observe(root) {
    const slots = (root || document).querySelectorAll('.ad-slot:not([data-ad-filled])');
    if (!slots.length) return;
    if (!('IntersectionObserver' in window)) {
      slots.forEach(fill);
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            fill(e.target);
            obs.unobserve(e.target);
          }
        });
      },
      { rootMargin: '300px 0px' }
    );
    slots.forEach((s) => io.observe(s));
  }

  /* Returns the markup for an inline slot so list renderers can inject one. */
  function inlineSlotHTML() {
    if (!ADS_CONFIG.enabled || !ADS_CONFIG.inline) return '';
    return '<div class="ad-slot ad-slot--inline" data-ad="inline"></div>';
  }

  function init() {
    injectAdSenseLoader();
    observe(document);
  }

  return { init, observe, inlineSlotHTML, fill };
})();
