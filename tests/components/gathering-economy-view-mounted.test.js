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
    writeCompiledSvelte('src/ui/svelte/apps/manager/ResolutionModeCard.svelte');
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

  it('shows two toggle pills; neither active = no limit (with an empty-state hint)', async () => {
    const { services } = makeServices({ stamina: { enabled: false, regen: { policy: 'none' } }, nodes: { enabled: false } });
    await mountView({ services, systemId: 'sys-1' });
    const options = target.querySelectorAll('[data-economy-mode-option]');
    assert.equal(options.length, 2); // stamina + nodes only — no explicit "none"
    const values = Array.from(options).map(o => o.getAttribute('data-economy-mode-option')).sort();
    assert.deepEqual(values, ['nodes', 'stamina']);
    // No pill active and the muted no-limit hint is shown.
    assert.equal(target.querySelector('[data-economy-mode-option].is-active'), null);
    options.forEach(o => assert.equal(o.getAttribute('aria-pressed'), 'false'));
    assert.ok(target.querySelector('[data-economy-no-limit-hint]'));
    unmount(mounted); mounted = null; target.remove();
  });

  it('renders a gathering resolution-mode card above limitation mode (d100 live, others coming soon)', async () => {
    const { services, calls } = makeServices({ stamina: { enabled: false, regen: { policy: 'none' } }, nodes: { enabled: false } });
    await mountView({ services, systemId: 'sys-1' });

    const resolutionCard = target.querySelector('[data-gathering-resolution-mode]');
    assert.ok(resolutionCard, 'gathering resolution-mode card should render');

    // The resolution card renders BEFORE the limitation-mode card in document order.
    const limitationCard = target.querySelector('[data-economy-mode-card]');
    assert.ok(limitationCard, 'limitation mode card should render');
    assert.equal(
      resolutionCard.compareDocumentPosition(limitationCard) & Node.DOCUMENT_POSITION_FOLLOWING,
      Node.DOCUMENT_POSITION_FOLLOWING,
      'the resolution card precedes the limitation card'
    );

    const rows = [...resolutionCard.querySelectorAll('[data-gathering-resolution-mode-option]')];
    assert.deepEqual(
      rows.map(row => row.getAttribute('data-gathering-resolution-mode-option')),
      ['d100', 'progressive', 'routed'],
      'gathering card lists d100, progressive, routed in order'
    );

    const radioFor = (value) => resolutionCard.querySelector(`[data-gathering-resolution-mode-option="${value}"] input[type="radio"]`);
    assert.equal(radioFor('d100').disabled, false, 'd100 is selectable');
    assert.equal(radioFor('progressive').disabled, true, 'progressive is disabled (coming soon)');
    assert.equal(radioFor('routed').disabled, true, 'routed is disabled (coming soon)');

    // Clicking a disabled option persists nothing.
    const before = calls.setEconomy.length;
    radioFor('progressive').click();
    flushSync();
    assert.equal(calls.setEconomy.length, before, 'clicking a disabled option pushes no setEconomy call');

    // Selecting d100 round-trips resolutionMode === 'd100'.
    const d100 = radioFor('d100');
    d100.checked = true;
    d100.dispatchEvent(new window.Event('change', { bubbles: true }));
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.resolutionMode, 'd100', 'selecting d100 persists resolutionMode d100');
    unmount(mounted); mounted = null; target.remove();
  });

  it('marks both pills active when both flags are on (anti-dogpiling combination)', async () => {
    const { services } = makeServices({ stamina: { enabled: true, regen: { policy: 'none' } }, nodes: { enabled: true } });
    await mountView({ services, systemId: 'sys-1' });
    const stamina = target.querySelector('[data-economy-mode-option="stamina"]');
    const nodes = target.querySelector('[data-economy-mode-option="nodes"]');
    assert.ok(stamina.classList.contains('is-active'));
    assert.ok(nodes.classList.contains('is-active'));
    assert.equal(stamina.getAttribute('aria-pressed'), 'true');
    assert.equal(nodes.getAttribute('aria-pressed'), 'true');
    // Both sub-blocks render at once.
    assert.ok(target.querySelector('[data-economy-regen-card]'));
    assert.ok(target.querySelector('[data-economy-nodes-note]'));
    // No empty-state hint when at least one is on.
    assert.equal(target.querySelector('[data-economy-no-limit-hint]'), null);
    unmount(mounted); mounted = null; target.remove();
  });

  it('toggles each flag independently and persists via setStamina/setNodes', async () => {
    const { services, calls } = makeServices({ stamina: { enabled: false, regen: { policy: 'none' } }, nodes: { enabled: false } });
    await mountView({ services, systemId: 'sys-1' });

    // Turn stamina on: persists stamina.enabled = true, nodes still off.
    target.querySelector('[data-economy-mode-option="stamina"]').click();
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.stamina.enabled, true);
    assert.equal(calls.setEconomy.at(-1).economy.nodes.enabled, false);

    // Turn nodes on too: both now enabled.
    target.querySelector('[data-economy-mode-option="nodes"]').click();
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.stamina.enabled, true);
    assert.equal(calls.setEconomy.at(-1).economy.nodes.enabled, true);

    // Toggle stamina back off: nodes stays on (independent toggles).
    target.querySelector('[data-economy-mode-option="stamina"]').click();
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.stamina.enabled, false);
    assert.equal(calls.setEconomy.at(-1).economy.nodes.enabled, true);
    // No legacy `mode` key is ever written.
    assert.equal('mode' in calls.setEconomy.at(-1).economy, false);
    unmount(mounted); mounted = null; target.remove();
  });

  it('persists config edits and reveals regen + actor controls when stamina is enabled', async () => {
    const actors = [{ actorId: 'a1', name: 'Aria', img: '', current: 3, max: 10, rolledMax: 10, maxOverride: null, maxReadOnly: false }];
    const { services, calls } = makeServices({ stamina: { enabled: true, regen: { policy: 'overTime', unit: 'hours', amount: '2' } }, nodes: { enabled: false } }, actors);
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

    // Enabling the nodes pill (with stamina still on) persists both flags on.
    target.querySelector('[data-economy-mode-option="nodes"]').click();
    flushSync();
    assert.equal(calls.setEconomy.at(-1).economy.nodes.enabled, true);
    assert.equal(calls.setEconomy.at(-1).economy.stamina.enabled, true);
    unmount(mounted); mounted = null; target.remove();
  });

  it('bulk-saves rolled characters (current + max override) from the header Save', async () => {
    const actors = [
      { actorId: 'a1', name: 'Aria', img: '', current: 3, max: 10, rolledMax: 10, maxOverride: null, maxReadOnly: false },
      { actorId: 'a2', name: 'Borin', img: '', current: null, max: null, rolledMax: null, maxOverride: null, maxReadOnly: false } // un-rolled
    ];
    const { services, calls } = makeServices({ stamina: { enabled: true, regen: { policy: 'none' } }, nodes: { enabled: false } }, actors);
    await mountView({ services, systemId: 'sys-1' });

    // Set an override on the rolled character, then bulk-save from the header.
    const override = target.querySelector('[data-economy-actor-id="a1"] [data-economy-actor-max]');
    // With no override set, the placeholder shows the base (rolled) max so the GM
    // sees the value they would be overriding.
    assert.equal(override.getAttribute('placeholder'), '10', 'max-override placeholder shows the un-overridden rolled max');
    override.value = '15';
    override.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    target.querySelector('[data-economy-bulk-save]').click();
    flushSync();
    // Only the rolled character is persisted; the un-rolled one is skipped.
    assert.equal(calls.setStamina.length, 1);
    assert.equal(calls.setStamina[0].actorId, 'a1');
    assert.equal(calls.setStamina[0].maxOverride, 15);
    assert.equal(calls.setStamina[0].current, 3);
    // No per-row save buttons remain.
    assert.equal(target.querySelector('[data-economy-actor-id="a1"] .manager-economy-actor-save'), null);
    unmount(mounted); mounted = null; target.remove();
  });

  it('disables the max-override cell for a rolled character whose max is read-only', async () => {
    const actors = [
      { actorId: 'a1', name: 'Aria', img: '', current: 6, max: 10, rolledMax: 10, maxOverride: null, maxReadOnly: true }, // rolled, read-only max
      { actorId: 'a2', name: 'Borin', img: '', current: 4, max: 8, rolledMax: 8, maxOverride: null, maxReadOnly: false } // rolled, writable max
    ];
    const { services } = makeServices({ stamina: { enabled: true, regen: { policy: 'none' } }, nodes: { enabled: false } }, actors);
    await mountView({ services, systemId: 'sys-1' });

    const readOnlyMax = target.querySelector('[data-economy-actor-id="a1"] [data-economy-actor-max]');
    assert.equal(readOnlyMax.disabled, true, 'read-only max-override cell is disabled');
    const writableMax = target.querySelector('[data-economy-actor-id="a2"] [data-economy-actor-max]');
    assert.equal(writableMax.disabled, false, 'writable max-override cell is enabled');
    unmount(mounted); mounted = null; target.remove();
  });

  it('shows un-rolled characters as disabled with an emphasised dice button; rolled get a reset button', async () => {
    const actors = [
      { actorId: 'a1', name: 'Aria', img: '', current: 6, max: 10, rolledMax: 10, maxOverride: null, maxReadOnly: false }, // rolled
      { actorId: 'a2', name: 'Borin', img: '', current: null, max: null, rolledMax: null, maxOverride: null, maxReadOnly: false } // un-rolled
    ];
    const { services } = makeServices({ stamina: { enabled: true, regen: { policy: 'none' } }, nodes: { enabled: false } }, actors);
    await mountView({ services, systemId: 'sys-1' });

    // Un-rolled: inputs disabled, dice button emphasised.
    const unrolledCurrent = target.querySelector('[data-economy-actor-id="a2"] [data-economy-actor-current]');
    assert.equal(unrolledCurrent.disabled, true);
    const unrolledRoll = target.querySelector('[data-economy-actor-id="a2"] [data-economy-actor-roll]');
    assert.ok(unrolledRoll.classList.contains('is-roll-needed'));
    assert.ok(unrolledRoll.querySelector('.fa-dice-d20'));

    // Rolled: inputs enabled, the button is a reset (arrows-rotate), not emphasised.
    const rolledCurrent = target.querySelector('[data-economy-actor-id="a1"] [data-economy-actor-current]');
    assert.equal(rolledCurrent.disabled, false);
    const rolledRoll = target.querySelector('[data-economy-actor-id="a1"] [data-economy-actor-roll]');
    assert.equal(rolledRoll.classList.contains('is-roll-needed'), false);
    assert.ok(rolledRoll.querySelector('.fa-arrows-rotate'));
    unmount(mounted); mounted = null; target.remove();
  });

  it('filters the character list by the search box', async () => {
    const actors = [
      { actorId: 'a1', name: 'Aria', img: '', current: 1, max: 5, rolledMax: 5, maxOverride: null, maxReadOnly: false },
      { actorId: 'a2', name: 'Borin', img: '', current: 2, max: 8, rolledMax: 8, maxOverride: null, maxReadOnly: false }
    ];
    const { services } = makeServices({ stamina: { enabled: true, regen: { policy: 'none' } }, nodes: { enabled: false } }, actors);
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
