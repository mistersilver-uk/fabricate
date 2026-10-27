/** The one breakage badge copy the Tool rows and the behaviour facts both read. */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || { utils: { getProperty: () => undefined } };

const { projectToolBehaviorFacts, toolBreakageLabel, toolBreakageSummary } =
  await import('../src/ui/svelte/apps/manager/tools/toolStudio.js');

const text = (_key, fallback) => fallback;

const CASES = [
  ['immune', 'checkDriven', { checkBreakable: false }, 'Immune'],
  ['breakable', 'checkDriven', { checkBreakable: true }, 'Roll to break'],
  [
    'breakageChance',
    'toolSpecific',
    { breakage: { mode: 'breakageChance', breakageChance: 8 } },
    '8% break',
  ],
  [
    'diceExpression',
    'toolSpecific',
    { breakage: { mode: 'diceExpression', formula: '1d6' } },
    '1d6 roll',
  ],
  ['dice with no formula', 'toolSpecific', { breakage: { mode: 'diceExpression' } }, '— roll'],
  ['one use', 'toolSpecific', { breakage: { mode: 'limitedUses', maxUses: 1 } }, '1 use'],
  ['N uses', 'toolSpecific', { breakage: { mode: 'limitedUses', maxUses: 3 } }, '3 uses'],
  [
    'unlimited',
    'toolSpecific',
    { breakage: { mode: 'limitedUses', maxUses: null } },
    'Unlimited uses',
  ],
];

for (const [name, authority, tool, expected] of CASES) {
  test(`toolBreakageLabel reads "${expected}" for ${name}`, () => {
    const kind = toolBreakageSummary(tool, authority);
    assert.equal(toolBreakageLabel(tool, kind, text), expected);
  });

  test(`the behaviour facts title agrees with the row badge for ${name}`, () => {
    const kind = toolBreakageSummary(tool, authority);
    const fact = projectToolBehaviorFacts(tool, authority).find((entry) => entry.id === 'breakage');
    assert.equal(fact?.title, toolBreakageLabel(tool, kind, text));
  });
}
