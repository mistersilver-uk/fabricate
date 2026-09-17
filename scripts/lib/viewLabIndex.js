/** The View Lab's local index page, as pure functions. */

/** Frames whose reach is not directly comparable to a smoke frame get a visible marker. */
const REACH_NOTE = Object.freeze({
  exact: '',
  window: 'reaches the window, not this exact state',
  beyond: 'no live-smoke counterpart',
});

/** Escape text for interpolation into HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replaceAll(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  );
}

/** Every tag a frame can be filtered by. */
export function tagsFor(viewCase) {
  if (!viewCase) return ['unregistered'];
  return [...new Set([...(viewCase.kinds ?? []), viewCase.reaches].filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
}

/** The whole tag vocabulary present in a set of frames, with how many carry each. */
export function collectTags(sections) {
  const counts = new Map();
  for (const section of sections) {
    for (const area of section.areas) {
      for (const frame of area.frames) {
        for (const tag of frame.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

/** Group captured frames into the sections the page renders. */
export function groupFrames(frames, cases) {
  const byId = new Map(cases.map((entry) => [entry.id, entry]));
  const sections = new Map();

  for (const frame of frames) {
    const viewCase = byId.get(frame.id) ?? null;
    const [app = 'unknown', area = 'other'] = viewCase?.kinds ?? [];
    if (!sections.has(app)) sections.set(app, new Map());
    const areas = sections.get(app);
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push({
      id: frame.id,
      file: `${frame.id}.png`,
      label: viewCase?.label ?? frame.id,
      reach: viewCase?.reaches ?? null,
      note: viewCase ? REACH_NOTE[viewCase.reaches] : 'not in the case registry',
      tags: tagsFor(viewCase),
      width: frame.width ?? null,
      height: frame.height ?? null,
      head: frame.head ?? null,
    });
  }

  return [...sections]
    .map(([app, areas]) => ({
      app,
      areas: [...areas]
        .map(([area, entries]) => ({
          area,
          frames: entries.sort((left, right) => left.id.localeCompare(right.id)),
        }))
        .sort((left, right) => left.area.localeCompare(right.area)),
    }))
    .sort((left, right) => left.app.localeCompare(right.app));
}

/** Count frames by reach, for the page's summary line. */
export function summarise(frames, cases) {
  const byId = new Map(cases.map((entry) => [entry.id, entry]));
  const counts = { total: frames.length, exact: 0, window: 0, beyond: 0, unknown: 0 };
  for (const frame of frames) {
    const reach = byId.get(frame.id)?.reaches;
    if (reach && reach in counts) counts[reach] += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function renderFrame(frame, head) {
  const dimensions = frame.width && frame.height ? `${frame.width}×${frame.height}` : '';
  // Frames accumulate across runs, so a directory can hold frames drawn by different code.
  const stale =
    head && frame.head && frame.head !== head
      ? `<p class="stale">captured at ${escapeHtml(frame.head)}, not the current ${escapeHtml(head)}</p>`
      : '';
  const note = frame.note ? `<p class="note">${escapeHtml(frame.note)}</p>` : '';
  // The smoke label a frame corresponds to used to be printed here.
  const tags = frame.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  return `      <figure class="frame" id="${escapeHtml(frame.id)}" data-tags="${escapeHtml(frame.tags.join(' '))}">
        <a href="${escapeHtml(frame.file)}"><img src="${escapeHtml(frame.file)}" alt="${escapeHtml(frame.label)}" loading="lazy"></a>
        <figcaption>
          <p class="label">${escapeHtml(frame.label)}</p>
          <p class="meta"><code>${escapeHtml(frame.id)}</code>${dimensions ? ` · ${dimensions}` : ''}</p>
          <p class="tags">${tags}</p>
          ${note}${stale}
        </figcaption>
      </figure>`;
}

/** Render the whole index page. */
export function renderIndexHtml({ sections, counts, foundryVersion = null, head = null }) {
  const body = sections
    .map(
      (section) => `  <section>
    <h2>${escapeHtml(section.app)}</h2>
${section.areas
  .map(
    (
      area
    ) => `    <h3 data-area>${escapeHtml(area.area)} <span class="count">${area.frames.length}</span></h3>
    <div class="grid">
${area.frames.map((frame) => renderFrame(frame, head)).join('\n')}
    </div>`
  )
  .join('\n')}
  </section>`
    )
    .join('\n');

  const filters = collectTags(sections)
    .map(
      ({ tag, count }) =>
        `<button type="button" class="tag-filter" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<span class="count">${count}</span></button>`
    )
    .join('');

  const chrome = foundryVersion
    ? `Foundry ${escapeHtml(foundryVersion)} chrome`
    : 'chrome version unrecorded';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fabricate View Lab — captured frames</title>
<style>
  :root { color-scheme: dark light; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #14100d; color: #f0e2d4; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  .summary { margin: 0 0 2rem; color: #c8b1a3; font-size: .875rem; }
  h2 { margin: 2.5rem 0 .5rem; font-size: 1.15rem; text-transform: capitalize; border-bottom: 1px solid #3a2f28; padding-bottom: .35rem; }
  h3 { margin: 1.5rem 0 .75rem; font-size: .95rem; font-weight: 600; text-transform: capitalize; color: #e0c9b4; }
  .count { color: #8d7a6d; font-weight: 400; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem; }
  figure { margin: 0; background: #1d1713; border: 1px solid #3a2f28; border-radius: 6px; overflow: hidden; }
  img { display: block; width: 100%; height: auto; background: #0d0a08; }
  figcaption { padding: .6rem .7rem .7rem; }
  .label { margin: 0 0 .2rem; font-size: .875rem; font-weight: 600; }
  .meta { margin: 0; font-size: .75rem; color: #a6907f; }
  code { font-family: ui-monospace, monospace; font-size: .72rem; }
  .note, .stale { margin: .35rem 0 0; font-size: .72rem; }
  .note { color: #d2a679; }
  .stale { color: #d98c6a; }
  .filters { position: sticky; top: 0; z-index: 2; padding: .75rem 0 1rem; background: #14100d; border-bottom: 1px solid #3a2f28; margin-bottom: 1rem; }
  .tag-filters { display: flex; flex-wrap: wrap; gap: .3rem; }
  .tag-filter { font: inherit; font-size: .74rem; cursor: pointer; padding: .18rem .5rem; border-radius: 999px; border: 1px solid #3a2f28; background: #1d1713; color: #c8b1a3; display: inline-flex; gap: .35rem; align-items: baseline; }
  .tag-filter:hover { border-color: #6d5847; }
  .tag-filter.is-on { background: #f1d1b5; border-color: #f1d1b5; color: #1d1713; font-weight: 600; }
  .tag-filter .count { font-size: .66rem; opacity: .7; }
  .filter-state { margin: .6rem 0 0; font-size: .75rem; color: #a6907f; }
  .filter-state button { font: inherit; background: none; border: 0; color: #d2a679; cursor: pointer; text-decoration: underline; padding: 0; }
  .tags { margin: .35rem 0 0; display: flex; flex-wrap: wrap; gap: .22rem; }
  .tag { font-size: .66rem; padding: .1rem .38rem; border-radius: 3px; background: #2a221c; color: #b39d8b; }
  [hidden] { display: none !important; }
  .reach { padding: 0 .35rem; border-radius: 3px; font-size: .7rem; }
  .reach-exact { background: #24402c; color: #a8e0b4; }
  .reach-window { background: #40361f; color: #e0cf9a; }
  .reach-beyond { background: #23303f; color: #a8c8e0; }
  @media (prefers-color-scheme: light) {
    body { background: #f7f3e8; color: #23201c; }
    figure { background: #fff; border-color: #ddd3c4; }
    h2 { border-color: #ddd3c4; }
  }
</style>
</head>
<body>
<h1>Fabricate View Lab</h1>
<p class="summary">${counts.total} frames · ${counts.exact} exact · ${counts.window} window · ${counts.beyond} beyond${counts.unknown > 0 ? ` · ${counts.unknown} unrecognised` : ''} · ${chrome}</p>
<div class="filters">
  <div class="tag-filters">${filters}</div>
  <p class="filter-state"><span data-visible-count>${counts.total}</span> of ${counts.total} shown · <button type="button" data-clear hidden>clear filters</button></p>
</div>
${body}
<script>
/* Multi-tag filter, AND semantics: a frame shows when it carries EVERY selected tag.
   AND rather than OR because the question is "crafting AND progressive AND success", and an OR
   filter over 27 tags widens toward showing everything, which is what the unfiltered page does.

   This is the one script on the page, and it is why the page is no longer script-free — a
   deliberate trade for the filtering. It stays self-contained: no imports, no network, so the page
   still works from file://. */
(() => {
  const selected = new Set();
  const frames = [...document.querySelectorAll('.frame')];
  const buttons = [...document.querySelectorAll('.tag-filter')];
  const visibleCount = document.querySelector('[data-visible-count]');
  const clear = document.querySelector('[data-clear]');

  function apply() {
    let shown = 0;
    for (const frame of frames) {
      const tags = new Set(frame.dataset.tags.split(' '));
      const match = [...selected].every((tag) => tags.has(tag));
      frame.hidden = !match;
      if (match) shown += 1;
    }
    /* Hide a heading whose frames are all filtered out, and the whole section with it — a page of
       empty headings reads as "no results" far less clearly than the headings simply going away. */
    for (const heading of document.querySelectorAll('[data-area]')) {
      const grid = heading.nextElementSibling;
      const any = [...grid.querySelectorAll('.frame')].some((frame) => !frame.hidden);
      heading.hidden = !any;
      grid.hidden = !any;
    }
    for (const section of document.querySelectorAll('section')) {
      section.hidden = ![...section.querySelectorAll('.frame')].some((frame) => !frame.hidden);
    }
    visibleCount.textContent = String(shown);
    clear.hidden = selected.size === 0;
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      if (selected.has(tag)) selected.delete(tag);
      else selected.add(tag);
      button.classList.toggle('is-on', selected.has(tag));
      apply();
    });
  }
  clear.addEventListener('click', () => {
    selected.clear();
    for (const button of buttons) button.classList.remove('is-on');
    apply();
  });
})();
</script>
</body>
</html>
`;
}
