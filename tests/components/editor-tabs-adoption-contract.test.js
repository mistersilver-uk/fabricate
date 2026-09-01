/**
 * The END STATE of the manager tab-strip conversion (issue 1429, epic 1357).
 *
 * `tests/components/editor-tabs-marker-family.test.js` already asks what `EditorTabs` DRAWS.
 * This file asks the different question the programme actually turns on: is there anything left
 * that draws a manager tab strip WITHOUT it. Nine strips existed when the epic started, the last
 * of them uncounted because it was `role="tablist"` inlined in a 468-line view rather than a file
 * named `*Tabs.svelte`, and a primitive with hand-rolled siblings still standing is a primitive
 * that has not converged.
 *
 * ── TWO CLAUSES, BECAUSE ONE OF THEM CANNOT SEE THE STRIP THAT MATTERS ──────────────────
 *
 * The CLASS clause is the shared factory in `tests/helpers/primitiveAdoptionContract.js`: no raw
 * element outside the allowlist may carry `manager-editor-tab-button`. It is the right shape for
 * a converted site, and on its own it is not enough — `downtime/WorldDowntimeTabs` writes a bare
 * `button` styled by its own scoped block and carries none of the contract classes at all, so a
 * class-keyed gate reports a fully converged corpus while a hand-rolled strip stands in it.
 *
 * The ROLE clause closes that. `role="tablist"` on a raw element is what a tab strip IS,
 * independently of how it is painted, so it is the only token a hand-rolled strip cannot avoid
 * while remaining a tab strip. It is scoped to `apps/manager/`, deliberately: the player-facing
 * strips in `FabricateAppRoot`, `GatheringDetailTabs`, `InteractableBrowserRoot` and
 * `InventoryComponentDetail` are a different surface with a different treatment, and `EditorTabs`
 * is `THE manager's editor tab strip` by its own docblock. Sweeping them in here would assert a
 * convergence nobody has ruled on.
 *
 * ── WHY THE CLASS TOKEN IS `manager-editor-tab-button` AND NOT `manager-editor-tabs` ────
 *
 * The prefix problem decides it, and both candidates were checked against the corpus rather than
 * guessed. `manager-editor-tab` is a prefix of FOUR real, different classes on real, different
 * elements — `-tabs`, `-tab-button`, `-tab-badge`, `-tab-count` — so a `\b`-terminated pattern
 * for it counts all of them, because `\b` matches before a hyphen. The factory's
 * `classTokenPattern` terminates with `(?![\w-])` for exactly this reason.
 *
 * `manager-editor-tabs` would still be wrong even token-terminated, because it is a CONTAINER
 * class four callers compose with a second one (`manager-editor-tabs manager-knowledge-tabs`) and
 * two callers do not use at all (`ChecksEditorTabs` and `SystemEditorTabs` pass
 * `manager-environment-tabs`). `manager-editor-tab-button` is the class the primitive writes on
 * the control itself, it is a prefix of nothing, and the one raw site in the corpus when this
 * landed was the strip this change converted — which is what makes the empty allowlist below a
 * claim rather than an omission.
 *
 * The primitive is not an allowlist entry either, and that is structural rather than a carve-out:
 * it emits the token from `class={`${buttonClass} …`}`, a JavaScript expression, so the raw-element
 * detector — which reads the `class` attribute's SOURCE TEXT — does not see it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { parse } from 'svelte/compiler';

import {
  SOURCES,
  definePrimitiveAdoptionContract,
  walkTemplate,
} from '../helpers/primitiveAdoptionContract.js';
import { byCodePoint } from '../helpers/ratchetBaseline.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PRIMITIVE = 'src/ui/svelte/apps/manager/EditorTabs.svelte';
const MANAGER_DIRECTORY = 'src/ui/svelte/apps/manager/';

/**
 * EMPTY, and the empty array is the claim.
 *
 * One raw `.manager-editor-tab-button` element existed when this landed —
 * `TagsCategoriesView.svelte`'s inlined strip — and this change converted it. There is no
 * deferred site and no adjudicated opt-out; the strip that is NOT converted, `WorldDowntimeTabs`,
 * writes none of these classes and is held by the role clause below instead.
 */
const RAW_BUTTON_ALLOWLIST = Object.freeze([]);

