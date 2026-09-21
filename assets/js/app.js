/* =============================================================================
   app.js — shared utilities, page chrome and bootstrapping
   -----------------------------------------------------------------------------
   Everything here is framework-free and runs on every page. Page-specific work
   is dispatched from the `data-page` attribute on <body>.
   ========================================================================== */

'use strict';

const RW = (() => {
  /* ---------------------------------------------------------------- escape */
  const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Escape any value coming from jobs.json before it touches innerHTML. */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => ENT[c]);
  }

  /** Escape a value that will sit inside an HTML attribute. */
  const escAttr = esc;

  /* ------------------------------------------------------------------- dom */
  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v === false || v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  /* ----------------------------------------------------------------- query */
  function params() {
    return new URLSearchParams(window.location.search);
  }
  function param(name, fallback) {
    const v = params().get(name);
    return v === null || v === '' ? (fallback !== undefined ? fallback : '') : v;
  }

  /* ------------------------------------------------------------------ text */
  function slugify(str) {
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function truncate(str, max) {
    const s = String(str || '').trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }

  function initials(name) {
    const parts = String(name || '')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /* Deterministic accent per company so logo placeholders stay consistent. */
  function hueFor(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  /* ------------------------------------------------------------------ date */
  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value) {
    const d = parseDate(value);
    if (!d) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function relativeDate(value) {
    const d = parseDate(value);
    if (!d) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 14) return 'Last week';
    if (days < 31) return Math.floor(days / 7) + ' weeks ago';
    if (days < 62) return 'Last month';
    return Math.floor(days / 30) + ' months ago';
  }

  function isNew(value, withinDays) {
    const d = parseDate(value);
    if (!d) return false;
    return Date.now() - d.getTime() <= (withinDays || 7) * 86400000;
  }

  /* --------------------------------------------------------------- storage */
  const store = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (err) {
        /* storage unavailable — feature degrades silently */
      }
    }
  };

  const KEYS = { saved: 'rwh:saved', recent: 'rwh:recent' };

  /* ------------------------------------------------------------------- url */
  /** Only http(s) links are ever rendered as an external destination. */
  function safeUrl(value) {
    if (!value) return '';
    try {
      const u = new URL(String(value), window.location.href);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch (err) {
      return '';
    }
  }

  function absUrl(path) {
    const base = (SITE_CONFIG.url || '').replace(/\/+$/, '');
    return base + '/' + String(path || '').replace(/^\/+/, '');
  }

  /* The generated job pages live one folder deep (/remote-jobs/slug.html),
     so every link built in JavaScript is prefixed with <html data-base="../">
     when present. Root-level pages carry no data-base and get no prefix. */
  function basePath() {
    const b = document.documentElement.getAttribute('data-base') || '';
    if (!b) return '';
    return /\/$/.test(b) ? b : b + '/';
  }

  /** Turn a site-root-relative path into one that works from the current page. */
  function rel(path) {
    return basePath() + String(path || '').replace(/^\/+/, '');
  }

  function currentPath() {
    const p = window.location.pathname.replace(/^\/+/, '');
    return (p || 'index.html') + window.location.search;
  }

  /* ----------------------------------------------------------------- icons */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    wallet: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h11a2 2 0 0 1 2 2v1"/><rect x="3.5" y="7.5" width="17" height="11.5" rx="2.5"/><circle cx="16" cy="13.2" r="1.2"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.5"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5"/><path d="M3 12.5h18"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.5 5.4 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.4-3.5-8.5S9.6 5.9 12 3.5Z"/>',
    bookmark: '<path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13.4a.6.6 0 0 1-.94.5L12 16.2l-5.56 3.7a.6.6 0 0 1-.94-.5V6A1.5 1.5 0 0 1 7 4.5Z"/>',
    share: '<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.8 10.8 6.4-3.5M8.8 13.2l6.4 3.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    arrowRight: '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
    filter: '<path d="M4 6.5h16"/><path d="M7 12h10"/><path d="M10 17.5h4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4"/>',
    link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5L11.7 7.3"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.54 3.54 0 0 0 5 5l1.3-1.3"/>',
    inbox: '<path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4"/><path d="M5.6 5.5h12.8l2.1 8v4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-4Z"/>',
    building: '<rect x="4.5" y="4" width="15" height="16" rx="2"/><path d="M9 8.5h2M13 8.5h2M9 12.5h2M13 12.5h2M10.5 20v-3.5h3V20"/>',
    /* category icons */
    headset: '<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="3" y="13.5" width="4" height="6" rx="1.6"/><rect x="17" y="13.5" width="4" height="6" rx="1.6"/><path d="M19.5 19.5v.5a2.5 2.5 0 0 1-2.5 2.5h-2"/>',
    calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8.5 3.5V7M15.5 3.5V7"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10"/>',
    pen: '<path d="M14.5 5.5 18.5 9.5"/><path d="M4.5 19.5h4L19 9a2.83 2.83 0 0 0-4-4L4.5 15.5Z"/>',
    megaphone: '<path d="M4 10.5v3a2 2 0 0 0 2 2h1.5l9 4.5V4L7.5 8.5H6a2 2 0 0 0-2 2Z"/><path d="M19.5 9.5a3 3 0 0 1 0 5"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6h1.4a4.2 4.2 0 0 0 4.2-4.2c0-4-3.7-7.2-8-7.2Z"/><circle cx="7.8" cy="11.5" r="1.1"/><circle cx="11" cy="7.8" r="1.1"/><circle cx="15.3" cy="8.6" r="1.1"/>',
    code: '<path d="m9 8-4.5 4L9 16"/><path d="m15 8 4.5 4L15 16"/>',
    trending: '<path d="M4 16.5 9.5 11l3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>',
    clipboard: '<rect x="5.5" y="5" width="13" height="15" rx="2.2"/><rect x="9" y="3" width="6" height="3.6" rx="1.3"/><path d="M9.5 11.5h5M9.5 15h3.5"/>',
    book: '<path d="M4.5 5.2A1.7 1.7 0 0 1 6.2 3.5H19v14H6.2a1.7 1.7 0 0 0-1.7 1.7Z"/><path d="M4.5 19.2a1.7 1.7 0 0 1 1.7-1.7H19v3H6.2a1.7 1.7 0 0 1-1.7-1.3Z"/>',
    heart: '<path d="M12 19.5s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10.5c0 4.7-7 9-7 9Z"/>',
    sparkles: '<path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6Z"/><path d="M18 15.5 18.8 18l2.5.8-2.5.8L18 22l-.8-2.4-2.5-.8 2.5-.8Z"/>',
    rocket: '<path d="M13.5 4.5c3.5 0 6 2.5 6 6 0 3.6-4 7.4-6.4 9.3a1 1 0 0 1-1.2 0C9.5 17.9 5.5 14.1 5.5 10.5c0-3.5 2.5-6 6-6Z"/><circle cx="12.5" cy="10" r="2"/>',
    /* social */
    facebook: '<path d="M14 8.5h2.5V5.6h-2.3c-2.4 0-3.8 1.4-3.8 3.8v1.7H8.2V14h2.2v6.4h3V14h2.3l.4-2.9h-2.7V9.8c0-.8.3-1.3 1.2-1.3Z" fill="currentColor" stroke="none"/>',
    instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.3" r="1" fill="currentColor" stroke="none"/>',
    tiktok: '<path d="M14.2 4h2.6c.2 1.9 1.4 3.2 3.2 3.4v2.6a6.3 6.3 0 0 1-3.2-1v5.3a5.2 5.2 0 1 1-5.2-5.2c.3 0 .5 0 .8.05v2.7a2.5 2.5 0 1 0 1.8 2.4Z" fill="currentColor" stroke="none"/>',
    youtube: '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="m10.5 9.5 5 2.5-5 2.5Z" fill="currentColor" stroke="none"/>',
    linkedin: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8 10.5V16M8 7.6v.1M12 16v-3.1a1.9 1.9 0 0 1 3.8 0V16M12 10.5V16"/>',
    x: '<path d="m5 5 14 14M19 5 5 19"/>',
    whatsapp: '<path d="M4.5 19.5 5.7 16a7.2 7.2 0 1 1 2.8 2.7Z"/><path d="M9.3 9.4c.3-.6.6-.6.9-.6h.6c.2 0 .5 0 .7.5l.7 1.6c.1.3 0 .5-.1.7l-.4.5c-.1.2-.3.3-.1.6.2.4.9 1.5 2 2 .5.2.7.2.9 0l.6-.7c.2-.2.4-.2.6-.1l1.5.8c.3.1.4.3.4.5 0 .7-.6 1.5-1.4 1.6-1 .1-2.6-.3-4.1-1.7-1.5-1.4-2.3-3-2.4-4-.1-.9.3-1.4.6-1.7Z" fill="currentColor" stroke="none"/>'
  };

  function icon(name, cls) {
    const body = ICONS[name];
    if (!body) return '';
    return (
      '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      body +
      '</svg>'
    );
  }

  /* ----------------------------------------------------------------- toast */
  let toastTimer = null;
  function toast(message) {
    let host = qs('.toast');
    if (!host) {
      host = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    host.textContent = message;
    host.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => host.classList.remove('is-visible'), 2600);
  }

  /* ------------------------------------------------------------------- SEO */
  function setMetaTag(selector, attr, name, content) {
    let tag = qs(selector);
    if (!content) {
      if (tag) tag.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attr, name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  }

  /**
   * Update title / description / canonical / social tags at runtime.
   * Used by job.html and category.html, whose content depends on the URL.
   */
  function setMeta(opts) {
    const o = opts || {};
    if (o.title) {
      document.title = o.rawTitle ? o.title : SITE_CONFIG.seo.titleTemplate.replace('%s', o.title);
      setMetaTag('meta[property="og:title"]', 'property', 'og:title', document.title);
      setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', document.title);
    }
    if (o.description) {
      setMetaTag('meta[name="description"]', 'name', 'description', o.description);
      setMetaTag('meta[property="og:description"]', 'property', 'og:description', o.description);
      setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', o.description);
    }
    if (o.canonical) {
      let link = qs('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', o.canonical);
      setMetaTag('meta[property="og:url"]', 'property', 'og:url', o.canonical);
    }
    if (o.robots) setMetaTag('meta[name="robots"]', 'name', 'robots', o.robots);
  }

  /** Attach (or replace) the page's JSON-LD block. */
  function setJsonLd(id, data) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    if (!data) return;
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = id;
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  /* Rewrite the canonical/OG URLs built into the HTML so they follow
     SITE_CONFIG.url — the domain only has to be set in one place. */
  function syncCanonicalHost() {
    const base = (SITE_CONFIG.url || '').replace(/\/+$/, '');
    if (!base) return;
    const link = qs('link[rel="canonical"]');
    if (link) {
      try {
        const u = new URL(link.getAttribute('href'), window.location.href);
        link.setAttribute('href', base + u.pathname + u.search);
      } catch (err) {
        /* leave the authored value in place */
      }
    }
    ['og:url', 'og:image', 'twitter:image'].forEach((prop) => {
      const tag = qs('meta[property="' + prop + '"]') || qs('meta[name="' + prop + '"]');
      if (!tag) return;
      try {
        const u = new URL(tag.getAttribute('content'), window.location.href);
        tag.setAttribute('content', base + u.pathname + u.search);
      } catch (err) {
        /* leave the authored value in place */
      }
    });
  }

  /* ---------------------------------------------------------------- chrome */
  function applyBranding() {
    syncCanonicalHost();
    qsa('[data-site-name]').forEach((n) => (n.textContent = SITE_CONFIG.name));
    qsa('[data-site-short]').forEach((n) => (n.textContent = SITE_CONFIG.shortName));
    qsa('[data-year]').forEach((n) => (n.textContent = String(new Date().getFullYear())));
    qsa('[data-contact-email]').forEach((n) => {
      n.textContent = SITE_CONFIG.contactEmail;
      if (n.tagName === 'A') n.setAttribute('href', 'mailto:' + SITE_CONFIG.contactEmail);
    });
    qsa('[data-site-url]').forEach((n) => (n.textContent = SITE_CONFIG.url.replace(/^https?:\/\//, '')));

    const host = qs('[data-social-links]');
    if (host) {
      const links = Object.entries(SITE_CONFIG.social)
        .filter(([, url]) => !!url && safeUrl(url))
        .map(
          ([key, url]) =>
            '<a class="social-link" href="' +
            escAttr(safeUrl(url)) +
            '" target="_blank" rel="noopener noreferrer" aria-label="' +
            escAttr(SITE_CONFIG.name + ' on ' + key) +
            '">' +
            icon(key) +
            '</a>'
        )
        .join('');
      if (links) host.innerHTML = links;
      else host.closest('[data-social-wrap]')?.remove();
    }
  }

  function markActiveNav() {
    const page = document.body.dataset.page;
    qsa('[data-nav]').forEach((a) => {
      const match = a.dataset.nav.split(' ').includes(page);
      if (match) {
        a.classList.add('is-active');
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  function initMobileMenu() {
    const toggle = qs('.nav-toggle');
    const panel = qs('#mobile-nav');
    if (!toggle || !panel) return;

    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      document.body.classList.toggle('no-scroll', open);
    };

    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    panel.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.matches('[data-close-nav]')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  function initHeaderScroll() {
    const header = qs('.site-header');
    if (!header) return;
    let ticking = false;
    const update = () => {
      header.classList.toggle('is-stuck', window.scrollY > 8);
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    update();
  }

  function initDemoNotice() {
    if (!SITE_CONFIG.demoMode) return;
    setMeta({ robots: 'noindex, nofollow' });
    const bar = qs('[data-demo-bar]');
    if (!bar) return;
    bar.hidden = false;
  }

  /* Fade sections in once, and only when motion is allowed. */
  function initReveal() {
    const targets = qsa('[data-reveal]');
    if (!targets.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('is-revealed'));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-revealed');
            obs.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.05 }
    );
    targets.forEach((t) => io.observe(t));
  }

  function initNewsletter() {
    qsa('[data-newsletter]').forEach((form) => {
      const note = qs('[data-newsletter-note]', form);
      const cfg = SITE_CONFIG.newsletter;

      if (cfg.provider === 'custom' && safeUrl(cfg.endpoint)) {
        form.setAttribute('action', safeUrl(cfg.endpoint));
        form.setAttribute('method', 'post');
        form.setAttribute('target', '_blank');
        const input = qs('input[type="email"]', form);
        if (input) input.setAttribute('name', cfg.emailField || 'EMAIL');
        return; // real provider handles the submission
      }

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = qs('input[type="email"]', form);
        if (!input || !input.checkValidity()) {
          input?.reportValidity();
          return;
        }
        if (note) {
          note.hidden = false;
          note.textContent =
            'No email provider is connected yet, so nothing was sent or stored. Add one in assets/js/config.js → newsletter.';
        }
        form.reset();
      });
    });
  }

  /* -------------------------------------------------------------- dispatch */
  const pages = {};
  function page(name, fn) {
    pages[name] = fn;
  }

  function boot() {
    applyBranding();
    markActiveNav();
    initMobileMenu();
    initHeaderScroll();
    initDemoNotice();
    initNewsletter();
    initReveal();
    if (typeof Ads !== 'undefined') Ads.init();

    const name = document.body.dataset.page;
    const fn = pages[name];
    if (typeof fn === 'function') {
      try {
        fn();
      } catch (err) {
        /* Never leak a stack trace into the UI. */
        if (window.console && console.error) console.error(err);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    esc,
    escAttr,
    qs,
    qsa,
    el,
    params,
    param,
    slugify,
    truncate,
    initials,
    hueFor,
    formatDate,
    relativeDate,
    isNew,
    parseDate,
    store,
    KEYS,
    safeUrl,
    absUrl,
    basePath,
    rel,
    currentPath,
    icon,
    toast,
    setMeta,
    setJsonLd,
    initReveal,
    page
  };
})();
