/*
 * Issue 1286 — the manager root's wiring for the component complications section.
 *
 * ## WHY THIS IS A SOURCE CONTRACT AND NOT A MOUNTED TEST
 *
 * `tests/components/manager-mounted.test.js` is the ONLY suite that mounts
 * `CraftingSystemManagerRoot`, and it is not this lane's to edit. The facts below are
 * nonetheless the ones that decide whether the section works at all, and every one of them
 * fails SILENTLY — a missing prop drops to its default, a dropped field is simply absent
 * from a payload — so leaving them unpinned would leave the section's contents asserted by
 * nothing. `tests/gathering-bootstrap-api.test.js`'s pin of a literal `src/main.js` wiring
 * line is the precedent this follows.
 *
 * Source assertions rot, so each is written against the SMALLEST stable token that carries
 * the meaning (a prop name, a field name) rather than against a formatted block that
 * Prettier can reflow.
 *
 * ## THE THREE FAILURES PINNED
 *
 * 1. The section derives `complicationActivities` from `salvageResolutionMode` alone when
 *    the host passes none — a deliberately narrow default, honest about the one axis a
 *    component can see. Left there, a progressive-CRAFTING system offers a GM no
 *    complications at all, and nothing is red.
 * 2. The trigger and macro pickers render an EMPTY list without their option props. An
 *    empty picker looks like an unconfigured system rather than a dropped projection.
 * 3. `updates.complications` is a TOP-LEVEL sibling of `salvage`, so it rides the save
 *    payload on its own. A field missing from that path is authored, shown, and silently
 *    discarded on save — the defect that shipped in issues 651 and 676.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const rootSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
  'utf8'
);
const editorSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentEditView.svelte'),
  'utf8'
);

/** The `<ComponentEditView … />` element, so a prop is proved AT ITS CALL SITE. */
function componentEditViewCall() {
  const start = rootSource.indexOf('<ComponentEditView');
  assert.ok(start !== -1, 'the root still renders ComponentEditView');
  const end = rootSource.indexOf('/>', start);
  assert.ok(end > start, 'the element is still self-closing');
  return rootSource.slice(start, end);
}

describe('1286 the manager root wires the complications section', () => {
  it('passes the whole progressive-activity bag, not just the salvage axis it could derive', () => {
    const call = componentEditViewCall();
    assert.match(call, /\{complicationActivities\}/, 'the editor is handed the activity bag');
    // The bag names all THREE activities. Salvage alone is what the editor already derives
    // for itself, so a bag carrying only that would be indistinguishable from no bag.
    const derivation = rootSource.slice(rootSource.indexOf('const complicationActivities'));
    for (const activity of ['crafting', 'salvage', 'gathering']) {
      assert.match(
        derivation.slice(0, 600),
        new RegExp(`${activity}:`),
        `the bag states the ${activity} axis`
      );
    }
    // Crafting reads the SYSTEM's resolution mode and gathering the ECONOMY's — neither
    // reaches a component, which is exactly why the editor cannot derive them.
    assert.match(derivation.slice(0, 600), /selectedSystem\?\.resolutionMode === 'progressive'/);
    assert.match(derivation.slice(0, 600), /gathering: gatheringProgressive/);
  });

  it('passes the trigger options, labelled by the activity that owns the id space', () => {
    assert.match(componentEditViewCall(), /\{complicationTriggerOptions\}/);
    const derivation = rootSource.slice(rootSource.indexOf('const complicationTriggerOptions'));
    // One entry per activity, and each reads that activity's PROGRESSIVE block: a trigger on
    // a simple or routed check has no progressive stage outcome to reach a complication from.
    for (const [activity, block] of [
      ['crafting', 'craftingCheck'],
      ['salvage', 'salvageCraftingCheck'],
      ['gathering', 'gatheringCraftingCheck'],
    ]) {
      assert.ok(
        derivation.slice(0, 700).includes(`'${activity}', selectedSystem?.${block}?.progressive`),
        `${activity} triggers come from its own progressive check block`
      );
    }
    // The label is the condition SENTENCE built by the Checks Studio's own builder. A
    // trigger carries no authored name — `_normalizeUnifiedTrigger` drops `label` — so an
    // id would name nothing to a GM, and a second sentence composed here would drift.
    assert.ok(
      rootSource.includes("summariseCondition } from './checks/checkTriggerSummary.js'"),
      "the Checks Studio's builder is IMPORTED, not re-implemented"
    );
    assert.match(rootSource, /activity,\s*\n\s*label: complicationTriggerPhrase\(/);
  });

  it('passes the EXISTING script-macro projection rather than minting a second one', () => {
    assert.match(componentEditViewCall(), /macroOptions=\{complicationMacroOptions\}/);
    assert.match(
      rootSource,
      /const complicationMacroOptions = \$derived\(\s*selectedSystem\?\.availableScriptMacros \|\| \[\]\s*\)/,
      'the store already publishes this list script-filtered and name-sorted; two lists ' +
        'would disagree the first time either filter moved'
    );
  });

  it('carries updates.complications through the save path to the store', () => {
    // The editor emits it as a TOP-LEVEL key…
    assert.match(
      editorSource,
      /updates\.complications = complicationsDraft;/,
      'the editor stages complications as a sibling of salvage, never inside updates.salvage'
    );
    // …and the root's save must not rebuild the payload around a field allowlist. It folds
    // the staged difficulty in by SPREADING what it was given, which is what keeps every
    // other authored field — this one included — on the wire.
    const save = rootSource.slice(rootSource.indexOf('async function saveComponentEdit'));
    const body = save.slice(0, save.indexOf('\n  }\n'));
    assert.match(
      body,
      /\{ \.\.\.\(updates \|\| \{\}\), difficulty:/,
      'the payload is spread, not rebuilt'
    );
    assert.match(
      body,
      /store\.updateComponent\?\.\(itemId, merged\)/,
      'and the spread payload is what is persisted'
    );
    assert.ok(
      !/updates\.(tags|essences|salvage|category)\b/.test(body),
      'nothing in the save path enumerates fields — an allowlist here is how a new field ' +
        'gets authored, shown, and silently discarded (issues 651, 676)'
    );
  });
});