/**
 * A synthetic source with a KNOWN raw-site count, driven through the detector before the corpus
 * clause runs. The corpus cannot supply an anchor: the whole point of a completed conversion is
 * that it contains no positive case, so a broken detector and a converged tree read identically.
 *
 * It carries the three shapes that have produced false counts in this repository: the token in
 * DOCBLOCK PROSE, the token in a scoped `<style>` rule, and a LONGER class the token is a prefix
 * of — here `manager-editor-tab-button-row`, which is not a shipped class and is present precisely
 * so the trailing lookahead is exercised.
 */
const DETECTOR_FIXTURE = [
  '<!--',
  '  Prose mentioning manager-editor-tab-button, which is how a strip documents itself.',
  '-->',
  '<script>',
  "  import EditorTabs from './EditorTabs.svelte';",
  '</script>',
  '',
  '<button class="manager-editor-tab-button">a hand-rolled tab that still looks converted</button>',
  '<button class="manager-editor-tab-button is-active">a second one, mid-list</button>',
  '<div class="manager-editor-tab-button-row">a longer class the token is a PREFIX of</div>',
  '<div class="manager-editor-tabs">the CONTAINER, which is a different class</div>',
  '<EditorTabs buttonClass="manager-editor-tab-button">the converted shape</EditorTabs>',
  '',
  '<style>',
  '  .manager-editor-tab-button { color: red; }',
  '</style>',
].join('\n');

definePrimitiveAdoptionContract({
  label: 'manager-editor-tab-button',
  tag: 'EditorTabs',
  primitive: PRIMITIVE,
  contractClass: 'manager-editor-tab-button',
  allowlist: RAW_BUTTON_ALLOWLIST,
  // 10 call sites in 10 components as this lands. 7 is a real floor with headroom: deleting an
  // editor must not red this, and losing a third of them must.
  callSiteFloor: 7,
  fileFloor: 7,
  detectorFixture: {
    source: DETECTOR_FIXTURE,
    expected: 2,
    lowered: [
      '<button class="manager-editor-tab-button">',
      '<button class="manager-tab-pill">',
    ],
    loweredExpected: 1,
  },
  // `activePanelOnly` and `danger` are declared `= false` props, so `<EditorTabs danger>` sets a
  // boolean rather than smuggling a `data-*` hook through the rest spread. The factory reads the
  // primitive's own source and refuses a name it does not declare with a `false` default.
  booleanProps: Object.freeze(['activePanelOnly', 'danger']),
  rawRemedy:
    'these components hand-roll the tab button that ' +
    'src/ui/svelte/apps/manager/EditorTabs.svelte owns. Render `<EditorTabs>` instead — the ' +
    'button and panel id stems, the per-button `data-*` hook, the container and button classes ' +
    'and the strip`s accessible name are all props, so no converted site changes a rendered id, ' +
    '`aria-controls`, attribute name or class. A mark the caller cannot express is a MISSING ' +
    'CAPABILITY on the primitive, never a licence for a second strip',
  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread, where a bare `data-vocabulary-tab` arrives as the boolean `true` and renders ' +
    '`="true"`. Presence selectors resolve either way, which is why the View Lab steps and smoke ' +
    'locators that use them would not have caught it',
});

/**
 * Every raw element under `apps/manager/` carrying `role="tablist"`, with its file.
 *
 * Parsed rather than grepped, on the same rule the factory records: `role="tablist"` appears in
 * DOCBLOCK PROSE in four components in this corpus and inside a test-facing comment in more, and
 * a text scan reports every one of those as a hand-rolled strip.
 *
 * @returns {string[]} repo-relative paths, one entry per raw tablist element
 */
