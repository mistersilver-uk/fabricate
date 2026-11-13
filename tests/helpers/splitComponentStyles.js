/**
 * The components whose scoped styles live in a part beside them (issue 2317): `Chip` keeps what
 * paints its children, and `ChipFrame` every rule on its root. A suite reading one's CSS reads both.
 */
export const STYLE_PARTS = Object.freeze({
  'src/ui/svelte/components/Chip.svelte': ['src/ui/svelte/components/ChipFrame.svelte'],
});

/** The repo-relative paths whose styles make up `path`'s, parts first, as a cascade reads them. */
export const styleSourcesOf = (path) => [...(STYLE_PARTS[path] ?? []), path];

/** `path`'s style text in a `collectStyleCorpus` corpus, which keys each part under its own file. */
export const styleTextOf = (corpus, path) =>
  styleSourcesOf(path)
    .map((source) => corpus[source])
    .filter(Boolean)
    .join('\n');

/** Every part, whose rules the corpus reads under its owner's path. */
export const STYLE_PART_PATHS = new Set(Object.values(STYLE_PARTS).flat());
