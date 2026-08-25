/**
 * The GM-facing presentation of a gathering composition state — chip tone, glyph,
 * localization key suffix and untranslated fallback — for every state in the
 * vocabulary `ENVIRONMENT_COMPOSITION_STATES` (`src/systems/gatheringComposition.js`)
 * declares.
 *
 * **Why it is a module and not a `<script>` local.** It lived inside
 * `CompositionStatePill.svelte`, and a compiled Svelte component exposes only
 * `<script module>` exports — exactly one component in this repository has such a
 * block — so nothing could import the map and assert it key-for-key against the
 * vocabulary it mirrors. A hand-maintained mirror with no guard is precisely how a
 * state gets added with no chip to render it. The parity assertion lives in
 * `tests/systems/gatheringComposition.test.js`, which imports both this map and
 * that Set.
 *
 * **This module deliberately holds NO import.** Four mounted suites compile
 * `CompositionStatePill.svelte` and must copy every module it reaches; none of them
 * walks imports transitively, and an omission does not fail those suites — it hangs
 * them, reported as `# cancelled` with `# fail 0`. Importing the vocabulary here to
 * "prove" the mirror would therefore drag `src/systems/gatheringComposition.js` and
 * `src/systems/gatheringMatch.js` into two allowlists that need neither, to render a
 * chip. The mirror is proved by the test that imports both instead, and presentation
 * stays out of `src/systems/`.
 *
 * @typedef {{ tone: string, icon: string, key: string, fallback: string, unknown?: true }} CompositionStateMeta
 */

/**
 * One entry per composition state, keyed by the state id the admin store's row
 * classifier produces. `key` is the leaf under
 * `FABRICATE.Admin.Manager.EnvironmentEditor.Composition`; `fallback` is what
 * renders when that catalogue entry is missing.
 *
 * @type {Readonly<Record<string, CompositionStateMeta>>}
 */
export const COMPOSITION_STATE_META = Object.freeze({
  includedByMatch: {
    tone: 'active',
    icon: 'fas fa-link',
    key: 'IncludedByMatch',
    fallback: 'Included by match',
  },
  explicitlyIncluded: {
    tone: 'active',
    icon: 'fas fa-check',
    key: 'Included',
    fallback: 'Included',
  },
  forceIncluded: {
    tone: 'warning',
    icon: 'fas fa-bolt',
    key: 'ForceIncluded',
    fallback: 'Force included',
  },
  candidate: {
    tone: 'neutral',
    icon: 'fas fa-circle-question',
    key: 'Candidate',
    fallback: 'Matching candidate',
  },
  excluded: { tone: 'danger', icon: 'fas fa-ban', key: 'Excluded', fallback: 'Excluded' },
  includedButUnavailable: {
    tone: 'warning',
    icon: 'fas fa-triangle-exclamation',
    key: 'IncludedButUnavailable',
    fallback: 'Included but unavailable',
  },
  notMatching: {
    tone: 'disabled',
    icon: 'fas fa-circle-minus',
    key: 'NotMatching',
    fallback: 'Not matching',
  },
  libraryDisabled: {
    tone: 'disabled',
    icon: 'fas fa-power-off',
    key: 'LibraryDisabled',
    fallback: 'Library disabled',
  },
});

/**
 * What an UNRECOGNISED state renders as. The previous fallback was
 * `META[state] || META.candidate`, which drew a confident, wrong **"Matching
 * candidate"** chip — a state the GM can act on — for a state this map has never
 * heard of. That branch is unreachable while the map and the vocabulary agree, and
 * the point is that the next change to the vocabulary is what makes it reachable.
 *
 * `fas fa-circle-exclamation` rather than `fas fa-circle-question`: the question
 * mark is already `candidate`'s glyph, so reusing it would reproduce the exact
 * confusion this fallback exists to remove. Both are Font Awesome **Free**.
 *
 * The label is localized copy, never the state id: rendering a developer string
 * like `partiallyIncluded` into a GM-facing chip is its own defect. The raw id is
 * carried in `title` (and in `data-composition-state`) by the pill instead, where a
 * developer can still read it.
 *
 * `unknown` marks this entry alone, so a caller can tell the fallback from a real
 * entry without a second lookup or an identity comparison.
 *
 * @type {CompositionStateMeta}
 */
export const UNKNOWN_COMPOSITION_STATE_META = Object.freeze({
  tone: 'disabled',
  icon: 'fas fa-circle-exclamation',
  key: 'UnknownState',
  fallback: 'Unrecognised state',
  unknown: true,
});

/**
 * The presentation for `state`, or {@link UNKNOWN_COMPOSITION_STATE_META} when this
 * map has no entry for it.
 *
 * @param {string} state
 * @returns {CompositionStateMeta}
 */
export function resolveCompositionStateMeta(state) {
  return COMPOSITION_STATE_META[state] || UNKNOWN_COMPOSITION_STATE_META;
}
