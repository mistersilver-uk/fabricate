/**
 * `apps/manager/essences/essenceStudio.js` — the Essence Studio's presentation adapter
 * (issue 1036).
 *
 * It sits in the coverage blind spot this repo keeps rediscovering: `npm run lint` and
 * `format:check` do not glob `src/ui/**\/*.js` while SonarCloud still indexes it. Nothing
 * but a test reaches it at all, and three of its outputs are load-bearing product rules
 * rather than cosmetics:
 *
 * - the capability pills are NEVER hidden for a disabled essence, because hiding a pill
 *   removes state;
 * - the behaviour list states the SUPPRESSION in the same words for both behaviours, and
 *   says nothing about stacking, because the two suppressions differ there and claiming
 *   otherwise would be untrue;
 * - the arithmetic row is unconditional, because a disabled essence still matches,
 *   accumulates and is consumed.
 *
 * The localizer is the identity-with-fallback shim every component uses, so the assertions
 * read against the English fallbacks rather than against key names.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ESSENCE_EDITOR_TABS,
  essenceCapabilityPills,
  essenceOnCraftCount,
  essenceValidationPresentation,
  projectEssenceBehaviourFacts,
} from '../src/ui/svelte/apps/manager/essences/essenceStudio.js';

/** The `text(key, fallback)` shim, with no i18n table — exactly what a mounted test sees. */
const text = (_key, fallback) => fallback;
const format = (_key, fallback, data) =>
  Object.entries(data).reduce(
    (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
    fallback
  );

const BOTH_GATES = { effectTransferEnabled: true, propertyMacrosEnabled: true };
// `sourceState: 'linked'` is not decoration. `hasEffectTransfer` is `sourceState !== 'none'`
// at the store, so a HEALTHY essence is the one that also resolves; omitting the field here
// would describe a broken link and quietly make the healthy-tone assertions test the
// warning path.
const CONFIGURED = { hasEffectTransfer: true, hasPropertyMacro: true, sourceState: 'linked' };

test('1036: both capability pills render for a DISABLED essence, in the muted tone', () => {
  const enabled = essenceCapabilityPills({ ...CONFIGURED, enabled: true }, BOTH_GATES, text);
  const disabled = essenceCapabilityPills({ ...CONFIGURED, enabled: false }, BOTH_GATES, text);

  assert.deepEqual(
    disabled.map((pill) => pill.id),
    ['effects', 'macro'],
    'hiding a pill removes state: "carries effects but is suppressed" is not "carries nothing"'
  );
  assert.deepEqual(
    disabled.map((pill) => pill.id),
    enabled.map((pill) => pill.id),
    'the SET is identical; only the tone differs'
  );
  assert.deepEqual([...new Set(disabled.map((pill) => pill.tone))], ['neutral']);
  assert.deepEqual([...new Set(enabled.map((pill) => pill.tone))], ['info']);
});

test('1036: the Effects pill reports a BROKEN source, not merely a configured one', () => {
  // `hasEffectTransfer` means "a source is CONFIGURED", which a `stale` or `missing` link
  // still is. At one tone the row cannot distinguish a working link from a dead one, and
  // the row is where most essences are ever looked at — the inspector shows one at a time
  // and the needs-attention filter is a search, not a signal.
  const healthy = essenceCapabilityPills({ ...CONFIGURED, enabled: true }, BOTH_GATES, text)[0];
  assert.equal(healthy.tone, 'info');
  assert.equal(healthy.title, '', 'a working link explains nothing, because there is nothing to fix');

  for (const state of ['stale', 'missing']) {
    const broken = essenceCapabilityPills(
      { ...CONFIGURED, enabled: true, sourceState: state },
      BOTH_GATES,
      text
    )[0];
    assert.equal(broken.id, 'effects', `${state}: the pill is KEPT — the intention is authored`);
    assert.equal(broken.tone, 'warning', `${state}: colour`);
    assert.notEqual(broken.icon, healthy.icon, `${state}: glyph, so it survives greyscale`);
    assert.match(broken.title, /no longer resolves/, `${state}: and words`);
  }

  // The breakage OUTRANKS the suppression: a disabled essence with a dead link still has a
  // link to repair, so the muted tone must not swallow the warning.
  assert.equal(
    essenceCapabilityPills(
      { ...CONFIGURED, enabled: false, sourceState: 'stale' },
      BOTH_GATES,
      text
    )[0].tone,
    'warning'
  );
});

test('1036: a gated-off capability shows no pill even though the essence carries it', () => {
  assert.deepEqual(
    essenceCapabilityPills(
      { ...CONFIGURED, enabled: true },
      { effectTransferEnabled: false, propertyMacrosEnabled: true },
      text
    ).map((pill) => pill.id),
    ['macro'],
    'the feature gate decides whether a capability is REACHABLE at all'
  );
  assert.deepEqual(
    essenceCapabilityPills({ ...CONFIGURED, enabled: true }, {}, text),
    [],
    'both gates absent normalize to off, which is what the real feature flags do'
  );
});

test('1036: the arithmetic row is unconditional and comes FIRST', () => {
  const facts = projectEssenceBehaviourFacts(
    { enabled: false },
    { effectTransferEnabled: false, propertyMacrosEnabled: false },
    text,
    format
  );
  assert.deepEqual(facts.map((fact) => fact.id), ['counted']);
  assert.equal(
    facts[0].suppressed,
    false,
    'a disabled essence still matches, accumulates and is consumed — that is the one thing the gate does not change'
  );
});

test('1036: both behaviour rows state the SUPPRESSION in the same words, and neither mentions stacking', () => {
  const suppressed = projectEssenceBehaviourFacts(
    { ...CONFIGURED, enabled: false },
    { ...BOTH_GATES, sourceName: 'Everburning Coal', macroName: 'Ember Infusion' },
    text,
    format
  );
  const live = projectEssenceBehaviourFacts(
    { ...CONFIGURED, enabled: true },
    { ...BOTH_GATES, sourceName: 'Everburning Coal', macroName: 'Ember Infusion' },
    text,
    format
  );

  assert.deepEqual(suppressed.map((fact) => fact.id), ['counted', 'effects', 'macro']);
  const [effects, macro] = suppressed.slice(1);
  assert.equal(effects.subtitle, macro.subtitle, 'one sentence, one reason, both behaviours');
  assert.deepEqual([effects.suppressed, macro.suppressed], [true, true]);

  for (const fact of [...suppressed, ...live]) {
    assert.doesNotMatch(
      `${fact.title} ${fact.subtitle}`,
      /stack/i,
      'the two suppressions differ on stacking, so this panel deliberately says nothing about it'
    );
  }
  assert.notEqual(
    live[1].subtitle,
    suppressed[1].subtitle,
    'negative control: an ENABLED essence names its source instead of the suppression'
  );
});

test('1036: no effect COUNT is invented anywhere in the behaviour list', () => {
  // `_buildEssenceCards` produces `{id, name, img}` and no effect count; producing one needs
  // an async `fromUuid` plus `doc.effects.size`. A number the store cannot compute is not
  // shipped, so the prototype's "2 effects" became a count-free statement.
  const facts = projectEssenceBehaviourFacts(
    { ...CONFIGURED, enabled: true },
    { ...BOTH_GATES, sourceName: 'Everburning Coal' },
    text,
    format
  );
  assert.equal(facts[1].title, 'Transfers active effects');
  assert.doesNotMatch(facts[1].title, /\d/, 'no count at all, rather than a wrong one');
});

test('1036: the On-craft badge counts CONFIGURED behaviours, 0 through 2', () => {
  assert.equal(essenceOnCraftCount(CONFIGURED, BOTH_GATES), 2);
  assert.equal(essenceOnCraftCount({ hasPropertyMacro: true }, BOTH_GATES), 1);
  assert.equal(essenceOnCraftCount({}, BOTH_GATES), 0);
  assert.equal(
    essenceOnCraftCount(CONFIGURED, { effectTransferEnabled: true, propertyMacrosEnabled: false }),
    1,
    'a gated-off capability cannot be configured from that tab, so it does not count'
  );
});

test('1036: every validation check lands in exactly one rendered group', () => {
  const { checks, groups } = essenceValidationPresentation(
    { name: 'Fire', icon: 'fas fa-fire' },
    {},
    text
  );
  const rendered = groups.flatMap((group) => group.rows.map((row) => row.id));
  assert.deepEqual(
    [...rendered].sort((a, b) => a.localeCompare(b)),
    [...checks.map((check) => check.id)].sort((a, b) => a.localeCompare(b)),
    'a check that fell out of the group map would be counted and never shown'
  );
  assert.equal(new Set(rendered).size, rendered.length, 'and none is shown twice');
});

test('1036: an informational check never paints as a warning, and a warning does', () => {
  const { groups } = essenceValidationPresentation(
    // No colour, no description: colour is INFORMATIONAL (an unset essence renders in the
    // theme accent by design) and description is a WARNING.
    { name: 'Fire', icon: 'fas fa-fire' },
    {},
    text
  );
  const rows = new Map(groups.flatMap((group) => group.rows).map((row) => [row.id, row]));
  assert.equal(rows.get('colour').status, 'pass');
  assert.match(rows.get('colour').detail, /theme accent/);
  assert.equal(
    rows.get('description').status,
    'warn',
    'negative control: a real warning in the SAME group does paint as one'
  );
  assert.equal(rows.get('name').status, 'pass');
});

test('1036: a missing name is BLOCKING and a missing icon is too', () => {
  const { counts, groups } = essenceValidationPresentation({}, {}, text);
  const rows = new Map(groups.flatMap((group) => group.rows).map((row) => [row.id, row]));
  assert.equal(rows.get('name').status, 'block');
  assert.equal(rows.get('icon').status, 'block');
  assert.equal(counts.blocking, 2);
});

test('1036: the tab ids are LITERALS the View Lab source scan can credit', () => {
  // `EssenceEditorTabs` builds `id={`essence-tab-${tab.id}`}`, an interpolation the scan
  // cannot read. The ids therefore also exist as literals in this frozen constant, which the
  // component imports — so the ids the DOM carries and the ids `src/` declares are one list.
  assert.deepEqual(
    ESSENCE_EDITOR_TABS.map((tab) => tab.id),
    ['identity', 'oncraft', 'validation']
  );
  for (const tab of ESSENCE_EDITOR_TABS) {
    assert.ok(tab.icon.startsWith('fas '), 'every tab pairs its word with a glyph');
  }
});
