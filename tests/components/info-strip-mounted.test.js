/** `InfoStrip` mounted (issue 1521): the read-only strip of current values and its one name. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { fill } from '../../src/utils/fillPlaceholders.js';
import { shippedLocalize } from '../helpers/checkEvidenceFixtures.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  CHECK_CARD_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const STRIP = 'src/ui/svelte/components/InfoStrip.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-info-strip-',
  compiledModules: [
    'src/ui/svelte/components/Kicker.svelte',
    'src/ui/svelte/components/Chip.svelte',
    STRIP,
  ],
  componentPath: STRIP,
  rootClass: 'fabricate fabricate-app',
});

const FACTS = [
  { icon: 'fas fa-bullseye', value: 'DC 15', props: { 'data-fact-dc': '' } },
  { icon: 'fas fa-dice-d20', label: 'Roll', value: '1d20 + 2', props: { title: '1d20 + @prof' } },
];

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex], [contenteditable]';

const stripIn = (root) => root.querySelector('.fabricate-info-strip');

/** The element an `aria-labelledby` names, read the way an accessibility tree reads it. */
const labelOf = (element) =>
  globalThis.document.querySelector(`[id="${element.getAttribute('aria-labelledby')}"]`);

describe('InfoStrip', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('is a group named by its kicker, whatever other name it is handed', async () => {
    const root = await harness.mount({
      label: 'Crafting check',
      facts: FACTS,
      ariaLabelledBy: 'elsewhere',
      ariaLabel: 'Ignored',
    });
    const strip = stripIn(root);
    assert.equal(strip.getAttribute('role'), 'group');
    const kicker = strip.querySelector(':scope .fabricate-info-strip-head .fab-kicker');
    assert.equal(kicker.textContent, 'Crafting check');
    const named = labelOf(strip);
    assert.ok(named?.contains(kicker), 'the kicker names the group');
    assert.equal(named.textContent, 'Crafting check', 'and nothing else does');
    assert.ok(!strip.hasAttribute('aria-label'), 'one naming route, never two');
  });

  it('is named by ariaLabelledBy when no kicker is drawn', async () => {
    const root = await harness.mount({ facts: FACTS, ariaLabelledBy: 'outer', ariaLabel: 'X' });
    const strip = stripIn(root);
    assert.equal(strip.getAttribute('aria-labelledby'), 'outer');
    assert.ok(!strip.hasAttribute('aria-label'), 'one naming route, never two');
    assert.ok(!strip.querySelector('.fabricate-info-strip-head'), 'no head without a kicker');
  });

  it('is named by ariaLabel when it has neither a kicker nor ariaLabelledBy', async () => {
    const root = await harness.mount({ facts: FACTS, ariaLabel: 'Stamina' });
    const strip = stripIn(root);
    assert.equal(strip.getAttribute('aria-label'), 'Stamina');
    assert.ok(!strip.hasAttribute('aria-labelledby'));
  });

  it('draws each fact as a decorative glyph, its optional label and its value, with its props', async () => {
    const root = await harness.mount({ label: 'Check', facts: FACTS });
    const facts = [...stripIn(root).querySelectorAll('.fabricate-info-strip-fact')];
    assert.equal(facts.length, 2);
    for (const [index, fact] of facts.entries()) {
      const glyph = fact.querySelector(':scope > i');
      assert.ok(glyph.classList.contains(FACTS[index].icon.split(' ', 2)[1]));
      assert.equal(glyph.getAttribute('aria-hidden'), 'true', 'the glyph is decorative');
      assert.equal(
        fact.querySelector('.fabricate-info-strip-value').textContent,
        FACTS[index].value
      );
    }
    assert.equal(facts[0].getAttribute('data-fact-dc'), '', 'a hook rides its fact');
    assert.ok(!facts[0].querySelector('.fabricate-info-strip-label'), 'no label line unpassed');
    assert.equal(facts[1].querySelector('.fabricate-info-strip-label').textContent, 'Roll');
    assert.equal(facts[1].getAttribute('title'), '1d20 + @prof', 'a title rides its fact');
  });

  it('keeps the fact class when its props carry one', async () => {
    const root = await harness.mount({
      ariaLabel: 'X',
      facts: [{ icon: '', value: '4', props: { class: 'stray' } }],
    });
    const fact = stripIn(root).querySelector(':scope .fabricate-info-strip-facts > span');
    assert.equal(fact.className.split(' ', 1)[0], 'fabricate-info-strip-fact');
    assert.ok(!fact.querySelector('i'), 'no glyph element for an unset icon');
  });

  it('draws its badge as a read-only chip in the badge tone', async () => {
    const root = await harness.mount({
      label: 'Check',
      badge: { label: 'Required', tone: 'info' },
      facts: FACTS,
    });
    const chip = stripIn(root).querySelector(':scope .fabricate-info-strip-head > .manager-chip');
    assert.equal(chip.tagName, 'SPAN');
    assert.equal(chip.textContent, 'Required');
    assert.ok(chip.classList.contains('is-info'));
  });

  it('holds nothing focusable, however full it is', async () => {
    const root = await harness.mount({
      label: 'Check',
      badge: { label: 'Optional', tone: 'neutral' },
      facts: FACTS,
    });
    const strip = stripIn(root);
    assert.equal(strip.querySelectorAll('.fabricate-info-strip-fact').length, 2, 'populated');
    assert.equal(strip.querySelectorAll(FOCUSABLE).length, 0, 'no focusable descendant');
  });

  it('draws no facts wrapper when it has no facts', async () => {
    const root = await harness.mount({ label: 'Empty', facts: [] });
    assert.ok(Boolean(stripIn(root).querySelector('.fabricate-info-strip-head')), 'the head draws');
    assert.ok(!stripIn(root).querySelector('.fabricate-info-strip-facts'), 'no facts wrapper');
  });

  it('appends its class and spreads the rest on the root', async () => {
    const root = await harness.mount({
      ariaLabel: 'X',
      facts: FACTS,
      class: 'extra',
      'data-strip-hook': 'on',
    });
    const strip = stripIn(root);
    assert.ok(strip.classList.contains('extra'));
    assert.equal(strip.getAttribute('data-strip-hook'), 'on');
  });
});

