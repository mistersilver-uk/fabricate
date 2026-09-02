/**
 * The Primitive Lab's page model: manifest rows plus library structure plus catalogue rows, joined
 * into the groups the rail draws.
 *
 * ── NOTHING HERE IS A LIST ────────────────────────────────────────────────────────────────────
 *
 * Every set on this page is DERIVED, and that is a deliberate constraint rather than a tidiness
 * preference. The alternatives were all available and all rejected:
 *
 *   - The section a primitive belongs to could be a `group` field on its catalogue row. It is read
 *     from the library's own `div.spec-head > h4` instead, so moving a primitive between sections
 *     there moves it here with no edit.
 *   - The specified-but-unbuilt names could be a literal, and `tests/design-system-coverage.test.js`
 *     holds exactly that literal — 33 names it pins by equality. Here they are the library's names
 *     MINUS the manifest's, which is the same set computed rather than typed, so it cannot be
 *     right in one file and stale in the other.
 *   - The undocumented set could be a literal too. It is the manifest rows whose `library` is null.
 *
 * The consequence worth stating: a primitive that ships and gains a library entry moves out of
 * "Shipped, undocumented" and into its section on the next page load, and a primitive that is
 * promoted out of the near-member register moves group the same way. The only thing anybody has to
 * write is the catalogue row that says how to DRIVE it, which is the one thing that genuinely
 * cannot be derived.
 */
import MANIFEST from '../../../scripts/lib/designSystemPrimitives.json';

import { tagFor } from './knobs.js';
import { namesIn, readLibrary } from './library.js';

/**
 * The catalogue, assembled from every file under `catalogue/`.
 *
 * SPLIT ACROSS FILES, and for a reason that is about people rather than bytes: one file holding all
 * fifty-seven rows is a single owned path, so two people cataloguing different sections of the
 * library collide on every commit. One file per group makes them disjoint. The glob means adding a
 * group file is not also an edit here.
 */
const CATALOGUE = Object.values(
  import.meta.glob('./catalogue/*.json', { eager: true, import: 'default' })
).flat();

/** The groups that are not library sections, in the order they follow them. */
const APPENDED_GROUPS = [
  {
    id: 'undocumented',
    num: '—',
    title: 'Shipped, undocumented',
    lede:
      'Manifest rows carrying no library entry. Each one ships and is imported by two or more ' +
      'files, so it is a shared primitive by the bar the spec sets, and the library does not name ' +
      'it. Each row carries its own reason, and it is shown alongside.',
  },
  {
    id: 'near-members',
    num: '—',
    title: 'Below the caller bar',
    lede:
      'Shared components recorded as NOT primitives, because the spec puts the bar at two or more ' +
      'independent callers and these are under it. They are rendered here because a component with ' +
      'no callers at all is dead code, and that is easier to act on when you can see it.',
  },
];

const RULED_OUT_GROUP = {
  id: 'ruled-out',
  num: '15',
  title: 'Ruled out',
  lede:
    'Candidates adjudicated and declined, with the composition that replaces each one. Recorded so ' +
    'they are not re-proposed.',
};

/**
 * Build the page model.
 *
 * @returns {Promise<{groups: object[], counts: {mounted: number, unbuilt: number, ruledOut: number}}>}
 */
export async function buildModel() {
  const library = await readLibrary();
  const catalogue = new Map(CATALOGUE.map((row) => [row.path, row]));
  const shippedNames = new Set();

  const mounted = [];
  for (const table of ['designSystemPrimitives', 'notAPrimitive']) {
    for (const row of MANIFEST[table]) {
      const name = row.library ? namesIn(row.library)[0] : null;
      if (name) shippedNames.add(name);
      mounted.push({
        kind: 'mounted',
        path: row.path,
        tag: tagFor(row),
        name: name ?? tagFor(row),
        libraryName: name,
        evidence: row.evidence,
        callers: row.callers ?? null,
        member: table === 'designSystemPrimitives',
        why: name ? (library.whyOf.get(name) ?? row.why) : row.why,
        entry: catalogue.get(row.path) ?? null,
        // TABLE FIRST, NAME SECOND. The near-member table holds three rows the library DOES name
        // (`<RowDisclosure>`, `<ArtPathPicker>`, `<ExprInput>`), and those belong in the register
        // that records why they are not members rather than in the section whose other entries are.
        // Deciding on the name would file them beside primitives they were adjudicated against.
        groupId:
          table === 'notAPrimitive'
            ? 'near-members'
            : (library.sectionOf.get(name) ?? 'undocumented'),
      });
    }
  }

  const unbuilt = library.names
    .filter((name) => !shippedNames.has(name))
    .map((name) => ({
      kind: 'unbuilt',
      name,
      why: library.whyOf.get(name) ?? '',
      groupId: library.sectionOf.get(name) ?? 'undocumented',
    }));

  // `name` is written `<MemberRow>` on nine of the ten rows and `Destructive panel` on the tenth,
  // which is not a component name at all. `namesIn` yields nothing for that one, so the raw field is
  // the fallback rather than a special case.
  const ruledOut = MANIFEST.ruledOut.map((row) => ({
    kind: 'ruled-out',
    name: namesIn(row.name)[0] ?? row.name,
    verdict: row.verdict,
    replacement: row.replacement,
    why: row.why,
    groupId: 'ruled-out',
  }));

  const rows = [...mounted, ...unbuilt, ...ruledOut];
  const sectionGroups = library.sections
    .map((section) => ({ ...section, rows: rows.filter((row) => row.groupId === section.id) }))
    .filter((group) => group.rows.length > 0);
  const appended = [...APPENDED_GROUPS, RULED_OUT_GROUP]
    .map((group) => ({ ...group, rows: rows.filter((row) => row.groupId === group.id) }))
    .filter((group) => group.rows.length > 0);

  return {
    groups: [...sectionGroups, ...appended],
    counts: {
      mounted: mounted.length,
      unbuilt: unbuilt.length,
      ruledOut: ruledOut.length,
    },
  };
}
