import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let GatheringEconomyView;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, { filename: sourcePath, generate: 'client', dev: true, css: 'injected' });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function makeServices(initialEconomy, actors = []) {
  const calls = { setEconomy: [], setStamina: [], adjustStamina: [], roll: [], getStamina: 0 };
  let economy = initialEconomy;
  const services = {
    getGatheringEconomy: () => economy,
    setGatheringEconomy: (opts) => { calls.setEconomy.push(opts); economy = opts.economy; return Promise.resolve(opts.economy); },
    getGatheringStaminaState: () => { calls.getStamina += 1; return actors; },
    setGatheringStamina: (opts) => { calls.setStamina.push(opts); return Promise.resolve({}); },
    adjustGatheringStamina: (opts) => { calls.adjustStamina.push(opts); return Promise.resolve({}); },
    rollGatheringStamina: (opts) => { calls.roll.push(opts); return Promise.resolve({}); }
  };
  return { services, calls };
}

async function mountView(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringEconomyView, { target, props });
  flushSync();
  await tick();
  flushSync();
}

describe('GatheringEconomyView (GM economy panel) mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = { i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } };

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-economy-view-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    const util = join(tempRoot, 'src/ui/svelte/util/foundryBridge.js');
    mkdirSync(dirname(util), { recursive: true });
    writeFileSync(util, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/foundryBridge.js'), 'utf8'));

    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringEconomyView.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte.js')).href);
    GatheringEconomyView = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('shows three modes and marks the active one from the loaded economy', async () => {
    const { services } = makeServices({ mode: 'none', stamina: { regen: { policy: 'none' } } });
    await mountView({ services, systemId: 'sys-1' });
    const options = target.querySelectorAll('[data-economy-mode-option]');
    assert.equal(options.length, 3);
    const active = target.querySelector('[data-economy-mode-option].is-active');
    assert.equal(active.getAttribute('data-economy-mode-option'), 'none');
    unmount(mounted); mounted = null; target.remove();
  });

  it('persists a mode change and reveals regen + actor controls in stamina mode', async () => {
    const actors = [{ actorId: 'a1', name: 'Aria', img: '', current: 3, max: 10, provider: 'fabricate' }];
    const { services, calls } = makeServices({ mode: 'stamina', stamina: { regen: { policy: 'elapsedTime', unit: 'hours', amount: '2' } } }, actors);
    await mountView({ services, systemId: 'sys-1' });

    // Stamina mode reveals the regen card and the actor list.
    assert.ok(target.querySelector('[data-economy-regen-card]'));
    const amountInput = target.querySelector('[data-economy-regen-amount]');
    assert.ok(amountInput);
    assert.equal(amountInput.getAttribute('type'), 'text'); // single number-or-formula expression
    assert.equal(target.querySelector('[data-economy-regen-formula]'), null); // separate formula field removed
    assert.equal(target.querySelectorAll('[data-economy-actor-id]').length, 1);

    // The amount field accepts a formula expression and persists it verbatim.
    amountInput.value = '1 + @abilities.con.mod';
    amountInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.stamina.regen.amount, '1 + @abilities.con.mod');

    // Max + starting stamina are expression text fields that persist verbatim.
    const maxInput = target.querySelector('[data-economy-stamina-max]');
    assert.ok(maxInput);
    assert.equal(maxInput.getAttribute('type'), 'text');
    maxInput.value = '4 * @abilities.con.mod';
    maxInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.stamina.max, '4 * @abilities.con.mod');

    const startInput = target.querySelector('[data-economy-stamina-start]');
    assert.ok(startInput);
    startInput.value = '@abilities.con.mod';
    startInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.stamina.start, '@abilities.con.mod');

    // The per-character Roll button (re)rolls that character's pool.
    target.querySelector('[data-economy-actor-id="a1"] [data-economy-actor-roll]').click();
    flushSync();
    assert.equal(calls.roll.at(-1).actorId, 'a1');
    assert.equal(calls.roll.at(-1).systemId, 'sys-1');

    // Switching mode calls setGatheringEconomy with the new mode.
    target.querySelector('[data-economy-mode-option="nodes"]').click();
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.mode, 'nodes');
    unmount(mounted); mounted = null; target.remove();
  });

  it('saves an actor stamina pool through the services', async () => {
    const actors = [{ actorId: 'a1', name: 'Aria', img: '', current: 3, max: 10, provider: 'fabricate' }];
    const { services, calls } = makeServices({ mode: 'stamina', stamina: { regen: { policy: 'none' } } }, actors);
    await mountView({ services, systemId: 'sys-1' });

    target.querySelector('[data-economy-actor-id="a1"] .manager-economy-actor-save').click();
    flushSync();
    assert.equal(calls.setStamina.at(-1).actorId, 'a1');
    assert.equal(calls.setStamina.at(-1).systemId, 'sys-1');
    // The row carries a Roll control and a Save, but no +/- adjust buttons.
    assert.ok(target.querySelector('[data-economy-actor-id="a1"] [data-economy-actor-roll]'));
    assert.equal(target.querySelector('[data-economy-actor-id="a1"] [aria-label^="Decrease"]'), null);
    unmount(mounted); mounted = null; target.remove();
  });

  it('filters the character list by the search box', async () => {
    const actors = [
      { actorId: 'a1', name: 'Aria', img: '', current: 1, max: 5, provider: 'fabricate' },
      { actorId: 'a2', name: 'Borin', img: '', current: 2, max: 8, provider: 'fabricate' }
    ];
    const { services } = makeServices({ mode: 'stamina', stamina: { regen: { policy: 'none' } } }, actors);
    await mountView({ services, systemId: 'sys-1' });
    assert.equal(target.querySelectorAll('[data-economy-actor-id]').length, 2);

    const search = target.querySelector('[data-economy-actor-search]');
    search.value = 'bor';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    const rows = target.querySelectorAll('[data-economy-actor-id]');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].getAttribute('data-economy-actor-id'), 'a2');
    unmount(mounted); mounted = null; target.remove();
  });
});
