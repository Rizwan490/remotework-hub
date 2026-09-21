/* =============================================================================
   ui.js — page controllers and interactive components
   -----------------------------------------------------------------------------
   Home, jobs, job detail, categories, category, saved jobs, contact and 404.
   Also: the mobile filter drawer, share sheet, FAQ accordion.
   ========================================================================== */

'use strict';

/* ---------------------------------------------------------------- drawer */
(function initFilterDrawer() {
  document.addEventListener('DOMContentLoaded', () => {
    const panel = RW.qs('[data-filter-panel]');
    const openBtn = RW.qs('[data-open-filters]');
    if (!panel || !openBtn) return;

    let backdrop = RW.qs('.drawer-backdrop');
    if (!backdrop) {
      backdrop = RW.el('div', { class: 'drawer-backdrop', hidden: true });
      document.body.appendChild(backdrop);
    }

    const setOpen = (open) => {
      panel.classList.toggle('is-open', open);
      backdrop.hidden = !open;
      document.body.classList.toggle('no-scroll', open);
      openBtn.setAttribute('aria-expanded', String(open));
      if (open) panel.querySelector('input, select, button')?.focus({ preventScroll: true });
      else openBtn.focus({ preventScroll: true });
    };

    openBtn.addEventListener('click', () => setOpen(true));
    backdrop.addEventListener('click', () => setOpen(false));
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-filters]')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
    });
  });
})();

/* ----------------------------------------------------------------- share */
const Share = (() => {
  function targets(url, title) {
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(title);
    return [
      { key: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + u },
      { key: 'x', label: 'X', href: 'https://twitter.com/intent/tweet?url=' + u + '&text=' + t },
      { key: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/sharing/share-offsite/?url=' + u },
      { key: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/?text=' + t + '%20' + u }
    ];
  }

  function render(container, url, title) {
    if (!container) return;
    const canNative = typeof navigator.share === 'function';
    container.innerHTML =
      (canNative
        ? '<button type="button" class="share-btn share-btn--native" data-native-share>' +
          RW.icon('share') + '<span>Share</span></button>'
        : '') +
      targets(url, title)
        .map(
          (t) =>
            '<a class="share-btn share-btn--' + t.key + '" href="' + RW.escAttr(t.href) +
            '" target="_blank" rel="noopener noreferrer" aria-label="Share on ' + RW.escAttr(t.label) + '">' +
            RW.icon(t.key) + '<span>' + RW.esc(t.label) + '</span></a>'
        )
        .join('') +
      '<button type="button" class="share-btn share-btn--copy" data-copy-link aria-label="Copy link to this job">' +
      RW.icon('link') + '<span>Copy link</span></button>';

    const native = RW.qs('[data-native-share]', container);
    if (native) {
      native.addEventListener('click', () => {
        navigator.share({ title: title, url: url }).catch(() => {});
      });
    }

    const copy = RW.qs('[data-copy-link]', container);
    if (copy) {
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          RW.toast('Link copied to clipboard');
        } catch (err) {
          const input = RW.el('input', { value: url });
          document.body.appendChild(input);
          input.select();
          try {
            document.execCommand('copy');
            RW.toast('Link copied to clipboard');
          } catch (e2) {
            RW.toast('Copy the link from your address bar');
          }
          input.remove();
        }
      });
    }
  }

  return { render };
})();

