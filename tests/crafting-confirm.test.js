import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCraftConfirmContent } from '../src/ui/svelte/apps/crafting/craftConfirm.js';

// The builder is Foundry-free and imports no models/ modules, so it is imported
// directly (no Svelte-compile harness) — this keeps the SonarCloud new-code
// duplication gate green (no second store-compile scaffold).

const craftability = {
  ingredientStates: [
    { componentId: 'iron', name: 'Iron Ingot', img: 'iron.png', need: 3, have: 1, satisfied: false },
    { componentId: 'wood', name: 'Oak Plank', img: 'wood.png', need: 2, have: 5, satisfied: true },
  ],
  toolStates: [{ componentId: 'anvil', name: 'Anvil', img: 'anvil.png', available: true }],
  essenceStates: [{ name: 'Fire', icon: 'fa-fire', need: 4, have: 2, satisfied: false }],
};

describe('buildCraftConfirmContent (issue 61)', () => {
  it('renders the irreversible-consumption warning and the skip checkbox', () => {
    const html = buildCraftConfirmContent({ recipeName: 'Iron Sword', craftability });

    assert.match(html, /fabricate-craft-confirm__warning/, 'leads with the warning');
    assert.match(html, /consumes the ingredients/i, 'warns about permanent consumption');
    assert.match(
      html,
      /<input type="checkbox" name="dontAskAgain" id="fabricate-craft-confirm-skip"/,
      'emits the named skip checkbox inside the content'
    );
  });

  it('renders the section headings for ingredients, tools, and essences', () => {
    const html = buildCraftConfirmContent({ recipeName: 'Iron Sword', craftability });

    assert.match(html, /Ingredients consumed/, 'ingredients section');
    assert.match(html, /Required tools/, 'tools section (never "catalysts")');
    assert.match(html, /Required essences/, 'essences section');
    assert.doesNotMatch(html, /catalyst/i, 'never uses the term "catalysts"');
  });

  it('renders the CONSUMED quantity as the salient number for each ingredient', () => {
    const html = buildCraftConfirmContent({ recipeName: 'Iron Sword', craftability });

    // The consumed need (×3 / ×2) is real text (not aria-hidden), availability secondary.
    assert.match(html, /&times;3/, 'iron needs 3 (consumed quantity)');
    assert.match(html, /&times;2/, 'oak needs 2 (consumed quantity)');
    assert.match(html, /Iron Ingot/, 'ingredient name present');
    assert.match(html, /Anvil/, 'tool name present');
    assert.match(html, /Fire/, 'essence name present');
    assert.doesNotMatch(html, /aria-hidden="true"[^>]*>&times;/, 'consumed quantity is not aria-hidden');
  });

  it('renders deterministic expected results for a simple recipe', () => {
    const html = buildCraftConfirmContent({
      recipeName: 'Iron Sword',
      craftability,
      result: { items: [{ name: 'Iron Sword', img: 'sword.png', qty: 1 }] },
    });

    assert.match(html, /Expected results/, 'results section heading');
    assert.match(html, /data-confirm-section="results"/, 'results section rendered');
  });

  it('renders a depends-on-roll note for a check-routed recipe with no tiers', () => {
    const html = buildCraftConfirmContent({
      recipeName: 'Risky Brew',
      craftability,
      result: null,
      dependsOnRoll: true,
    });

    assert.match(html, /depends on your roll/i, 'shows the roll-dependent note');
    assert.doesNotMatch(html, /data-confirm-section="results">.*<ul/s, 'no deterministic item list');
  });

  it('renders the tier list for a check-routed recipe when tiers are supplied', () => {
    const html = buildCraftConfirmContent({
      recipeName: 'Risky Brew',
      craftability,
      result: null,
      dependsOnRoll: true,
      outcomeTiers: [
        { names: ['Success'], success: true, awardedResults: [{ name: 'Potion', qty: 1 }] },
        { names: ['Failure'], success: false, awardedResults: [] },
      ],
    });

    assert.match(html, /Success/, 'tier name rendered');
    assert.match(html, /Potion/, 'awarded item rendered');
    assert.match(html, /fabricate-craft-confirm__tiers/, 'tier list rendered');
  });

  it('omits the results section when no result and not roll-dependent', () => {
    const html = buildCraftConfirmContent({ recipeName: 'Iron Sword', craftability });
    assert.doesNotMatch(html, /data-confirm-section="results"/, 'results omitted gracefully');
  });

  it('omits tool/essence sections when those tracks are empty', () => {
    const html = buildCraftConfirmContent({
      recipeName: 'Plain',
      craftability: { ingredientStates: [{ name: 'Clay', need: 1, have: 1 }], toolStates: [], essenceStates: [] },
    });
    assert.doesNotMatch(html, /data-confirm-section="tools"/, 'no tools section');
    assert.doesNotMatch(html, /data-confirm-section="essences"/, 'no essences section');
  });

  it('escapes HTML in a malicious recipe/component name', () => {
    const html = buildCraftConfirmContent({
      recipeName: '<img src=x onerror=alert(1)>',
      craftability: {
        ingredientStates: [{ name: '"><script>evil()</script>', need: 1, have: 0 }],
        toolStates: [],
        essenceStates: [],
      },
    });

    assert.doesNotMatch(html, /<script>evil/, 'script tag is escaped, not emitted raw');
    assert.doesNotMatch(html, /<img src=x onerror/, 'the injected img is escaped');
    assert.match(html, /&lt;script&gt;evil/, 'the name is HTML-escaped');
  });
});
