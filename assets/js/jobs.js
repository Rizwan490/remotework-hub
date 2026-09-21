/* =============================================================================
   jobs.js — data layer + job rendering
   -----------------------------------------------------------------------------
   Loads assets/data/jobs.json once per page, normalises every record, and
   renders cards, detail pages, related jobs, saved jobs and recently viewed.
   All JSON values are treated as untrusted and escaped before rendering.
   ========================================================================== */

'use strict';

const Jobs = (() => {
  const DATA_PATH = 'assets/data/jobs.json';
  let cache = null;
  let loading = null;

  /* ------------------------------------------------------------ normalise */
  function asArray(value) {
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim());
    return [];
  }

  /* ------------------------------------------------------------ job URLs
     Slugs must match tools/build.js exactly — that script writes the static
     file this slug points at. Change one, change the other, then rebuild. */
  function slugFor(job) {
    if (job.slug) return RW.slugify(job.slug).slice(0, 120);
    const title = RW.slugify(job.title).slice(0, 70).replace(/-+$/, '');
    const company = RW.slugify(job.company).slice(0, 40).replace(/-+$/, '');
    const id = RW.slugify(job.id);
    return [title, company ? 'at-' + company : '', id].filter(Boolean).join('-');
  }

  /** Site-root-relative path of a job's own static page (the real file). */
  function pageUrlFor(job) {
    const cfg = SITE_CONFIG.jobPages || {};
    const dir = (cfg.dir || 'remote-jobs').replace(/^\/+|\/+$/g, '');
    return dir + '/' + job.slug + '.html';
  }

  /** Href to a job page, correct from whichever page is calling. */
  function url(job) {
    return RW.rel(job.pageUrl || pageUrlFor(job));
  }

  function normalize(raw, index) {
    const id = String(raw.id || '').trim() || 'job-' + index;
    const category = RW.slugify(raw.category || 'other');
    const job = {
      id: id,
      demo: raw.demo === true,
      title: String(raw.title || 'Untitled role').trim(),
      company: String(raw.company || 'Undisclosed company').trim(),
      companyLogo: RW.safeUrl(raw.companyLogo),
      location: String(raw.location || '').trim(),
      country: String(raw.country || '').trim(),
      remote: raw.remote !== false,
      jobType: String(raw.jobType || '').trim(),
      category: category,
      experience: String(raw.experience || '').trim(),
      salary: String(raw.salary || '').trim(),
      salaryMin: Number(raw.salaryMin) || 0,
      salaryMax: Number(raw.salaryMax) || 0,
      salaryCurrency: String(raw.salaryCurrency || '').trim(),
      salaryPeriod: String(raw.salaryPeriod || '').trim().toUpperCase(),
      postedDate: String(raw.postedDate || '').trim(),
      validThrough: String(raw.validThrough || '').trim(),
      description: String(raw.description || '').trim(),
      responsibilities: asArray(raw.responsibilities),
      requirements: asArray(raw.requirements),
      benefits: asArray(raw.benefits),
      skills: asArray(raw.skills),
      applyUrl: RW.safeUrl(raw.applyUrl),
      source: String(raw.source || '').trim(),
      featured: raw.featured === true,
      status: String(raw.status || 'active').trim().toLowerCase(),
      slug: String(raw.slug || '').trim()
    };
    job.slug = slugFor(job);
    job.pageUrl = pageUrlFor(job);
    return job;
  }

  /* ----------------------------------------------------------------- load */
  function load() {
    if (cache) return Promise.resolve(cache);
    if (loading) return loading;

    loading = fetch(RW.rel(DATA_PATH), { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : Array.isArray(data.jobs) ? data.jobs : [];
        cache = list
          .map(normalize)
          .filter((j) => j.status === 'active')
          .sort((a, b) => dateValue(b.postedDate) - dateValue(a.postedDate));
        return cache;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });

    return loading;
  }

  function dateValue(value) {
    const d = RW.parseDate(value);
    return d ? d.getTime() : 0;
  }

  function byId(list, id) {
    return list.find((j) => j.id === id) || null;
  }

  /* ----------------------------------------------------------- categories */
  function categoryMeta(slug) {
    return (
      CATEGORIES.find((c) => c.slug === slug) || {
        slug: slug,
        name: slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Other',
        icon: 'briefcase',
        blurb: '',
        intro: ''
      }
    );
  }

  function countsByCategory(list) {
    const counts = {};
    list.forEach((j) => {
      counts[j.category] = (counts[j.category] || 0) + 1;
    });
    return counts;
  }

  /* -------------------------------------------------------------- storage */
  const saved = {
    list() {
      const v = RW.store.get(RW.KEYS.saved, []);
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    },
    has(id) {
      return saved.list().indexOf(id) !== -1;
    },
    toggle(id) {
      const ids = saved.list();
      const i = ids.indexOf(id);
      if (i === -1) ids.unshift(id);
      else ids.splice(i, 1);
      RW.store.set(RW.KEYS.saved, ids.slice(0, 200));
      updateSavedCount();
      return i === -1;
    },
    clear() {
      RW.store.set(RW.KEYS.saved, []);
      updateSavedCount();
    }
  };

  const recent = {
    list() {
      const v = RW.store.get(RW.KEYS.recent, []);
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    },
    push(id) {
      if (!SITE_CONFIG.features.recentlyViewed) return;
      const ids = recent.list().filter((x) => x !== id);
      ids.unshift(id);
      RW.store.set(RW.KEYS.recent, ids.slice(0, SITE_CONFIG.listing.recentlyViewedMax));
    }
  };

  function updateSavedCount() {
    const n = saved.list().length;
    RW.qsa('[data-saved-count]').forEach((node) => {
      node.textContent = String(n);
      node.hidden = n === 0;
    });
  }

  /* --------------------------------------------------------------- pieces */
  function logoHTML(job, size) {
    const cls = 'company-logo' + (size ? ' company-logo--' + size : '');
    if (job.companyLogo) {
      return (
        '<img class="' + cls + '" src="' + RW.escAttr(job.companyLogo) + '" alt="' +
        RW.escAttr(job.company + ' logo') + '" loading="lazy" decoding="async" width="56" height="56">'
      );
    }
    return (
      '<span class="' + cls + '" style="--logo-hue:' + RW.hueFor(job.company) + '" aria-hidden="true">' +
      RW.esc(RW.initials(job.company)) +
      '</span>'
    );
  }

  function metaHTML(job) {
    const items = [];
    if (job.location) items.push(['pin', job.location]);
    if (job.jobType) items.push(['briefcase', job.jobType]);
    if (job.salary) items.push(['wallet', job.salary]);
    return (
      '<ul class="meta-list">' +
      items
        .map(([ic, text]) => '<li class="meta-list__item">' + RW.icon(ic) + '<span>' + RW.esc(text) + '</span></li>')
        .join('') +
      '</ul>'
    );
  }

  function saveButtonHTML(job, variant) {
    if (!SITE_CONFIG.features.savedJobs) return '';
    const isSaved = saved.has(job.id);
    const cls = 'save-btn' + (variant ? ' save-btn--' + variant : '') + (isSaved ? ' is-saved' : '');
    return (
      '<button type="button" class="' + cls + '" data-save-job="' + RW.escAttr(job.id) + '"' +
      ' aria-pressed="' + (isSaved ? 'true' : 'false') + '"' +
      ' aria-label="' + RW.escAttr((isSaved ? 'Remove saved job: ' : 'Save job: ') + job.title) + '">' +
      RW.icon('bookmark') +
      (variant === 'wide' ? '<span class="save-btn__text">' + (isSaved ? 'Saved' : 'Save Job') + '</span>' : '') +
      '</button>'
    );
  }

  /* ----------------------------------------------------------------- card */
  function cardHTML(job, opts) {
    const o = opts || {};
    const cat = categoryMeta(job.category);
    const href = Jobs.url(job);
    const badges = [];
    if (job.featured && !o.hideFeatured) badges.push('<span class="badge badge--featured">Featured</span>');
    if (job.remote) badges.push('<span class="badge badge--remote">Remote</span>');
    if (RW.isNew(job.postedDate, 5)) badges.push('<span class="badge badge--new">New</span>');
    if (job.demo) badges.push('<span class="badge badge--demo" title="Sample listing for demonstration">Demo</span>');

    return (
      '<article class="job-card' + (o.compact ? ' job-card--compact' : '') + '" data-job-id="' + RW.escAttr(job.id) + '">' +
        '<div class="job-card__top">' +
          logoHTML(job) +
          '<div class="job-card__headings">' +
            '<h3 class="job-card__title"><a href="' + RW.escAttr(href) + '">' + RW.esc(job.title) + '</a></h3>' +
            '<p class="job-card__company">' + RW.icon('building') + '<span>' + RW.esc(job.company) + '</span></p>' +
          '</div>' +
          saveButtonHTML(job) +
        '</div>' +
        (badges.length ? '<div class="badge-row">' + badges.join('') + '</div>' : '') +
        metaHTML(job) +
        (o.compact ? '' : '<p class="job-card__desc">' + RW.esc(RW.truncate(job.description, 165)) + '</p>') +
        '<div class="job-card__foot">' +
          '<div class="job-card__tags">' +
            '<a class="tag tag--link" href="' + RW.escAttr(RW.rel('category.html?category=' + encodeURIComponent(cat.slug))) + '">' + RW.esc(cat.name) + '</a>' +
            (job.experience ? '<span class="tag">' + RW.esc(job.experience) + '</span>' : '') +
            '<span class="tag tag--muted">' + RW.icon('clock') + RW.esc(RW.relativeDate(job.postedDate)) + '</span>' +
          '</div>' +
          '<a class="btn btn--sm btn--primary job-card__cta" href="' + RW.escAttr(href) + '" aria-label="' +
            RW.escAttr('View job: ' + job.title + ' at ' + job.company) + '">View Job' + RW.icon('arrowRight') + '</a>' +
        '</div>' +
      '</article>'
    );
  }

  /* --------------------------------------------------------------- states */
  function skeletonHTML(count) {
    let out = '';
    for (let i = 0; i < (count || 4); i++) {
      out +=
        '<div class="job-card job-card--skeleton" aria-hidden="true">' +
          '<div class="job-card__top"><span class="sk sk--logo"></span>' +
          '<div class="job-card__headings"><span class="sk sk--line sk--w70"></span><span class="sk sk--line sk--w40"></span></div></div>' +
          '<div class="sk-row"><span class="sk sk--pill"></span><span class="sk sk--pill"></span><span class="sk sk--pill"></span></div>' +
          '<span class="sk sk--line sk--w90"></span><span class="sk sk--line sk--w60"></span>' +
        '</div>';
    }
    return out;
  }

  function showSkeleton(container, count) {
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = skeletonHTML(count);
  }

  function showError(container, retryFn) {
    if (!container) return;
    container.removeAttribute('aria-busy');
    container.innerHTML =
      '<div class="state state--error" role="alert">' +
        '<span class="state__icon">' + RW.icon('inbox') + '</span>' +
        '<h3 class="state__title">Unable to load jobs right now</h3>' +
        '<p class="state__text">Please check your connection and try again.</p>' +
        '<button type="button" class="btn btn--primary" data-retry>Try again</button>' +
      '</div>';
    const btn = RW.qs('[data-retry]', container);
    if (btn && typeof retryFn === 'function') btn.addEventListener('click', retryFn);
  }

  function showEmpty(container, opts) {
    const o = opts || {};
    if (!container) return;
    container.removeAttribute('aria-busy');
    container.innerHTML =
      '<div class="state state--empty">' +
        '<span class="state__icon">' + RW.icon('search') + '</span>' +
        '<h3 class="state__title">' + RW.esc(o.title || 'No jobs found') + '</h3>' +
        '<p class="state__text">' + RW.esc(o.text || 'Try removing some filters or searching for another keyword.') + '</p>' +
        (o.showClear === false ? '' : '<button type="button" class="btn btn--primary" data-clear-filters>Clear Filters</button>') +
        (o.extraHTML || '') +
      '</div>';
  }

  /* --------------------------------------------------------------- render */
  /** Render a list of jobs into a container, injecting inline ad slots. */
  function renderList(container, list, opts) {
    const o = opts || {};
    if (!container) return;
    container.removeAttribute('aria-busy');

    if (!list.length) {
      showEmpty(container, o.empty);
      bindSaveButtons(container);
      return;
    }

    const every = (typeof ADS_CONFIG !== 'undefined' && ADS_CONFIG.inlineEvery) || 0;
    const adSlot = typeof Ads !== 'undefined' ? Ads.inlineSlotHTML() : '';
    let html = '';
    list.forEach((job, i) => {
      html += cardHTML(job, o);
      if (adSlot && every && (i + 1) % every === 0 && i + 1 < list.length) html += adSlot;
    });
    container.innerHTML = html;
    bindSaveButtons(container);
    if (typeof Ads !== 'undefined') Ads.observe(container);
  }

  /* ---------------------------------------------------------- save wiring */
  let saveDelegated = false;
  function bindSaveButtons(scope) {
    updateSavedCount();
    if (saveDelegated) return;
    saveDelegated = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-save-job]');
      if (!btn) return;
      e.preventDefault();
      const id = btn.dataset.saveJob;
      const nowSaved = saved.toggle(id);
      RW.qsa('[data-save-job="' + CSS.escape(id) + '"]').forEach((b) => {
        b.classList.toggle('is-saved', nowSaved);
        b.setAttribute('aria-pressed', String(nowSaved));
        const label = b.getAttribute('aria-label') || '';
        const title = label.replace(/^(Remove saved job:|Save job:)\s*/, '');
        b.setAttribute('aria-label', (nowSaved ? 'Remove saved job: ' : 'Save job: ') + title);
        const text = RW.qs('.save-btn__text', b);
        if (text) text.textContent = nowSaved ? 'Saved' : 'Save Job';
      });
      RW.toast(nowSaved ? 'Job saved to your list' : 'Job removed from saved');
      document.dispatchEvent(new CustomEvent('rw:saved-changed', { detail: { id: id, saved: nowSaved } }));
    });
  }

  /* -------------------------------------------------------------- related */
  function related(list, job, limit) {
    const max = limit || SITE_CONFIG.listing.relatedJobs;
    const skills = new Set(job.skills.map((s) => s.toLowerCase()));
    return list
      .filter((j) => j.id !== job.id)
      .map((j) => {
        let score = 0;
        if (j.category === job.category) score += 50;
        if (j.jobType === job.jobType) score += 12;
        if (j.experience === job.experience) score += 6;
        if (j.country === job.country) score += 4;
        j.skills.forEach((s) => {
          if (skills.has(s.toLowerCase())) score += 8;
        });
        return { job: j, score: score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || dateValue(b.job.postedDate) - dateValue(a.job.postedDate))
      .slice(0, max)
      .map((x) => x.job);
  }

  /* ------------------------------------------------- structured data (SEO)
     Only emitted for real (non-demo) listings, and every optional property is
     omitted when the underlying data is missing — never invented.          */
  function jobPostingSchema(job) {
    if (!SITE_CONFIG.features.structuredData) return null;
    if (SITE_CONFIG.demoMode || job.demo) return null;
    if (!job.title || !job.company || !job.postedDate) return null;

    const data = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      description: buildSchemaDescription(job),
      datePosted: job.postedDate,
      url: RW.absUrl(job.pageUrl),
      hiringOrganization: { '@type': 'Organization', name: job.company },
      identifier: { '@type': 'PropertyValue', name: job.company, value: job.id }
    };

    if (job.validThrough) data.validThrough = job.validThrough;
    if (job.jobType) {
      const map = {
        'full-time': 'FULL_TIME',
        'part-time': 'PART_TIME',
        contract: 'CONTRACTOR',
        freelance: 'CONTRACTOR',
        internship: 'INTERN',
        temporary: 'TEMPORARY'
      };
      const key = job.jobType.toLowerCase();
      if (map[key]) data.employmentType = map[key];
    }
    if (job.companyLogo) data.hiringOrganization.logo = job.companyLogo;

    if (job.remote) {
      data.jobLocationType = 'TELECOMMUTE';
      if (job.country && job.country !== 'Worldwide') {
        data.applicantLocationRequirements = { '@type': 'Country', name: job.country };
      }
    } else if (job.country) {
      data.jobLocation = {
        '@type': 'Place',
        address: { '@type': 'PostalAddress', addressCountry: job.country }
      };
    }

    /* baseSalary only when genuine numeric salary data exists. */
    if (job.salaryMin > 0 && job.salaryCurrency && job.salaryPeriod) {
      const value = { '@type': 'QuantitativeValue', unitText: job.salaryPeriod };
      if (job.salaryMax > job.salaryMin) {
        value.minValue = job.salaryMin;
        value.maxValue = job.salaryMax;
      } else {
        value.value = job.salaryMin;
      }
      data.baseSalary = { '@type': 'MonetaryAmount', currency: job.salaryCurrency, value: value };
    }

    if (job.skills.length) data.skills = job.skills.join(', ');
    if (job.requirements.length) data.qualifications = job.requirements.join(' ');
    if (job.responsibilities.length) data.responsibilities = job.responsibilities.join(' ');
    if (job.benefits.length) data.jobBenefits = job.benefits.join(' ');
    if (job.experience) data.experienceRequirements = job.experience;
    if (job.category) data.occupationalCategory = categoryMeta(job.category).name;
    if (job.applyUrl) data.directApply = false; // application happens on the employer's site
    return data;
  }

  /* Google reads the description as HTML, so the lists are kept as lists.
     Must stay identical to schemaDescription() in tools/build.js. */
  function buildSchemaDescription(job) {
    const block = (heading, items) =>
      items.length
        ? '<h3>' + RW.esc(heading) + '</h3><ul>' + items.map((i) => '<li>' + RW.esc(i) + '</li>').join('') + '</ul>'
        : '';
    return (
      '<p>' + RW.esc(job.description) + '</p>' +
      block('Responsibilities', job.responsibilities) +
      block('Requirements', job.requirements) +
      block('Benefits', job.benefits)
    );
  }

  return {
    load,
    byId,
    normalize,
    url,
    slugFor,
    pageUrlFor,
    categoryMeta,
    countsByCategory,
    cardHTML,
    renderList,
    showSkeleton,
    showError,
    showEmpty,
    bindSaveButtons,
    logoHTML,
    metaHTML,
    saveButtonHTML,
    related,
    jobPostingSchema,
    buildSchemaDescription,
    updateSavedCount,
    saved,
    recent,
    dateValue
  };
})();
