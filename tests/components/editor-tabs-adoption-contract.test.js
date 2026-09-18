/** The END STATE of the manager tab-strip conversion (issue 1429, epic 1357). */
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
const PRIMITIVE = 'src/ui/svelte/components/EditorTabs.svelte';
const MANAGER_DIRECTORY = 'src/ui/svelte/apps/manager/';

/** EMPTY, and the empty array is the claim. */
const RAW_BUTTON_ALLOWLIST = Object.freeze([]);

/** A synthetic source with a KNOWN raw-site count. */
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
  // 10 call sites in 10 components as this lands. 7 is a real floor with headroom.
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
  // `activePanelOnly` and `danger` are declared `= false` props.
  booleanProps: Object.freeze(['activePanelOnly', 'danger']),
  rawRemedy:
    'these components hand-roll the tab button that ' +
    'src/ui/svelte/components/EditorTabs.svelte owns. Render `<EditorTabs>` instead — the ' +
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
 * Every raw element under `apps/manager/` — plus the primitive itself — carrying `role="tablist"`.
 *
 * @returns {{file: string, element: string}[]} one entry per raw tablist element, with the tag
 */
function rawTablistElements() {
  const found = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    if (!file.startsWith(MANAGER_DIRECTORY) && file !== PRIMITIVE) continue;
    walkTemplate(parse(source, { modern: true, filename: join(repoRoot, file) }).fragment, (node) => {
      if (node.type === 'Component') return;
      const role = (node.attributes ?? []).find(
        (attribute) => attribute.type === 'Attribute' && attribute.name === 'role'
      );
      if (!role) return;
      if (/role=["']tablist["']/.test(source.slice(role.start, role.end))) {
        found.push({ file, element: node.name });
      }
    });
  }
  // CODE POINT, never `localeCompare`. This list is compared by EQUALITY against a pinned one,
  // and `scripts/lib/designSystemPrimitives.js` records why that matters: `localeCompare` is
  // locale-dependent, so two machines can order the same set differently and one of them reds a
  // pin the other passes. It also orders `EditorTabs.svelte` after `downtime/…` where code point
  // orders it before, which is how this clause first failed.
  return found.sort((left, right) => byCodePoint(left.file, right.file));
}

/** @returns {string[]} repo-relative paths, one entry per raw tablist element */
function rawManagerTablists() {
  return rawTablistElements().map((entry) => entry.file);
}

/** The manager files that may still write a raw `role="tablist"`, and why. */
const TABLIST_HOSTS = Object.freeze([
  // In CODE-POINT order, matching the walk's own comparator. The order INVERTED at issue 1509:
  `${MANAGER_DIRECTORY}downtime/WorldDowntimeTabs.svelte`,
  // THE primitive. It is the one file that is supposed to write this.
  PRIMITIVE,
]);

test('the manager tablist walk is alive, so the clause below is not vacuous', () => {
  const managerFiles = Object.keys(SOURCES).filter((file) => file.startsWith(MANAGER_DIRECTORY));
  assert.ok(
    managerFiles.length > 50,
    `the walk reached ${managerFiles.length} files under ${MANAGER_DIRECTORY}, so it is not walking`
  );
  // The walk must find the PRIMITIVE's own tablist. If it found nothing at all.
  assert.ok(
    rawManagerTablists().includes(PRIMITIVE),
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
  const hosts = rawTablistElements().map((entry) => `${entry.file} <${entry.element}>`);
  assert.ok(
    hosts.some((host) => host.startsWith(`${PRIMITIVE} `)),
    'the primitive contributes no tablist host, so this clause is not reading the file it guards'
  );
  assert.deepEqual(
    hosts.filter((host) => !host.endsWith('<div>')),
    [],
    'a manager tablist is hosted on an element with an implicit landmark role. `role="tablist"` ' +
      'overrides it, which the Svelte compiler reports and which removes the landmark from the ' +
      'screen structure while looking identical.'
  );
});
