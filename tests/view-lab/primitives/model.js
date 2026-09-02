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

/**
 * The library's own Ruled out section.
 *
 * The manifest's `ruledOut` rows file INTO it rather than into a group of their own, and the num,
 * title and lede therefore come off the file like every other section's. An appended group here
 * carrying `num: '15'` and its own lede was a copy of a section head that already exists, and once
 * every section is rendered rather than only the populated ones it was also a VISIBLE duplicate:
 * section 15 drawn empty from the library, then drawn again from a literal.
 */
const RULED_OUT_SECTION_ID = 'ruledout';

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
        // TABLE FIRST, NAME SECOND. The near-member table holds TWO rows the library does name
        // (`<ArtPathPicker>` in Pickers, `<RowDisclosure>` in Surfaces), and those belong in the
        // register that records why they are not members rather than in the section whose other
        // entries are. Deciding on the name would file them beside primitives they were
        // adjudicated against.
        //
        // Measured on `origin/main` rather than assumed: an earlier version of this comment named
        // three and included `<ExprInput>`, which is a MEMBER — it is `RollDataExpressionInput` in
        // `designSystemPrimitives`, so it reaches its Composites section by the ordinary path and
        // was never affected by this rule at all. `crossReferences` below is what stops the two
        // real cases from making their library sections look as if they lack an entry.
        groupId:
          table === 'notAPrimitive'
            ? 'near-members'
            : (library.sectionOf.get(name) ?? 'undocumented'),
      });
    }
  }

  // The near-member cross-reference. `<ArtPathPicker>` has a Pickers entry and `<RowDisclosure>` a
  // Surfaces entry, and filing both under "Below the caller bar" leaves those two sections looking
  // as though the library names something the lab cannot show. A derived pointer row appears in the
  // library's own section, says where the component actually lives, and stays correct on its own:
  // promote either row to the primitive table and it becomes an ordinary mounted row in the same
  // section, with nothing here to edit.
  const crossReferences = mounted
    .filter((row) => row.groupId === 'near-members' && row.libraryName)
    .map((row) => ({
      kind: 'xref',
      name: row.libraryName,
      path: row.path,
      why: row.why,
      target: 'near-members',
      groupId: library.sectionOf.get(row.libraryName) ?? 'undocumented',
    }))
    .filter((row) => row.groupId !== 'near-members');

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
    groupId: RULED_OUT_SECTION_ID,
  }));

  const rows = [...mounted, ...crossReferences, ...unbuilt, ...ruledOut];

  // EVERY SECTION THE PARSER SEES, INCLUDING THE ONES WITH NOTHING TO DRIVE.
  //
  // Dropping the empty ones dropped 00 How to use this, 01 Colour, 02 Type, 03 Space & geometry,
  // 04 States & targets, 05 Foundry contract, 12 Sets & groups, 13 Screen recipes, 14 Which one do
  // I use? and 16 Planned migrations — ten of the seventeen. The page then OPENED at "06 Controls"
  // and read as a truncated library rather than as a complete one whose first six sections carry
  // rules instead of components, which is precisely the reading the numbering exists to prevent.
  // Sections 01–04 are additionally rendered LIVE, from `getComputedStyle` over the theme roots.
  const sectionGroups = library.sections.map((section) => ({
    ...section,
    rows: rows.filter((row) => row.groupId === section.id),
  }));
  const appended = APPENDED_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => row.groupId === group.id),
  }));

  return {
    groups: [...sectionGroups, ...appended],
    counts: {
      shipped: mounted.length,
      // The rows the page can actually MOUNT: a manifest row with no catalogue entry has a name, a
      // section and a reason, and nothing that says how to drive it. Reported separately from
      // `shipped` because the two answer different questions — "what ships" and "what this page can
      // put on a plinth" — and a single number that quietly meant the second while being read as
      // the first is the shape of every drift this programme has already measured.
      catalogued: mounted.filter((row) => row.entry).length,
      crossReferenced: crossReferences.length,
      unbuilt: unbuilt.length,
      ruledOut: ruledOut.length,
    },
  };
}