/* -------------------------------------------------------------- accordion */
function initAccordion(root) {
  RW.qsa('[data-accordion] .accordion__trigger', root || document).forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.accordion__item');
      const open = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

function faqHTML(items) {
  return (
    '<div class="accordion" data-accordion>' +
    items
      .map(
        (it, i) =>
          '<div class="accordion__item">' +
            '<h3 class="accordion__heading">' +
              '<button type="button" class="accordion__trigger" aria-expanded="false" id="faq-t-' + i + '" aria-controls="faq-p-' + i + '">' +
                '<span>' + RW.esc(it.q) + '</span>' +
                '<span class="accordion__chevron" aria-hidden="true"></span>' +
              '</button>' +
            '</h3>' +
            '<div class="accordion__panel" id="faq-p-' + i + '" role="region" aria-labelledby="faq-t-' + i + '">' +
              '<p>' + RW.esc(it.a) + '</p>' +
            '</div>' +
          '</div>'
      )
      .join('') +
    '</div>'
  );
}

/* --------------------------------------------------------- recently viewed */
function renderRecentlyViewed(all, excludeId) {
  const section = RW.qs('[data-recent-section]');
  const host = RW.qs('[data-recent-list]');
  if (!section || !host || !SITE_CONFIG.features.recentlyViewed) return;
  const ids = Jobs.recent.list().filter((id) => id !== excludeId);
  const list = ids.map((id) => Jobs.byId(all, id)).filter(Boolean).slice(0, SITE_CONFIG.listing.recentlyViewedMax);
  if (!list.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  Jobs.renderList(host, list, { compact: true });
}

/* =============================================================================
   HOME
   ========================================================================== */
RW.page('home', () => {
  Search.initForms();

  const featuredHost = RW.qs('[data-featured-jobs]');
  const latestHost = RW.qs('[data-latest-jobs]');
  const catHost = RW.qs('[data-category-grid]');

  Jobs.showSkeleton(featuredHost, 3);
  Jobs.showSkeleton(latestHost, 3);

  Jobs.load()
    .then((all) => {
      /* ---- stats (derived from the data, never invented) ---- */
      const counts = Jobs.countsByCategory(all);
      const stats = {
        total: all.length,
        categories: Object.keys(counts).length,
        fresh: all.filter((j) => RW.isNew(j.postedDate, 7)).length,
        remote: all.filter((j) => j.remote).length
      };
      RW.qsa('[data-stat]').forEach((node) => {
        const value = stats[node.dataset.stat];
        node.textContent = typeof value === 'number' ? value.toLocaleString('en-US') : '—';
      });

      /* ---- featured ---- */
      const featured = all.filter((j) => j.featured).slice(0, SITE_CONFIG.listing.featuredOnHome);
      const featuredList = featured.length ? featured : all.slice(0, SITE_CONFIG.listing.featuredOnHome);
      Jobs.renderList(featuredHost, featuredList, { hideFeatured: false });

      /* ---- latest ---- */
      Jobs.renderList(latestHost, all.slice(0, SITE_CONFIG.listing.latestOnHome));

      /* ---- categories ---- */
      if (catHost) {
        /* Keep the home grid to a tidy number of rows; categories.html has all. */
        catHost.innerHTML = CATEGORIES.slice(0, 12).map((c) => {
          const n = counts[c.slug] || 0;
          return (
            '<a class="cat-card" href="' + RW.escAttr(RW.rel('category.html?category=' + encodeURIComponent(c.slug))) + '">' +
              '<span class="cat-card__icon">' + RW.icon(c.icon) + '</span>' +
              '<span class="cat-card__body">' +
                '<span class="cat-card__name">' + RW.esc(c.name) + '</span>' +
                '<span class="cat-card__blurb">' + RW.esc(c.blurb) + '</span>' +
              '</span>' +
              '<span class="cat-card__count">' + n + ' ' + (n === 1 ? 'job' : 'jobs') + '</span>' +
            '</a>'
          );
        }).join('');
      }

      renderRecentlyViewed(all);
      RW.initReveal();
    })
    .catch(() => {
      Jobs.showError(featuredHost, () => window.location.reload());
      if (latestHost) latestHost.innerHTML = '';
    });
});

/* =============================================================================
   JOBS
   ========================================================================== */
RW.page('jobs', () => {
  Search.initForms();
  Listing.init({ resultsSelector: '[data-results]' });
});

/* =============================================================================
   CATEGORIES INDEX
   ========================================================================== */
RW.page('categories', () => {
  const host = RW.qs('[data-category-grid]');
  if (!host) return;
  host.innerHTML = '<div class="sk sk--block"></div>'.repeat(6);

  Jobs.load()
    .then((all) => {
      const counts = Jobs.countsByCategory(all);
      host.innerHTML = CATEGORIES.map((c) => {
        const n = counts[c.slug] || 0;
        return (
          '<a class="cat-card cat-card--lg" href="category.html?category=' + encodeURIComponent(c.slug) + '">' +
            '<span class="cat-card__icon">' + RW.icon(c.icon) + '</span>' +
            '<span class="cat-card__body">' +
              '<span class="cat-card__name">' + RW.esc(c.name) + '</span>' +
              '<span class="cat-card__blurb">' + RW.esc(c.blurb) + '</span>' +
            '</span>' +
            '<span class="cat-card__count">' + n + ' ' + (n === 1 ? 'job' : 'jobs') + '</span>' +
          '</a>'
        );
      }).join('');
    })
    .catch(() => {
      host.innerHTML =
        '<p class="state__text">Unable to load job counts right now. Please try again.</p>';
    });
});

/* =============================================================================
   SINGLE CATEGORY
   ========================================================================== */
RW.page('category', () => {
  const slug = RW.slugify(RW.param('category'));
  const meta = Jobs.categoryMeta(slug);
  const known = CATEGORIES.some((c) => c.slug === slug);

  RW.qsa('[data-cat-name]').forEach((n) => (n.textContent = meta.name));
  const introEl = RW.qs('[data-cat-intro]');
  if (introEl) introEl.textContent = meta.intro || '';
  const iconEl = RW.qs('[data-cat-icon]');
  if (iconEl) iconEl.innerHTML = RW.icon(meta.icon);

  RW.setMeta({
    title: 'Remote ' + meta.name + ' Jobs',
    description:
      (meta.intro || 'Browse remote ' + meta.name + ' jobs.').slice(0, 155),
    canonical: RW.canonicalUrl('category.html?category=' + encodeURIComponent(slug))
  });

  if (!known) {
    const wrap = RW.qs('[data-category-missing]');
    if (wrap) wrap.hidden = false;
  }

  /* Category FAQ — generic, factual guidance, no invented claims. */
  const faqHost = RW.qs('[data-cat-faq]');
  if (faqHost) {
    faqHost.innerHTML = faqHTML([
      {
        q: 'What do remote ' + meta.name.toLowerCase() + ' jobs involve?',
        a: meta.intro || 'These roles are performed remotely, with duties that vary by employer.'
      },
      {
        q: 'Do I need experience to apply?',
        a: 'It depends on the listing. Use the Experience filter to show only entry-level or no-experience roles, and read each listing’s requirements before applying.'
      },
      {
        q: 'Are these jobs open worldwide?',
        a: 'Many remote employers hire only in specific countries for tax and payroll reasons. Each listing shows its location requirement — filter by country or “Remote” to narrow the list.'
      },
      {
        q: 'How do I apply?',
        a: 'Open a listing and use the apply button, which takes you to the employer’s own application page. ' + SITE_CONFIG.name + ' does not collect applications and is not the employer.'
      },
      {
        q: 'How can I avoid job scams?',
        a: 'Never pay to be hired, never share bank or ID details before a signed offer, and verify the employer independently. If a listing asks for money up front, treat it as a red flag.'
      }
    ]);
    initAccordion(faqHost);
  }

  Listing.init({
    resultsSelector: '[data-results]',
    lockedCategory: slug,
    onData: (all) => {
      const n = all.filter((j) => j.category === slug).length;
      RW.qsa('[data-cat-count]').forEach((node) => {
        node.textContent = n + ' open ' + (n === 1 ? 'role' : 'roles');
      });
    }
  });
});

/* =============================================================================
   JOB DETAIL
   ========================================================================== */
RW.page('job', () => {
  /* Static pages generated by tools/build.js carry the id on <body>; the
     legacy job.html?id=... URL still works and redirects to them. */
  const id = document.body.dataset.jobId || RW.param('id');
  const prerendered = document.body.dataset.jobId ? true : false;
  /* Set when job.html has to render a listing itself because its static page
     has not been generated yet — the canonical then has to stay on this URL. */
  let staticMissing = false;
  const main = RW.qs('[data-job-detail]');
  const sidebar = RW.qs('[data-job-sidebar]');
  const missing = RW.qs('[data-job-missing]');
  const article = RW.qs('[data-job-article]');

  if (!main) return;

  /* A pre-rendered page already shows the job — skeletons would only flash. */
  if (!prerendered) {
    main.setAttribute('aria-busy', 'true');
    main.innerHTML =
      '<div class="detail-skeleton" aria-hidden="true">' +
        '<span class="sk sk--line sk--w60 sk--tall"></span>' +
        '<span class="sk sk--line sk--w40"></span>' +
        '<div class="sk-row"><span class="sk sk--pill"></span><span class="sk sk--pill"></span><span class="sk sk--pill"></span></div>' +
        '<span class="sk sk--line sk--w90"></span><span class="sk sk--line sk--w90"></span><span class="sk sk--line sk--w70"></span>' +
      '</div>';
  }

  Jobs.load()
    .then((all) => {
      const job = Jobs.byId(all, id);
      main.removeAttribute('aria-busy');

      if (!job) {
        /* Remove the detail shell entirely so the page keeps exactly one <h1>. */
        if (article) article.remove();
        if (missing) missing.hidden = false;
        RW.setMeta({ title: 'Job not found', robots: 'noindex, follow' });
        return;
      }

      if (missing) missing.remove();
      if (!prerendered) {
        /* Send old ?id= links to the job's own indexable page when it exists,
           so the two URLs never compete for the same listing. */
        sendToStaticPage(job, all);
        return;
      }
      Jobs.recent.push(job.id);
      renderJob(job, all);
    })
    .catch(() => {
      Jobs.showError(main, () => window.location.reload());
      if (sidebar) sidebar.innerHTML = '';
    });

  /* Only redirect once the static file is confirmed to exist: a listing added
     to jobs.json before the next `node tools/build.js` run still renders here. */
  function sendToStaticPage(job, all) {
    const href = Jobs.url(job);
    const fallback = () => {
      staticMissing = true;
      Jobs.recent.push(job.id);
      renderJob(job, all);
    };
    if (window.location.protocol === 'file:') return fallback();
    fetch(href, { method: 'HEAD' })
      .then((res) => {
        if (res.ok) window.location.replace(href);
        else fallback();
      })
      .catch(fallback);
  }

  function listBlock(title, items) {
    if (!items.length) return '';
    return (
      '<section class="detail-block">' +
        '<h2 class="detail-block__title">' + RW.esc(title) + '</h2>' +
        '<ul class="tick-list">' +
          items.map((i) => '<li>' + RW.icon('check') + '<span>' + RW.esc(i) + '</span></li>').join('') +
        '</ul>' +
      '</section>'
    );
  }

  function renderJob(job, all) {
    const cat = Jobs.categoryMeta(job.category);
    const canonical = staticMissing
      ? RW.canonicalUrl('job.html?id=' + encodeURIComponent(job.id))
      : RW.canonicalUrl(job.pageUrl);

    /* ---- head / SEO ---- */
    const metaDesc = RW.truncate(
      job.title + ' at ' + job.company + '. ' + (job.location ? job.location + '. ' : '') + job.description,
      155
    );
    RW.setMeta({
      title: job.title + ' at ' + job.company,
      description: metaDesc,
      canonical: canonical,
      /* job.html is noindex by default because it duplicates the generated
         page; when that page is missing this is the only copy, so index it. */
      robots: staticMissing ? 'index, follow' : ''
    });
    RW.setJsonLd('job-schema', Jobs.jobPostingSchema(job));

    /* ---- breadcrumb ---- */
    const crumb = RW.qs('[data-breadcrumb]');
    if (crumb) {
      crumb.innerHTML =
        '<a href="' + RW.escAttr(RW.rel('index.html')) + '">Home</a>' + RW.icon('arrowRight') +
        '<a href="' + RW.escAttr(RW.rel('jobs.html')) + '">Jobs</a>' + RW.icon('arrowRight') +
        '<a href="' + RW.escAttr(RW.rel('category.html?category=' + encodeURIComponent(cat.slug))) + '">' + RW.esc(cat.name) + '</a>' +
        RW.icon('arrowRight') + '<span aria-current="page">' + RW.esc(RW.truncate(job.title, 44)) + '</span>';
    }

    /* ---- main column ---- */
    const badges = [];
    if (job.remote) badges.push('<span class="badge badge--remote">Remote</span>');
    if (job.jobType) badges.push('<span class="badge">' + RW.esc(job.jobType) + '</span>');
    if (job.experience) badges.push('<span class="badge">' + RW.esc(job.experience) + '</span>');
    if (job.demo) badges.push('<span class="badge badge--demo">Demo listing</span>');

    main.innerHTML =
      '<header class="detail-head">' +
        '<div class="detail-head__top">' +
          Jobs.logoHTML(job, 'lg') +
          '<div>' +
            '<h1 class="detail-head__title">' + RW.esc(job.title) + '</h1>' +
            '<p class="detail-head__company">' +
              '<span class="detail-head__org">' + RW.esc(job.company) + '</span>' +
              (job.location
                ? '<span class="meta-inline">' + RW.icon('pin') + RW.esc(job.location) + '</span>'
                : '') +
              '<span class="meta-inline">' + RW.icon('clock') + 'Posted ' + RW.esc(RW.relativeDate(job.postedDate)) + '</span>' +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="badge-row">' + badges.join('') + '</div>' +
      '</header>' +

      '<div class="ad-slot ad-slot--detail-top" data-ad="header"></div>' +

      '<section class="detail-block">' +
        '<h2 class="detail-block__title">About this role</h2>' +
        '<p class="detail-block__text">' + RW.esc(job.description) + '</p>' +
      '</section>' +
      listBlock('Responsibilities', job.responsibilities) +
      listBlock('Requirements', job.requirements) +
      listBlock('Benefits', job.benefits) +
      (job.skills.length
        ? '<section class="detail-block">' +
            '<h2 class="detail-block__title">Skills</h2>' +
            '<div class="job-card__tags">' +
              job.skills.map((s) => '<span class="tag">' + RW.esc(s) + '</span>').join('') +
            '</div>' +
          '</section>'
        : '') +

      '<section class="detail-block detail-block--apply">' +
        applyBlockHTML(job) +
      '</section>' +

      '<div class="ad-slot ad-slot--detail-bottom" data-ad="footer"></div>';

    /* ---- sidebar ---- */
    if (sidebar) {
      const summary = [
        ['briefcase', 'Job type', job.jobType],
        ['pin', 'Location', job.location],
        ['globe', 'Work setting', job.remote ? 'Remote' : 'On-site / hybrid'],
        ['wallet', 'Salary', job.salary],
        ['trending', 'Experience', job.experience],
        ['clock', 'Posted', RW.formatDate(job.postedDate)]
      ].filter(([, , value]) => !!value);

      sidebar.innerHTML =
        '<div class="side-card side-card--apply">' +
          applyBlockHTML(job, true) +
          Jobs.saveButtonHTML(job, 'wide') +
        '</div>' +

        '<div class="side-card">' +
          '<h2 class="side-card__title">Job summary</h2>' +
          '<dl class="summary-list">' +
            summary
              .map(
                ([ic, label, value]) =>
                  '<div class="summary-list__row">' +
                    '<dt>' + RW.icon(ic) + RW.esc(label) + '</dt>' +
                    '<dd>' + RW.esc(value) + '</dd>' +
                  '</div>'
              )
              .join('') +
            '<div class="summary-list__row">' +
              '<dt>' + RW.icon('briefcase') + 'Category</dt>' +
              '<dd><a href="' + RW.escAttr(RW.rel('category.html?category=' + encodeURIComponent(cat.slug))) + '">' + RW.esc(cat.name) + '</a></dd>' +
            '</div>' +
          '</dl>' +
        '</div>' +

        '<div class="side-card">' +
          '<h2 class="side-card__title">Share this job</h2>' +
          '<div class="share-row" data-share></div>' +
        '</div>' +

        '<div class="ad-slot ad-slot--sidebar" data-ad="sidebar"></div>';

      Share.render(RW.qs('[data-share]', sidebar), canonical, job.title + ' at ' + job.company);
    }

    Jobs.bindSaveButtons(document);

    /* ---- related ---- */
    const relatedHost = RW.qs('[data-related-jobs]');
    const relatedSection = RW.qs('[data-related-section]');
    if (relatedHost) {
      const rel = Jobs.related(all, job);
      if (rel.length) {
        Jobs.renderList(relatedHost, rel, { compact: true });
        if (relatedSection) relatedSection.hidden = false;
      } else if (relatedSection) {
        relatedSection.hidden = true;
      }
    }

    renderRecentlyViewed(all, job.id);
    if (typeof Ads !== 'undefined') Ads.observe(document);

    /* Mobile sticky apply bar */
    const bar = RW.qs('[data-apply-bar]');
    if (bar) {
      bar.innerHTML =
        '<div class="apply-bar__info">' +
          '<strong>' + RW.esc(RW.truncate(job.title, 38)) + '</strong>' +
          '<span>' + RW.esc(job.company) + '</span>' +
        '</div>' +
        applyButtonHTML(job, 'btn--sm');
      bar.hidden = false;
    }
  }

  function applyButtonHTML(job, extraClass) {
    const cls = 'btn btn--primary ' + (extraClass || 'btn--lg') + ' btn--apply';
    if (job.applyUrl) {
      return (
        '<a class="' + cls + '" href="' + RW.escAttr(job.applyUrl) + '" target="_blank" rel="noopener noreferrer nofollow">' +
        'Apply on Employer Website' + RW.icon('external') + '</a>'
      );
    }
    return (
      '<button type="button" class="' + cls + '" disabled aria-disabled="true">Application link unavailable</button>'
    );
  }

  function applyBlockHTML(job, compact) {
    const note = job.applyUrl
      ? 'This button opens the employer’s own application page in a new tab. ' +
        SITE_CONFIG.name + ' is not the employer and does not collect applications.'
      : 'This is a sample listing used to demonstrate the site. There is no application link and no vacancy behind it.';
    return (
      (compact ? '<h2 class="side-card__title">Apply for this job</h2>' : '<h2 class="detail-block__title">How to apply</h2>') +
      applyButtonHTML(job) +
      '<p class="apply-note">' + RW.esc(note) + '</p>'
    );
  }
});

/* =============================================================================
   SAVED JOBS
   ========================================================================== */
RW.page('saved', () => {
  const host = RW.qs('[data-saved-list]');
  const countEl = RW.qs('[data-saved-total]');
  if (!host) return;
  Jobs.showSkeleton(host, 3);

  function draw(all) {
    const ids = Jobs.saved.list();
    const list = ids.map((id) => Jobs.byId(all, id)).filter(Boolean);
    if (countEl) countEl.textContent = list.length === 1 ? '1 saved job' : list.length + ' saved jobs';
    if (!list.length) {
      Jobs.showEmpty(host, {
        title: 'No saved jobs yet',
        text: 'Tap the bookmark icon on any listing to keep it here. Saved jobs stay in this browser only.',
        showClear: false,
        extraHTML: '<a class="btn btn--primary" href="' + RW.escAttr(RW.rel('jobs.html')) + '">Browse remote jobs</a>'
      });
      return;
    }
    Jobs.renderList(host, list);
  }

  Jobs.load()
    .then((all) => {
      draw(all);
      document.addEventListener('rw:saved-changed', () => draw(all));
      const clear = RW.qs('[data-clear-saved]');
      if (clear) {
        clear.addEventListener('click', () => {
          Jobs.saved.clear();
          draw(all);
          RW.toast('Saved jobs cleared');
        });
      }
    })
    .catch(() => Jobs.showError(host, () => window.location.reload()));
});

/* =============================================================================
   CONTACT — no backend, so the form composes an email in the user's client
   ========================================================================== */
RW.page('contact', () => {
  const form = RW.qs('[data-contact-form]');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const name = RW.qs('#c-name', form).value.trim();
    const email = RW.qs('#c-email', form).value.trim();
    const subject = RW.qs('#c-subject', form).value.trim();
    const message = RW.qs('#c-message', form).value.trim();

    const body =
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n\n' +
      message + '\n';

    window.location.href =
      'mailto:' + encodeURIComponent(SITE_CONFIG.contactEmail) +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);

    const note = RW.qs('[data-contact-note]', form);
    if (note) {
      note.hidden = false;
      note.textContent =
        'Your email app should now be open with this message ready to send. If nothing happened, email ' +
        SITE_CONFIG.contactEmail + ' directly.';
    }
  });

  initAccordion();
});

/* =============================================================================
   STATIC PAGES
   ========================================================================== */
RW.page('static', () => {
  initAccordion();
});