describe('the crafting check card on the strip', () => {
  const CHECK_CARD = 'src/ui/svelte/apps/crafting/detail/CraftingCheckCard.svelte';
  const card = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-info-strip-check-card-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
    compiledModules: [...CHECK_CARD_COMPILED_MODULES],
    componentPath: CHECK_CARD,
    rootClass: 'fabricate fabricate-app',
  });
  before(async () => {
    await card.setup();
    globalThis.game.i18n.localize = shippedLocalize;
    globalThis.game.i18n.format = (key, data) => fill(shippedLocalize(key), data);
  });
  after(() => card.teardown());
  afterEach(() => card.remount());

  const check = (extra) => ({
    dc: 15,
    skill: 'Smithing',
    rollFormula: '1d20 + @prof',
    resolvedFormula: '1d20 + 2',
    formulaResolved: true,
    usable: true,
    mandatory: true,
    ...extra,
  });
  const section = (root) => root.querySelector('section[data-recipe-section="check"]');

  it('keeps the card hooks on its root and every fact hook on its fact, untinted', async () => {
    const root = section(await card.mount({ check: check({}) }));
    assert.equal(root.getAttribute('data-check-mandatory'), 'true');
    assert.equal(root.getAttribute('data-check-usable'), 'true');
    assert.equal(root.className.split(/\s+/u).filter((name) => name.startsWith('is-')).length, 0);
    const strip = root.querySelector(':scope > .fabricate-info-strip');
    assert.equal(strip.querySelector('.fab-kicker').textContent, 'Crafting check');
    const named = labelOf(strip);
    assert.equal(named?.textContent, 'Crafting check', 'the kicker names the strip');
    const fact = (hook) => strip.querySelector(`.fabricate-info-strip-fact[${hook}]`);
    assert.equal(fact('data-check-dc').textContent.trim(), 'DC 15');
    assert.equal(fact('data-check-skill').textContent.trim(), 'Smithing');
    const formula = fact('data-check-formula');
    assert.equal(formula.textContent.trim(), '1d20 + 2');
    assert.equal(formula.getAttribute('data-check-formula-resolved'), 'true');
    assert.equal(formula.getAttribute('title'), '1d20 + @prof', 'the raw formula is the title');
    assert.equal(strip.querySelectorAll(FOCUSABLE).length, 0, 'nothing in it is focusable');
    assert.ok(!root.querySelector('.fab-notice'), 'a readable check raises no notice');
  });

  it('badges a required check in info and an optional one in neutral', async () => {
    const required = section(await card.mount({ check: check({}) }));
    const chip = required.querySelector(':scope .fabricate-info-strip-head .manager-chip');
    assert.equal(chip.textContent, 'Required');
    assert.ok(chip.classList.contains('is-info'));
    card.remount();
    const optional = section(await card.mount({ check: check({ mandatory: false }) }));
    const plain = optional.querySelector(':scope .fabricate-info-strip-head .manager-chip');
    assert.equal(plain.textContent, 'Optional');
    assert.ok(plain.classList.contains('is-neutral'));
    assert.equal(optional.getAttribute('data-check-mandatory'), 'false');
  });

  it('draws the target source as its own fact with a glyph', async () => {
    const target = { direction: 'under', text: 'Target 11 · stay at or under', source: 'Sera 12' };
    const root = section(await card.mount({ check: check({ dc: null, target }) }));
    const source = root.querySelector('.fabricate-info-strip-fact[data-check-target-source]');
    assert.equal(source.getAttribute('data-check-target-source'), '');
    assert.ok(source.querySelector(':scope > i[aria-hidden="true"]'), 'the source has a glyph');
    assert.equal(source.textContent.trim(), 'Sera 12');
  });

  it('raises an unreadable target and formula as danger notices after the strip', async () => {
    const root = section(
      await card.mount({
        check: check({ dc: null, target: { unresolved: 'No number.' }, formulaResolved: false }),
      })
    );
    const notices = [...root.querySelectorAll(':scope > .fab-notice.is-danger')];
    assert.equal(notices.length, 2);
    assert.ok(notices[0].previousElementSibling.matches('.fabricate-info-strip'));
    assert.equal(notices[0].getAttribute('data-check-target-unresolved'), '');
    assert.equal(notices[0].textContent.trim(), 'No number.', 'it carries only its reason');
    assert.equal(notices[1].getAttribute('data-check-formula-error'), '');
    const formula = root.querySelector('[data-check-formula]');
    assert.equal(formula.textContent.trim(), '1d20 + @prof', 'the raw formula stays shown');
    assert.equal(formula.getAttribute('data-check-formula-resolved'), 'false');
  });

  it('draws no fact for a target that only states why it is unresolved', async () => {
    const root = section(
      await card.mount({ check: check({ dc: null, target: { unresolved: 'No number.' } }) })
    );
    const facts = [...root.querySelectorAll('.fabricate-info-strip-fact')];
    assert.equal(facts.length, 2, 'only the skill and the formula draw');
    for (const fact of facts) {
      const value = fact.querySelector('.fabricate-info-strip-value').textContent.trim();
      assert.notEqual(value, '', 'no fact has an empty value');
    }
    assert.ok(!root.querySelector('[data-check-target]'), 'the target draws no fact');
  });

  it('leaves the resolved flag off the formula when no resolved formula exists', async () => {
    const root = section(await card.mount({ check: check({ resolvedFormula: undefined }) }));
    const formula = root.querySelector('[data-check-formula]');
    assert.equal(formula.textContent.trim(), '1d20 + @prof');
    assert.ok(!formula.hasAttribute('data-check-formula-resolved'), 'the flag is absent');
  });

  it('says an unusable check has no formula as a muted line, never a notice', async () => {
    const root = section(
      await card.mount({ check: check({ usable: false, rollFormula: '', formulaResolved: false }) })
    );
    assert.ok(root.querySelector(':scope > p.crafting-check-note'), 'the muted line renders');
    assert.ok(!root.querySelector('.fab-notice'), 'no notice for a missing formula');
    assert.equal(root.getAttribute('data-check-usable'), 'false');
  });
});
