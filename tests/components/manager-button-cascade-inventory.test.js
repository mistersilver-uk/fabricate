/**
 * The button family's cascade inventory, re-taken after issue 2540 retired the primitive token.
 * Every carrier of the root now matches the tripled root's rung, so a rule that names the root
 * fewer times and states the same properties can be shadowed on every element it reaches. Each
 * resting (or hovered) rule member naming the root is drawn on the markup its own selector builds,
 * in Chromium, and must win the cascade for at least one longhand it declares: a member winning
 * none is dead, and is deleted rather than kept as a second copy of the primitive's rung.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import {
  ROOT,
  cascadeMembers,
  isProbeable,
  namesRoot,
  openCascadePage,
  probeMembers,
} from '../helpers/buttonCascadeProbe.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** Every `.svelte` under `src/` whose own style block names the root. */
function scopedBlocksNamingRoot(directory = 'src') {
  return readdirSync(join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return scopedBlocksNamingRoot(child);
    if (!entry.name.endsWith('.svelte')) return [];
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(
      readFileSync(join(repoRoot, child), 'utf8')
    );
    return style && namesRoot(style[1]) ? [child] : [];
  });
}

let browser;
let results;

before(async () => {
  browser = await chromium.launch();
  const page = await openCascadePage(browser, scopedBlocksNamingRoot());
  const targets = (await cascadeMembers(page))
    .filter(({ bare }) => namesRoot(bare) && isProbeable(bare))
    .map(({ order, member }) => ({ order, member, carrier: ROOT }));
  results = await probeMembers(page, targets);
});

after(async () => browser?.close());

test('the inventory reaches the family, so its verdict is not vacuous', () => {
  assert.ok(results.length >= 110, `only ${results.length} button-family members were drawn`);
  const unmatched = results.filter(({ matched }) => !matched).map(({ member }) => member);
  assert.deepEqual(unmatched, [], 'each member must match the markup its selector builds');
});

test('no button-family rule is shadowed dead by a rule winning every property it states', () => {
  const dead = results
    .filter(({ longhands }) => longhands.length > 0 && longhands.every(({ wins }) => !wins))
    .map(
      ({ member, longhands }) =>
        `${member} — lost to ${[...new Set(longhands.map(({ winner }) => winner))].join(' | ')}`
    );
  assert.deepEqual(dead, [], 'delete a rule the primitive rung always beats');
});
