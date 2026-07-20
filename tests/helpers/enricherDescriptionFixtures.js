/**
 * Shared enricher fixtures for the issue 800 write-time resolution suites.
 *
 * Fabricate RESOLVES descriptions through Foundry's own enricher at write time, so
 * these fixtures come in pairs: the RAW authored text a source item carries, and the
 * ENRICHED HTML Foundry's enricher produces from it. `plainTextDescription` is only
 * ever fed the enriched half — it normalizes, it does not resolve.
 *
 * Hoisted here so the reporter's exact string, the broad mixed fixture, and the fake
 * enricher are defined once and reused across the unit, composition, repair, and
 * read-side suites (`tests/**` counts for the Sonar duplication gate).
 */

// The reporter's Alchemist's Supplies description (Mythwright world): a list of
// labelled @UUID content links, plus ONE deliberately label-less reference — the case
// the rejected approach dropped entirely and write-time resolution renders as the
// referenced document's real name.
export const REPORTER_ENRICHER_DESCRIPTION = [
  '@UUID[Compendium.dnd5e.equipment24.Item.phbagA cid0000000]{Acid}',
  "@UUID[Compendium.dnd5e.equipment24.Item.alchemyfire01]{Alchemist's Fire}",
  '@UUID[Compendium.dnd5e.equipment24.Item.componentpouch]',
  '@UUID[Compendium.dnd5e.equipment24.Item.oil0000000000]{Oil}',
  '@UUID[Compendium.dnd5e.equipment24.Item.paper000000000]{Paper}',
  '@UUID[Compendium.dnd5e.equipment24.Item.perfume0000000]{Perfume}',
].join(', ');

export const REPORTER_RESOLVED_EXPECTED =
  "Acid, Alchemist's Fire, Component Pouch, Oil, Paper, Perfume";

// A single string exercising every branch the screenshot fixture also carries:
// labelled links forming a list, a label-less link resolved to its document name, a
// labelled roll, and a bare (command-less) roll that must NOT be evaluated.
export const BROAD_ENRICHER_DESCRIPTION =
  'Craft: @UUID[Compendium.dnd5e.items.Item.acid00]{Acid}, ' +
  '@UUID[Compendium.dnd5e.items.Item.oil000], ' +
  '@UUID[Compendium.dnd5e.items.Item.paper0]{Paper}. ' +
  'Burns for [[/r 1d4]]{1d4 rounds} dealing [[2d6]] fire damage.';

export const BROAD_RESOLVED_EXPECTED =
  'Craft: Acid, Oil, Paper. Burns for 1d4 rounds dealing 2d6 fire damage.';

/**
 * The uuid → document name map the fake enricher resolves against. Mirrors the
 * compendium items the fixtures reference.
 */
export const FIXTURE_DOCUMENT_NAMES = Object.freeze({
  'Compendium.dnd5e.equipment24.Item.phbagA cid0000000': 'Acid',
  'Compendium.dnd5e.equipment24.Item.alchemyfire01': "Alchemist's Fire",
  'Compendium.dnd5e.equipment24.Item.componentpouch': 'Component Pouch',
  'Compendium.dnd5e.equipment24.Item.oil0000000000': 'Oil',
  'Compendium.dnd5e.equipment24.Item.paper000000000': 'Paper',
  'Compendium.dnd5e.equipment24.Item.perfume0000000': 'Perfume',
  'Compendium.dnd5e.items.Item.acid00': 'Acid',
  'Compendium.dnd5e.items.Item.oil000': 'Oil',
  'Compendium.dnd5e.items.Item.paper0': 'Paper',
});

/** The placeholder core's `TextEditor.createAnchor` uses for an unresolvable ref. */
export const UNKNOWN_PLACEHOLDER = 'Unknown';

/**
 * A stand-in for Foundry's enricher, faithful to the behaviours this change depends
 * on and nothing more:
 *
 * - `@UUID[ref]{Label}` and `@UUID[ref]` alike become a `content-link` anchor whose
 *   text is the REFERENCED DOCUMENT'S NAME when the ref resolves — that is the whole
 *   point of resolving rather than flattening to whatever label was typed;
 * - an unresolvable ref becomes `a.content-link.broken` carrying the AUTHORED LABEL
 *   when one was supplied, and the localized placeholder otherwise (core sets
 *   `data.name` from the match before it decides brokenness);
 * - roll expressions are left alone, because we pass `rolls: false`.
 *
 * @param {Record<string, string>} [names] uuid → document name
 * @returns {(raw: string) => Promise<string>} an `enrichToHtml`-shaped seam
 */
export function makeFakeEnricher(names = FIXTURE_DOCUMENT_NAMES) {
  return async (raw) =>
    String(raw ?? '').replaceAll(
      /@UUID\[([^\]]{1,512})\](?:\{([^}]{0,512})\})?/g,
      (match, ref, label) => {
        const name = names[ref];
        if (name) return `<a class="content-link" data-uuid="${ref}">${name}</a>`;
        const text = label || UNKNOWN_PLACEHOLDER;
        return `<a class="content-link broken">${text}</a>`;
      }
    );
}

/**
 * Install a minimal `game.i18n` so the broken-anchor pass can compare against the
 * RUNTIME-localized `COMMON.Unknown` rather than a hardcoded string. Returns a
 * restore function.
 *
 * @returns {() => void}
 */
export function withUnknownPlaceholder() {
  const previous = globalThis.game;
  globalThis.game = {
    ...(previous ?? {}),
    i18n: { localize: (key) => (key === 'COMMON.Unknown' ? UNKNOWN_PLACEHOLDER : key) },
  };
  return () => {
    if (previous === undefined) delete globalThis.game;
    else globalThis.game = previous;
  };
}
