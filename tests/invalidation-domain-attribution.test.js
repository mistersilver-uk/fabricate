/**
 * Every mutation site attributes its invalidation domains (issue 1078 part B1, task A2). Why this
 * is a COUNTING guard rather than a pinned list
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { INVALIDATION_DOMAIN_NAMES } from '../src/systems/invalidationDomains.js';

const repoRoot = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const systemManagerSource = read('src/systems/CraftingSystemManager.js');
const recipeManagerSource = read('src/systems/RecipeManager.js');

/** Source lines with `//` comments and JSDoc lines removed, so prose cannot satisfy a match. */
function codeLines(source) {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\*/.test(line));
}

/**
 * Split a class body into `methodName -> body`, using the two-space indentation every method of
 * these two classes is declared at.
 */
function methodBodies(source) {
  const bodies = new Map();
  let current = null;
  let lines = [];
  for (const line of codeLines(source)) {
    const declaration = /^ {2}(?:async )?(?:get |set )?([_a-zA-Z][\w]*)\s*\(/.exec(line);
    if (declaration) {
      if (current) bodies.set(current, lines.join('\n'));
      current = declaration[1];
      lines = [];
    }
    if (current) lines.push(line);
  }
  if (current) bodies.set(current, lines.join('\n'));
  return bodies;
}

describe('CraftingSystemManager attributes every persistence site', () => {
  const saveSites = codeLines(systemManagerSource).filter((line) => /this\.save\(/.test(line));

  it('found the persistence sites at all', () => {
    // The premise. Without it, a scan that silently matched nothing would make every
    // assertion below pass over an empty set — which is precisely the vacuous shape this
    // programme has shipped five times.
    assert.ok(
      saveSites.length >= 24,
      `expected the whole persistence chokepoint to be scanned, found ${saveSites.length} sites`
    );
  });

  it('names domains at EVERY one of them', () => {
    const unattributed = saveSites.filter((line) => !line.includes('domains:'));
    assert.deepEqual(
      unattributed.map((line) => line.trim()),
      [],
      'a save that names no domains refreshes every store on every client, silently'
    );
  });

  it('names only real domains in its hoisted attributions', () => {
    // The hoisted `*_FACTS` constants are derived through `domainsForSystemFields`, so a typo in a
    // FIELD name falls to the every-domain fail-safe rather than to an unknown domain.
    const quoted = systemManagerSource.match(/domains: \[[^\]]*]/g) ?? [];
    for (const literal of quoted) {
      for (const name of literal.match(/'([^']+)'/g) ?? []) {
        assert.ok(
          INVALIDATION_DOMAIN_NAMES.includes(name.slice(1, -1)),
          `${literal} names ${name}, which is not an invalidation domain`
        );
      }
    }
  });

  it('drains the attribution in the NOTIFIER, never in save()', () => {
    const bodies = methodBodies(systemManagerSource);
    assert.ok(
      !bodies.get('save').includes('emitCraftingDataChanged'),
      'emitting from save() would refresh the app on every path that deliberately saves ' +
        'without announcing'
    );
    assert.ok(bodies.get('_notifySystemsChanged').includes('emitCraftingDataChanged'));
    assert.ok(bodies.get('_notifySystemsChanged').includes('_pendingDomains.drain()'));
  });
});

describe('RecipeManager attributes every map mutation', () => {
  const bodies = methodBodies(recipeManagerSource);
  // The exemptions are NAMED rather than pattern-matched, so widening the set is a diff a reviewer
  // sees.
  const LOAD_ONLY = new Set(['constructor', 'initialize']);
  const mutators = [...bodies].filter(
    ([name, body]) =>
      !LOAD_ONLY.has(name) && /this\.recipes\.(set|delete)\(|this\.recipes = /.test(body)
  );

  it('found the mutating methods at all', () => {
    assert.ok(
      mutators.length >= 6,
      `expected the map mutators to be scanned, found ${mutators.map(([name]) => name).join(', ')}`
    );
  });

  it('attributes domains in every one of them', () => {
    const silent = mutators
      .filter(([, body]) => !/_recordChange\(|_advanceFactScopes\(/.test(body))
      .map(([name]) => name);
    assert.deepEqual(
      silent,
      [],
      'a mutation that attributes nothing leaves the change signal with no scopes, which every ' +
        'consumer answers by reloading everything'
    );
  });

  it('keeps _advanceRecipeRevision reachable from the attributing path', () => {
    // `_recordChange` is the ONE mutation-site call: it advances the entity revisions AND
    // attributes.
    for (const [name, body] of bodies) {
      if (!body.includes('this._advanceRecipeRevision(')) continue;
      if (name === '_recordChange' || LOAD_ONLY.has(name)) continue;
      assert.ok(
        body.includes('_advanceFactScopes('),
        `${name} advances an entity revision without attributing any fact class`
      );
    }
  });

  it('drains the attribution in the NOTIFIER', () => {
    assert.ok(bodies.get('_notifyRecipesChanged').includes('emitCraftingDataChanged'));
    assert.ok(bodies.get('_notifyRecipesChanged').includes('_pendingDomains.drain()'));
    assert.ok(
      !bodies.get('save').includes('emitCraftingDataChanged'),
      'save() records; the notifier announces'
    );
  });
});

describe('the signal stays UNPUBLISHED', () => {
  it('is absent from the published hook contract', () => {
    // `src/config/hooks.js` is the documented integration surface.
    assert.ok(
      !read('src/config/hooks.js').includes('craftingDataChanged'),
      'promoting this hook owes it a three-segment name, a schemaVersion, an entry here and a ' +
        'row in DOMAIN.md'
    );
  });

  it('keeps the four legacy hooks emitting unchanged', () => {
    assert.ok(systemManagerSource.includes("'fabricate.craftingSystemsChanged'"));
    assert.ok(recipeManagerSource.includes("'fabricate.recipesChanged'"));
  });
});
