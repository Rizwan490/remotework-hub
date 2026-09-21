/* =============================================================================
   filters.js — the listing engine used by jobs.html and category.html
   -----------------------------------------------------------------------------
   Builds the filter panel, keeps state in sync with the URL query string,
   filters/sorts entirely in the browser and re-renders without a page reload.
   ========================================================================== */

'use strict';

const Listing = (() => {
  const state = {
    q: '',
    location: '',
    category: '',
    types: [],
    experience: [],
    salary: 'any',
    remoteOnly: false,
    sort: 'newest'
  };

  let all = [];
  let current = [];
  let shown = 0;
  let lockedCategory = '';
  let els = {};

  /* ------------------------------------------------------------------ url */
  function readUrl() {
    const p = RW.params();
    state.q = (p.get('q') || '').trim();
    state.location = (p.get('location') || '').trim();
    state.category = lockedCategory || RW.slugify(p.get('category') || '');
    state.types = splitParam(p.get('type'));
    state.experience = splitParam(p.get('exp'));
    state.salary = p.get('salary') || 'any';
    state.remoteOnly = p.get('remote') === '1';
    state.sort = p.get('sort') || (state.q ? 'relevance' : 'newest');
  }

  function splitParam(value) {
    return String(value || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function writeUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.location) p.set('location', state.location);
    if (state.category && !lockedCategory) p.set('category', state.category);
    if (lockedCategory) p.set('category', lockedCategory);
    if (state.types.length) p.set('type', state.types.join(','));
    if (state.experience.length) p.set('exp', state.experience.join(','));
    if (state.salary && state.salary !== 'any') p.set('salary', state.salary);
    if (state.remoteOnly) p.set('remote', '1');
    if (state.sort && state.sort !== 'newest') p.set('sort', state.sort);
    const qs = p.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    window.history.replaceState(null, '', url);
  }

  /* --------------------------------------------------------------- filter */
  function salaryFloor() {
    const band = FILTER_OPTIONS.salaryBands.find((b) => b.id === state.salary);
    return band ? band.min : 0;
  }

  function compute() {
    const floor = salaryFloor();
    let list = all.filter((job) => {
      if (state.category && job.category !== state.category) return false;
      if (state.remoteOnly && !job.remote) return false;
      if (state.types.length && state.types.indexOf(job.jobType) === -1) return false;
      if (state.experience.length && state.experience.indexOf(job.experience) === -1) return false;
      if (floor > 0 && !(job.salaryMin >= floor || job.salaryMax >= floor)) return false;
      if (!Search.matchesLocation(job, state.location)) return false;
      if (!Search.matches(job, state.q)) return false;
      return true;
    });

    const sorters = {
      newest: (a, b) => Jobs.dateValue(b.postedDate) - Jobs.dateValue(a.postedDate),
      oldest: (a, b) => Jobs.dateValue(a.postedDate) - Jobs.dateValue(b.postedDate),
      salary: (a, b) => (b.salaryMax || b.salaryMin) - (a.salaryMax || a.salaryMin),
      az: (a, b) => a.title.localeCompare(b.title),
      relevance: (a, b) =>
        Search.score(b, state.q) - Search.score(a, state.q) ||
        Jobs.dateValue(b.postedDate) - Jobs.dateValue(a.postedDate)
    };
    const sorter = sorters[state.sort] || sorters.newest;
    /* Featured listings float to the top of the default ordering only. */
    if (state.sort === 'newest') {
      list.sort((a, b) => Number(b.featured) - Number(a.featured) || sorter(a, b));
    } else {
      list.sort(sorter);
    }
    return list;
  }

  /* --------------------------------------------------------------- render */
  function render(resetPage) {
    current = compute();
    if (resetPage !== false) shown = SITE_CONFIG.listing.pageSize;

    const slice = current.slice(0, shown);
    Jobs.renderList(els.results, slice, {
      empty: {
        title: 'No jobs found',
        text: 'Try removing some filters or searching for another keyword.'
      }
    });

    if (els.count) {
      const n = current.length;
      els.count.textContent = n === 0 ? 'No jobs' : n === 1 ? '1 job' : n.toLocaleString('en-US') + ' jobs';
    }
    if (els.countContext) {
      const bits = [];
      if (state.q) bits.push('“' + state.q + '”');
      if (state.location) bits.push('in ' + state.location);
      els.countContext.textContent = bits.length ? 'matching ' + bits.join(' ') : '';
    }
    if (els.more) {
      const remaining = current.length - slice.length;
      els.more.hidden = remaining <= 0;
      const label = RW.qs('[data-more-label]', els.more);
      if (label) label.textContent = 'Load ' + Math.min(remaining, SITE_CONFIG.listing.pageSize) + ' more jobs';
    }
    renderActiveChips();
    updateClearVisibility();
  }

  function loadMore() {
    shown += SITE_CONFIG.listing.pageSize;
    render(false);
    /* Move focus to the first newly added card for keyboard users. */
    const cards = RW.qsa('.job-card', els.results);
    const target = cards[Math.max(0, shown - SITE_CONFIG.listing.pageSize)];
    if (target) target.querySelector('a')?.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------- filter form */
  function checkboxGroup(name, legend, options, selected) {
    return (
      '<fieldset class="filter-group">' +
        '<legend class="filter-group__legend">' + RW.esc(legend) + '</legend>' +
        '<div class="filter-group__body">' +
          options
            .map((opt) => {
              const id = name + '-' + RW.slugify(opt);
              const checked = selected.indexOf(opt) !== -1 ? ' checked' : '';
              return (
                '<label class="check" for="' + id + '">' +
                  '<input type="checkbox" id="' + id + '" name="' + name + '" value="' + RW.escAttr(opt) + '"' + checked + '>' +
                  '<span class="check__box">' + RW.icon('check') + '</span>' +
                  '<span class="check__label">' + RW.esc(opt) + '</span>' +
                  '<span class="check__count" data-count-for="' + name + ':' + RW.escAttr(opt) + '"></span>' +
                '</label>'
              );
            })
            .join('') +
        '</div>' +
      '</fieldset>'
    );
  }

  function buildPanel(panel) {
    const categoryField = lockedCategory
      ? ''
      : '<div class="filter-group">' +
          '<label class="filter-group__legend" for="f-category">Category</label>' +
          '<div class="select-wrap">' +
            '<select id="f-category" name="category">' +
              '<option value="">All categories</option>' +
              CATEGORIES.map(
                (c) =>
                  '<option value="' + RW.escAttr(c.slug) + '"' + (state.category === c.slug ? ' selected' : '') + '>' +
                  RW.esc(c.name) + '</option>'
              ).join('') +
            '</select>' +
          '</div>' +
        '</div>';

    panel.innerHTML =
      '<form class="filters__form" data-filter-form novalidate>' +
        '<div class="filters__head">' +
          '<h2 class="filters__title">' + RW.icon('filter') + 'Filters</h2>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-clear-filters hidden>Clear all</button>' +
          '<button type="button" class="drawer-close" data-close-filters aria-label="Close filters">' + RW.icon('close') + '</button>' +
        '</div>' +

        '<div class="filters__scroll">' +
          '<div class="filter-group">' +
            '<label class="filter-group__legend" for="f-q">Keyword</label>' +
            '<div class="input-wrap">' + RW.icon('search') +
              '<input type="search" id="f-q" name="q" placeholder="Job title, skill or company" value="' + RW.escAttr(state.q) + '" autocomplete="off">' +
            '</div>' +
          '</div>' +

          '<div class="filter-group">' +
            '<label class="filter-group__legend" for="f-location">Location</label>' +
            '<div class="input-wrap">' + RW.icon('pin') +
              '<input type="search" id="f-location" name="location" placeholder="Country or “Remote”" value="' + RW.escAttr(state.location) + '" autocomplete="off" list="country-list">' +
            '</div>' +
            '<datalist id="country-list">' +
              FILTER_OPTIONS.countries.map((c) => '<option value="' + RW.escAttr(c) + '"></option>').join('') +
            '</datalist>' +
          '</div>' +

          categoryField +
          checkboxGroup('type', 'Job type', FILTER_OPTIONS.jobTypes, state.types) +
          checkboxGroup('exp', 'Experience', FILTER_OPTIONS.experience, state.experience) +

          '<div class="filter-group">' +
            '<label class="filter-group__legend" for="f-salary">Salary</label>' +
            '<div class="select-wrap">' +
              '<select id="f-salary" name="salary">' +
                FILTER_OPTIONS.salaryBands.map(
                  (b) => '<option value="' + RW.escAttr(b.id) + '"' + (state.salary === b.id ? ' selected' : '') + '>' + RW.esc(b.label) + '</option>'
                ).join('') +
              '</select>' +
            '</div>' +
            '<p class="filter-hint">Some listings do not publish a salary and are hidden when a minimum is set.</p>' +
          '</div>' +

          '<div class="filter-group">' +
            '<label class="switch" for="f-remote">' +
              '<input type="checkbox" id="f-remote" name="remote"' + (state.remoteOnly ? ' checked' : '') + '>' +
              '<span class="switch__track"><span class="switch__thumb"></span></span>' +
              '<span class="switch__label">Remote jobs only</span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="filters__foot">' +
          '<button type="button" class="btn btn--primary btn--block" data-close-filters>Show results</button>' +
        '</div>' +
      '</form>';
  }

  /* --------------------------------------------------------- active chips */
  function renderActiveChips() {
    if (!els.chips) return;
    const chips = [];
    if (state.q) chips.push(['q', 'Keyword: ' + state.q]);
    if (state.location) chips.push(['location', 'Location: ' + state.location]);
    if (state.category && !lockedCategory) chips.push(['category', Jobs.categoryMeta(state.category).name]);
    state.types.forEach((t) => chips.push(['type:' + t, t]));
    state.experience.forEach((t) => chips.push(['exp:' + t, t]));
    if (state.salary !== 'any') {
      const band = FILTER_OPTIONS.salaryBands.find((b) => b.id === state.salary);
      if (band) chips.push(['salary', band.label]);
    }
    if (state.remoteOnly) chips.push(['remote', 'Remote only']);

    els.chips.innerHTML = chips
      .map(
        ([key, label]) =>
          '<button type="button" class="chip chip--active" data-remove-filter="' + RW.escAttr(key) + '">' +
          RW.esc(label) + RW.icon('close') + '</button>'
      )
      .join('');
    els.chips.hidden = chips.length === 0;
  }

  function removeFilter(key) {
    if (key.indexOf('type:') === 0) state.types = state.types.filter((t) => t !== key.slice(5));
    else if (key.indexOf('exp:') === 0) state.experience = state.experience.filter((t) => t !== key.slice(4));
    else if (key === 'q') state.q = '';
    else if (key === 'location') state.location = '';
    else if (key === 'category') state.category = '';
    else if (key === 'salary') state.salary = 'any';
    else if (key === 'remote') state.remoteOnly = false;
    syncFormFromState();
    writeUrl();
    render();
  }

  function hasActiveFilters() {
    return !!(
      state.q ||
      state.location ||
      (state.category && !lockedCategory) ||
      state.types.length ||
      state.experience.length ||
      state.salary !== 'any' ||
      state.remoteOnly
    );
  }

  function updateClearVisibility() {
    RW.qsa('[data-clear-filters]').forEach((b) => (b.hidden = !hasActiveFilters()));
  }

  function clearAll() {
    state.q = '';
    state.location = '';
    if (!lockedCategory) state.category = '';
    state.types = [];
    state.experience = [];
    state.salary = 'any';
    state.remoteOnly = false;
    state.sort = 'newest';
    syncFormFromState();
    if (els.sort) els.sort.value = state.sort;
    writeUrl();
    render();
  }

  function syncFormFromState() {
    const form = els.form;
    if (!form) return;
    const q = RW.qs('[name="q"]', form);
    if (q) q.value = state.q;
    const loc = RW.qs('[name="location"]', form);
    if (loc) loc.value = state.location;
    const cat = RW.qs('[name="category"]', form);
    if (cat) cat.value = state.category;
    const sal = RW.qs('[name="salary"]', form);
    if (sal) sal.value = state.salary;
    const rem = RW.qs('[name="remote"]', form);
    if (rem) rem.checked = state.remoteOnly;
    RW.qsa('[name="type"]', form).forEach((cb) => (cb.checked = state.types.indexOf(cb.value) !== -1));
    RW.qsa('[name="exp"]', form).forEach((cb) => (cb.checked = state.experience.indexOf(cb.value) !== -1));
  }

  function readForm() {
    const form = els.form;
    if (!form) return;
    state.q = (RW.qs('[name="q"]', form)?.value || '').trim();
    state.location = (RW.qs('[name="location"]', form)?.value || '').trim();
    if (!lockedCategory) state.category = RW.qs('[name="category"]', form)?.value || '';
    state.salary = RW.qs('[name="salary"]', form)?.value || 'any';
    state.remoteOnly = !!RW.qs('[name="remote"]', form)?.checked;
    state.types = RW.qsa('[name="type"]:checked', form).map((cb) => cb.value);
    state.experience = RW.qsa('[name="exp"]:checked', form).map((cb) => cb.value);
  }

  /* Live counts next to each job-type / experience option. */
  function updateOptionCounts() {
    const base = all.filter((job) => {
      if (state.category && job.category !== state.category) return false;
      if (state.remoteOnly && !job.remote) return false;
      if (!Search.matchesLocation(job, state.location)) return false;
      if (!Search.matches(job, state.q)) return false;
      return true;
    });
    RW.qsa('[data-count-for]').forEach((node) => {
      const [group, value] = node.dataset.countFor.split(':');
      const field = group === 'type' ? 'jobType' : 'experience';
      node.textContent = String(base.filter((j) => j[field] === value).length);
    });
  }

  /* ----------------------------------------------------------------- bind */
  let debounceTimer = null;
  function bind() {
    els.form = RW.qs('[data-filter-form]');
    if (els.form) {
      els.form.addEventListener('submit', (e) => e.preventDefault());

      els.form.addEventListener('input', (e) => {
        if (e.target.type === 'search') {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            readForm();
            if (state.q && state.sort === 'newest' && els.sort && els.sort.dataset.userSet !== '1') {
              state.sort = 'relevance';
              els.sort.value = 'relevance';
            }
            writeUrl();
            render();
            updateOptionCounts();
          }, 220);
        }
      });

      els.form.addEventListener('change', (e) => {
        if (e.target.type === 'search') return;
        readForm();
        writeUrl();
        render();
        updateOptionCounts();
      });
    }

    els.sort = RW.qs('[data-sort]');
    if (els.sort) {
      els.sort.addEventListener('change', () => {
        els.sort.dataset.userSet = '1';
        state.sort = els.sort.value;
        writeUrl();
        render(false);
      });
    }

    if (els.more) {
      const btn = RW.qs('button', els.more);
      if (btn) btn.addEventListener('click', loadMore);
    }

    document.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-remove-filter]');
      if (chip) {
        removeFilter(chip.dataset.removeFilter);
        return;
      }
      if (e.target.closest('[data-clear-filters]')) clearAll();
    });
  }

  /* ----------------------------------------------------------------- init */
  function init(options) {
    const o = options || {};
    lockedCategory = o.lockedCategory || '';
    els.results = RW.qs(o.resultsSelector || '[data-results]');
    els.count = RW.qs('[data-result-count]');
    els.countContext = RW.qs('[data-result-context]');
    els.chips = RW.qs('[data-active-filters]');
    els.more = RW.qs('[data-load-more]');

    readUrl();

    const panel = RW.qs('[data-filter-panel]');
    if (panel) buildPanel(panel);

    const sortSelect = RW.qs('[data-sort]');
    if (sortSelect) {
      const options = FILTER_OPTIONS.sort.slice();
      options.unshift({ id: 'relevance', label: 'Most relevant' });
      sortSelect.innerHTML = options
        .map((s) => '<option value="' + RW.escAttr(s.id) + '"' + (state.sort === s.id ? ' selected' : '') + '>' + RW.esc(s.label) + '</option>')
        .join('');
    }

    bind();
    Jobs.showSkeleton(els.results, 6);

    Jobs.load()
      .then((list) => {
        all = list;
        if (typeof o.onData === 'function') o.onData(all);
        render();
        updateOptionCounts();
      })
      .catch(() => {
        Jobs.showError(els.results, () => init(o));
      });
  }

  return { init, state, clearAll, render };
})();