function rawManagerTablists() {
  const found = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    if (!file.startsWith(MANAGER_DIRECTORY)) continue;
    walkTemplate(parse(source, { modern: true, filename: join(repoRoot, file) }).fragment, (node) => {
      if (node.type === 'Component') return;
      const role = (node.attributes ?? []).find(
        (attribute) => attribute.type === 'Attribute' && attribute.name === 'role'
      );
      if (!role) return;
      if (/role=["']tablist["']/.test(source.slice(role.start, role.end))) found.push(file);
    });
  }
  // CODE POINT, never `localeCompare`. This list is compared by EQUALITY against a pinned one,
  // and `scripts/lib/designSystemPrimitives.js` records why that matters: `localeCompare` is
  // locale-dependent, so two machines can order the same set differently and one of them reds a
  // pin the other passes. It also orders `EditorTabs.svelte` after `downtime/…` where code point
  // orders it before, which is how this clause first failed.
  return found.sort(byCodePoint);
}

/**
 * The manager files that may still write a raw `role="tablist"`, and why.
 *
 * PINNED BY EQUALITY rather than as a ceiling: a ceiling permits a net-zero swap, where one strip
 * converts and a new hand-rolled one appears and the count never moves.
 */
const TABLIST_HOSTS = Object.freeze([
  // In CODE-POINT order, matching the walk's own comparator: `E` sorts before `d`.
  //
  // THE primitive. It is the one file that is supposed to write this.
  `${MANAGER_DIRECTORY}EditorTabs.svelte`,
  // CONVERSION PENDING, not a justified divergence. `scripts/lib/designSystemPrimitives.json`
  // carries the re-adjudication: issue 1038 ruled it out led by the 177 lines of scoped `<style>`
  // it owns, and issue 1429 re-read that under the maintainer's ruling and found the load-bearing
  // part of it is a STYLE divergence — bordered, filled, 8px-radius pill buttons instead of the
  // shared underline — which is the one kind of justification the ruling forbids. What survives
  // is a padlock, a visible hover/focus tooltip and a roving-focus fallback, all of which the
  // ruling says the primitive ABSORBS AS CAPABILITIES. Deleting this entry is the goal; widening
  // this list is not.
  `${MANAGER_DIRECTORY}downtime/WorldDowntimeTabs.svelte`,
]);

test('the manager tablist walk is alive, so the clause below is not vacuous', () => {
  const managerFiles = Object.keys(SOURCES).filter((file) => file.startsWith(MANAGER_DIRECTORY));
  assert.ok(
    managerFiles.length > 50,
    `the walk reached ${managerFiles.length} files under ${MANAGER_DIRECTORY}, so it is not walking`
  );
  // The walk must find the PRIMITIVE's own tablist. If it found nothing at all, the equality
  // clause below would be comparing two empty arrays and would pass on a corpus of hand-rolled
  // strips — the exact vacuity the class detector's synthetic fixture exists to rule out, stated
  // here against the one positive case the corpus is guaranteed to keep.
  assert.ok(
    rawManagerTablists().includes(`${MANAGER_DIRECTORY}EditorTabs.svelte`),
    'the walk cannot see `EditorTabs` own `<div role="tablist">`, so it sees no tablist at all'
  );
});

test('no manager component outside the pinned set hand-rolls a role="tablist"', () => {
  assert.deepEqual(
    [...new Set(rawManagerTablists())],
    [...TABLIST_HOSTS],
    'a manager component writes a raw `role="tablist"`. That is a hand-rolled tab strip ' +
      'whatever classes it carries, which is why this clause keys on the ROLE and the class ' +
      'clause above cannot replace it. Render `<EditorTabs>`; a capability it lacks is a prop to ' +
      'add there, never a second strip. Removing an entry from the pinned list is the direction ' +
      'this list should move.'
  );
});

test('every manager tablist element is a div, so no implicit landmark is overridden', () => {
  // Preserved from `TagsCategoriesView`, which recorded it before issue 1429 moved its strip:
  // `role="tablist"` on a `<nav>` overrides the implicit `navigation` landmark and the compiler
  // reports it, while a `<div>` has no implicit role to conflict with. The reasoning outlived the
  // file that stated it because `EditorTabs` renders the same host, and it is asserted here so
  // the primitive cannot quietly change host and take every caller with it.
  const hosts = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    if (!file.startsWith(MANAGER_DIRECTORY)) continue;
    walkTemplate(parse(source, { modern: true, filename: join(repoRoot, file) }).fragment, (node) => {
      if (node.type === 'Component') return;
      const role = (node.attributes ?? []).find(
        (attribute) => attribute.type === 'Attribute' && attribute.name === 'role'
      );
      if (!role) return;
      if (/role=["']tablist["']/.test(source.slice(role.start, role.end))) {
        hosts.push(`${file} <${node.name}>`);
      }
    });
  }
  assert.ok(hosts.length > 0, 'no tablist host was found, so this clause has no domain');
  assert.deepEqual(
    hosts.filter((host) => !host.endsWith('<div>')),
    [],
    'a manager tablist is hosted on an element with an implicit landmark role. `role="tablist"` ' +
      'overrides it, which the Svelte compiler reports and which removes the landmark from the ' +
      'screen structure while looking identical.'
  );
});
