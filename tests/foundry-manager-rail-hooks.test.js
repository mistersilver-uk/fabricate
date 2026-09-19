/** The Foundry smoke harness and the manager rail, held in lockstep IN CI (issue 1362). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  MANAGER_SYSTEM_RAIL_ENTRIES,
  MANAGER_WORLD_SCOPED_RAIL_ENTRIES,
  railSelector,
} from '../scripts/lib/managerRailEntries.js';
import { collectWorkingTreeSources } from './helpers/sourceScan.js';
import { SMOKE_SOURCE } from './helpers/interactablesSmokeLocators.js';

const ROOT = resolve(import.meta.dirname, '..');
// Read as TEXT. `foundry-test-run.mjs` launches Chromium on import, so a suite that imported it
// would start the whole smoke run inside `node --test`.
const harness = SMOKE_SOURCE;

const RAIL_BUTTON_CLASS = 'manager-nav-button';
const RAIL_ENTRIES = [...MANAGER_SYSTEM_RAIL_ENTRIES, ...MANAGER_WORLD_SCOPED_RAIL_ENTRIES];

/** The components that RENDER the manager rail. */
const railSources = Object.entries(
  collectWorkingTreeSources(['src'], ['.js', '.svelte'])
).filter(([, text]) => text.includes(RAIL_BUTTON_CLASS));

test('the rail entry table is non-trivial and internally consistent', () => {
  // NON-VACUITY FIRST. Every assertion below iterates this table, so an empty or truncated one
  // would make all three pass while proving nothing.
  assert.ok(RAIL_ENTRIES.length >= 13, `only ${RAIL_ENTRIES.length} rail entries are declared`);
  const ids = RAIL_ENTRIES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'a rail entry id is declared twice');
  assert.ok(railSources.length > 0, `nothing in src renders "${RAIL_BUTTON_CLASS}" any more`);

  // AND THE DUPLICATE LABEL IS EXPECTED, not an accident.
  const labels = RAIL_ENTRIES.map((entry) => entry.label);
  const duplicated = labels.filter((label, index) => labels.indexOf(label) !== index);
  assert.deepEqual(
    duplicated,
    ['Tags & Categories'],
    'the rail carries exactly one label in two scopes; a second duplicate needs a decision'
  );
});

test('no `:has-text` locator is applied to a manager rail button in the harness', () => {
  // Every locator string in the harness that names a rail class AND a text match.
  const offending = [];
  for (const match of harness.matchAll(/'([^'\n]*manager-nav-[^'\n]*)'/g)) {
    if (match[1].includes(':has-text(')) offending.push(match[1]);
  }
  for (const match of harness.matchAll(/`([^`\n]*manager-nav-[^`\n]*)`/g)) {
    if (match[1].includes(':has-text(')) offending.push(match[1]);
  }
  assert.deepEqual(
    offending,
    [],
    'these harness locators identify a rail entry by its visible text, which no longer ' +
      'identifies one: `Tools` is a substring of `Tools Catalogue` and `Tags & Categories` is ' +
      'an exact duplicate across the two rail scopes. Use `railSelector(<id>)`:\n  ' +
      offending.join('\n  ')
  );
});

test('the harness targets rail entries by id, and every id it targets is rendered', () => {
  // NON-VACUITY: the harness really does drive the rail through this seam.
  const uses = [...harness.matchAll(/railSelector\(\s*'([a-z0-9-]+)'\s*\)/g)].map(
    (match) => match[1]
  );
  assert.ok(
    uses.length >= 10,
    `the harness resolves only ${uses.length} rail entries through railSelector(); the ` +
      'migration is probably incomplete'
  );

  const declared = new Set(RAIL_ENTRIES.map((entry) => entry.id));
  const unknown = [...new Set(uses)].filter((id) => !declared.has(id)).sort();
  assert.deepEqual(unknown, [], `the harness targets rail ids the table does not declare`);

  const unrendered = RAIL_ENTRIES.filter(
    (entry) => !railSources.some(([, text]) => text.includes(entry.id))
  ).map((entry) => entry.id);
  assert.deepEqual(
    unrendered,
    [],
    'these rail ids are targeted by the harness but rendered by no component that renders ' +
      `"${RAIL_BUTTON_CLASS}", so the smoke would time out on them:\n  ` + unrendered.join('\n  ')
  );
});

/** How far after a rail id's occurrence its own label is allowed to be authored. */
const LABEL_WINDOW = 900;

/**
 * Whether one entry's label is authored NEXT TO its id, as a complete quoted literal.
 *
 * @param {string} text One rail-rendering component's source.
 */
function authorsLabelBesideId(text, entry) {
  const needle = `'${entry.label}'`;
  let index = text.indexOf(entry.id);
  while (index !== -1) {
    if (text.slice(index, index + LABEL_WINDOW).includes(needle)) return true;
    index = text.indexOf(entry.id, index + 1);
  }
  return false;
}

test('every label in the membership loop is authored beside its own rail id', () => {
  // The id proves the entry is THERE; the label proves it still SAYS what it is meant to say.
  const missing = RAIL_ENTRIES.filter(
    (entry) => !railSources.some(([, text]) => authorsLabelBesideId(text, entry))
  ).map((entry) => `${entry.id} ("${entry.label}")`);
  assert.deepEqual(
    missing,
    [],
    'these rail entries do not author their declared label beside their own id in any ' +
      'component that renders the rail, so the smoke would fail its membership assertion:\n  ' +
      missing.join('\n  ')
  );
});

test('railSelector scopes to the manager window', () => {
  // A bare `#id` would match the same id in any other open Foundry application.
  assert.equal(railSelector('manager-nav-tags'), '.fabricate-manager #manager-nav-tags');
  assert.ok(harness.includes("from './lib/managerRailEntries.js'"));
});
