/**
 * Issue 2005: a Tool's check bonus is a benefit on any check, so the preview's bonus fact frames it
 * that way whichever check the Tool is used for, and its subtitle reads like its sibling facts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.foundry = globalThis.foundry || { utils: { getProperty: () => undefined } };

const { projectToolBehaviorFacts } =
  await import('../src/ui/svelte/apps/manager/tools/toolStudio.js');
const lang = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
const editor = lang.FABRICATE.Admin.Manager.Tools.Editor;

const bonusFact = (bonus) =>
  projectToolBehaviorFacts({ bonus }).find((fact) => fact.id === 'bonus');

test('the bonus fact names what the Tool adds to any check', () => {
  const fact = bonusFact({ enabled: true, expression: '@prof' });
  assert.equal(fact.title, 'Adds @prof to any check');
  assert.equal(fact.subtitle, 'Applied the way each check applies bonuses');
});

test('with no bonus the fact says it adds nothing to any check', () => {
  const fact = bonusFact({ enabled: false, expression: '' });
  assert.equal(fact.title, 'No check bonus');
  assert.equal(fact.subtitle, 'Adds nothing to any check');
});

test('every subtitle is a short fragment with no closing full stop, the bonus included', () => {
  const subtitles = projectToolBehaviorFacts({ bonus: { enabled: true, expression: '2' } }).map(
    (fact) => fact.subtitle
  );
  for (const subtitle of subtitles) assert.doesNotMatch(subtitle, /\.$/, subtitle);
});

test('the shipped strings match the fallbacks', () => {
  assert.equal(editor.PreviewBonusValue, 'Adds {expression} to any check');
  assert.equal(editor.PreviewBonus, 'Applied the way each check applies bonuses');
  assert.equal(editor.PreviewNoBonus, 'Adds nothing to any check');
});
