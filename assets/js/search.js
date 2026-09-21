/* =============================================================================
   search.js — client-side keyword + location search
   -----------------------------------------------------------------------------
   Case-insensitive, whitespace tolerant, token based (every token must match
   somewhere in the job's searchable text). Results can be ranked by relevance.
   ========================================================================== */

'use strict';

const Search = (() => {
  const haystacks = new WeakMap();

  /** Build (and memoise) the lower-cased searchable blob for a job. */
  function haystack(job) {
    let value = haystacks.get(job);
    if (value) return value;
    value = [
      job.title,
      job.company,
      job.location,
      job.country,
      job.jobType,
      job.experience,
      job.description,
      job.skills.join(' '),
      Jobs.categoryMeta(job.category).name,
      job.remote ? 'remote work from home wfh' : ''
    ]
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ');
    haystacks.set(job, value);
    return value;
  }

  function tokenize(query) {
    return String(query || '')
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 || /^[a-z0-9]$/.test(t));
  }

  /** True when every token appears in the job's searchable text. */
  function matches(job, query) {
    const tokens = tokenize(query);
    if (!tokens.length) return true;
    const hay = haystack(job);
    return tokens.every((t) => hay.indexOf(t) !== -1);
  }

  /** Location match is deliberately loose: country, location text or "remote". */
  function matchesLocation(job, location) {
    const q = String(location || '').trim().toLowerCase();
    if (!q) return true;
    if (/^(remote|anywhere|worldwide|work from home|wfh)$/.test(q)) return job.remote;
    const hay = (job.location + ' ' + job.country + (job.remote ? ' remote worldwide anywhere' : '')).toLowerCase();
    return q
      .split(/[\s,]+/)
      .filter(Boolean)
      .every((t) => hay.indexOf(t) !== -1);
  }

  /** Higher score = better keyword match. Used for the "Relevance" ordering. */
  function score(job, query) {
    const tokens = tokenize(query);
    if (!tokens.length) return 0;
    const title = job.title.toLowerCase();
    const company = job.company.toLowerCase();
    const skills = job.skills.join(' ').toLowerCase();
    let total = 0;
    tokens.forEach((t) => {
      if (title.indexOf(t) === 0) total += 24;
      else if (title.indexOf(t) !== -1) total += 16;
      if (skills.indexOf(t) !== -1) total += 8;
      if (company.indexOf(t) !== -1) total += 6;
      if (haystack(job).indexOf(t) !== -1) total += 2;
    });
    return total;
  }

  function filter(list, query, location) {
    if (!query && !location) return list.slice();
    return list.filter((j) => matches(j, query) && matchesLocation(j, location));
  }

  /* -------------------------------------------------------- hero / navbar */
  /** Any <form data-search-form> sends the visitor to jobs.html with params. */
  function initForms() {
    RW.qsa('[data-search-form]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = (RW.qs('[name="q"]', form) || {}).value || '';
        const loc = (RW.qs('[name="location"]', form) || {}).value || '';
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (loc.trim()) params.set('location', loc.trim());
        const qs = params.toString();
        window.location.href = RW.rel('jobs.html') + (qs ? '?' + qs : '');
      });
    });

    /* Popular search chips */
    RW.qsa('[data-chip-search]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const form = chip.closest('[data-search-scope]')?.querySelector('[data-search-form]');
        const input = form ? RW.qs('[name="q"]', form) : null;
        if (input) {
          input.value = chip.dataset.chipSearch;
          input.focus();
        }
      });
    });
  }

  return { matches, matchesLocation, filter, score, tokenize, initForms };
})();
