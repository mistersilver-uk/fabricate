/**
 * The View Lab's local index page, as pure functions.
 *
 * A directory of 150 identically-shaped PNGs is not browsable. This turns it into one static page
 * grouped the way the registry already describes the frames, so finding "the knowledge tab at narrow
 * width" is a scroll rather than a filename guess.
 *
 * Split into pure functions on purpose. The grouping and escaping rules are the parts that can be
 * wrong in a way nobody notices — a mis-grouped frame or an unescaped label still renders a page —
 * so they are testable without a filesystem, a browser, or a capture run. `view-lab-index.mjs` does
 * the IO and nothing else.
 *
 * Grouping is derived, never authored: the first `kinds` entry of every case is its application
 * (`manager` / `player`), and the second is its area. Both already exist and are already gated by
 * `tests/view-lab-cases.test.js`, so the index cannot drift from the registry without that failing
 * first.
 */

/** Frames whose reach is not directly comparable to a smoke frame get a visible marker. */
const REACH_NOTE = Object.freeze({
  exact: '',
  window: 'reaches the window, not this exact state',
  beyond: 'no live-smoke counterpart',
});

/**
 * Escape text for interpolation into HTML.
 *
 * Case labels and ids are repository-authored rather than user input, so this is not a security
 * boundary — but an ampersand in a label ("Tags & Categories", which the registry really contains)
 * produces invalid markup without it, and an index page that silently mis-renders one row is the
 * kind of thing nobody reports.
 *
 * @param {unknown} value Value to escape.
 * @returns {string} HTML-safe text.
 */
export function escapeHtml(value) {
  return String(value ?? '').replaceAll(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  );
}

/**
 * Group captured frames into the sections the page renders.
 *
 * Takes the manifest's frame list and the registry, and returns only frames that were ACTUALLY
 * captured — an index listing a frame that is not on disk sends the reader to a broken image, which
 * is worse than omitting it. Frames with no registry entry are still listed, under `Unknown`, rather
 * than dropped: a PNG on disk that the registry does not explain is exactly what someone needs to
 * see.
 *
 * @param {Array<{id: string, width?: number, height?: number}>} frames Captured frames.
 * @param {Array<object>} cases The case registry.
 * @returns {Array<{app: string, areas: Array<{area: string, frames: object[]}>}>} Sections, sorted.
 */
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
      smokeLabels: viewCase?.smokeLabels ?? [],
      width: frame.width ?? null,
      height: frame.height ?? null,
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

/**
 * Count frames by reach, for the page's summary line.
 *
 * @param {Array<object>} frames Captured frames.
 * @param {Array<object>} cases The case registry.
 * @returns {{total: number, exact: number, window: number, beyond: number, unknown: number}} Counts.
 */
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

function renderFrame(frame) {
  const dimensions = frame.width && frame.height ? `${frame.width}×${frame.height}` : '';
  const smoke =
    frame.smokeLabels.length > 0
      ? `<p class="smoke">smoke: ${escapeHtml(frame.smokeLabels.join(', '))}</p>`
      : '';
  const note = frame.note ? `<p class="note">${escapeHtml(frame.note)}</p>` : '';
  return `      <figure class="frame" id="${escapeHtml(frame.id)}">
        <a href="${escapeHtml(frame.file)}"><img src="${escapeHtml(frame.file)}" alt="${escapeHtml(frame.label)}" loading="lazy"></a>
        <figcaption>
          <p class="label">${escapeHtml(frame.label)}</p>
          <p class="meta"><code>${escapeHtml(frame.id)}</code>${dimensions ? ` · ${dimensions}` : ''}${frame.reach ? ` · <span class="reach reach-${escapeHtml(frame.reach)}">${escapeHtml(frame.reach)}</span>` : ''}</p>
          ${note}${smoke}
        </figcaption>
      </figure>`;
}

/**
 * Render the whole index page.
 *
 * Self-contained by design — inline CSS, no fonts, no scripts — so it opens from `file://` with no
 * server and no network. Anything else would make "an easy place to find the screenshots" contingent
 * on running something first.
 *
 * @param {object} model Page model.
 * @param {Array<object>} model.sections Output of {@link groupFrames}.
 * @param {object} model.counts Output of {@link summarise}.
 * @param {string|null} [model.foundryVersion] Chrome version the frames were drawn with.
 * @returns {string} A complete HTML document.
 */
export function renderIndexHtml({ sections, counts, foundryVersion = null }) {
  const body = sections
    .map(
      (section) => `  <section>
    <h2>${escapeHtml(section.app)}</h2>
${section.areas
  .map(
    (
      area
    ) => `    <h3>${escapeHtml(area.area)} <span class="count">${area.frames.length}</span></h3>
    <div class="grid">
${area.frames.map((frame) => renderFrame(frame)).join('\n')}
    </div>`
  )
  .join('\n')}
  </section>`
    )
    .join('\n');

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
  .note, .smoke { margin: .35rem 0 0; font-size: .72rem; }
  .note { color: #d2a679; }
  .smoke { color: #7f8f99; }
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
${body}
</body>
</html>
`;
}
