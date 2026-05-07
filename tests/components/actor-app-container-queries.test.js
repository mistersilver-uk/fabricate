import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const headerSrc = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/ActorCraftingHeader.svelte'),
  'utf8'
);
const rootSrc = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/CraftingAppRoot.svelte'),
  'utf8'
);
const cssSrc = readFileSync(
  resolve(__dirname, '../../styles/fabricate.css'),
  'utf8'
);

test('ActorCraftingHeader uses container queries, not viewport @media', () => {
  assert.ok(
    !headerSrc.match(/@media\s*\(/),
    'ActorCraftingHeader scoped <style> must not contain viewport @media queries'
  );
  assert.ok(
    headerSrc.includes('@container actor-app'),
    'ActorCraftingHeader scoped <style> must use @container actor-app queries'
  );
});

test('CraftingAppRoot scoped style does not use viewport @media', () => {
  // Extract scoped <style> content only — Svelte components routinely embed
  // sample markup or comments referencing @media, but the actor-app shell's
  // own scoped CSS must not.
  const styleMatch = rootSrc.match(/<style>([\s\S]*?)<\/style>/);
  if (!styleMatch) return;
  const scoped = styleMatch[1];
  assert.ok(
    !scoped.match(/@media\s*\(/),
    'CraftingAppRoot scoped <style> must not contain viewport @media queries'
  );
});

test('global .fabricate-actor-app declares the named container', () => {
  const match = cssSrc.match(/\.fabricate-actor-app\s*\{[\s\S]*?\}/);
  assert.ok(match, '.fabricate-actor-app block should exist in fabricate.css');
  const block = match[0];
  assert.ok(block.includes('container-type: inline-size'), 'must declare container-type: inline-size');
  assert.ok(block.includes('container-name: actor-app'), 'must declare container-name: actor-app');
});

test('CraftingAppRoot tab bar uses --fab-* tokens, not legacy --fabricate-*', () => {
  const styleMatch = rootSrc.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch, 'CraftingAppRoot must have a scoped <style> block');
  const scoped = styleMatch[1];
  assert.ok(
    !scoped.includes('--fabricate-primary'),
    'CraftingAppRoot scoped CSS must migrate off --fabricate-primary'
  );
  assert.ok(
    scoped.includes('--fab-accent'),
    'CraftingAppRoot scoped CSS must use --fab-accent for the active tab'
  );
});
