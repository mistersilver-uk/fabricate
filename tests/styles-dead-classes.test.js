/**
 * `styles/fabricate.css` may not carry a rule block that matches nothing (issue 1498).
 *
 * THE RATCHET IS AT ZERO AND HAS NO BASELINE. Issue 1498 deleted 367 blocks — 2,736 lines of
 * 26,849 — so there is nothing left to grandfather, and a baseline list would only be somewhere
 * for the next dead rule to be parked. A rule that matches no element cannot move a pixel, which
 * is what makes deleting one safe; the corollary is that authoring one is free, invisible, and
 * exactly what this gate exists to catch on the pull request that does it.
 *
 * WHAT "MATCHES NOTHING" MEANS is `scripts/lib/stylesheetLiveClasses.js`, in full, and this gate
 * runs the very functions the deletion ran rather than a restatement of them. That sharing is the
 * point: a gate written to its own copy of the rules would drift from the sweep it protects, and
 * the first symptom would be a false red on a rule somebody had just proved live.
 *
 * THE FAILURE THIS GATE CANNOT SEE BY ITSELF is a class the helper wrongly calls live. Such a
 * class keeps its rules, the gate stays green, and nothing has been checked. Two things guard that
 * side. `tests/stylesheet-live-classes.test.js` proves each liveness rule on a synthetic corpus
 * where a wrong answer is a failing assertion. And the two chat-card families are asserted live
 * here BY NAME, because they are the families the sweep was most likely to get wrong — their
 * classes are built as `${block}__section`, with the dynamic part first — and no View Lab case
 * renders a chat card, so no frame could have shown the mistake.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FOUNDRY_CORE_CLASSES,
  buildLiveClassSet,
  deadRuleBlocks,
  declaredClasses,
  ruleBlocks,
} from '../scripts/lib/stylesheetLiveClasses.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = 'styles/fabricate.css';

/**
 * The one exemption, and it is temporary.
 *
 * `manager-layout.test.js` uses `.manager-availability-option` as REFERENCE GEOMETRY, so the
 * availability menu's four classes are owned by issue 1480 rather than by the sweep that wrote
 * this gate: deleting them here would have taken that test's measuring stick with them. Issue 1480
 * is open with no pull request. When it lands, delete this constant — the gate goes red if the
 * rules are still there and nothing renders them, which is the correct prompt.
 */
const AVAILABILITY_MENU_PREFIX = 'manager-availability-';

/** The chat-card block prefixes, whose every declared class must be live. See the file header. */
const CHAT_CARD_PREFIXES = Object.freeze(['fabricate-craft-chat', 'fabricate-gather-chat']);

const css = readFileSync(path.join(REPO_ROOT, SHEET), 'utf8');
const live = buildLiveClassSet();
const exempt = (name) => name.startsWith(AVAILABILITY_MENU_PREFIX);

test('the live-class scan is alive, so the assertions below cannot pass on an empty answer', () => {
  assert.ok(live.literals.size > 1000, `the live set holds only ${live.literals.size} classes`);
  assert.ok(ruleBlocks(css).length > 1000, 'the stylesheet walk found almost no rules');
  assert.ok(declaredClasses(css).size > 500, 'the stylesheet declares almost no classes');
});

test('styles/fabricate.css carries no rule block that matches nothing', () => {
  const dead = deadRuleBlocks(css, live, { exempt });
  const report = dead
    .map((block) => `  ${SHEET}:${block.line}-${block.endLine}  ${block.selector}\n` +
      `      no source emits: ${block.deadClasses.join(', ')}`)
    .join('\n');

  assert.equal(
    dead.length,
    0,
    `${dead.length} rule block(s) in ${SHEET} name a class that nothing under src/ emits, so they` +
      ' match no element and paint nothing. Delete them, or — if the class IS emitted — say how in' +
      ` scripts/lib/stylesheetLiveClasses.js, whose rules decide this:\n${report}`
  );
});

test('every chat-card class the sheet declares is still live', () => {
  const declared = [...declaredClasses(css)].filter((name) =>
    CHAT_CARD_PREFIXES.some((prefix) => name.startsWith(prefix))
  );

  assert.ok(
    declared.length >= 40,
    `the sheet declares only ${declared.length} chat-card classes — this assertion has gone vacuous`
  );

  const orphaned = declared
    .filter((name) => !live.has(name))
    .sort((left, right) => (left < right ? -1 : Number(left > right)));
  assert.deepEqual(
    orphaned,
    [],
    'these chat-card classes are styled but no longer emitted. NO VIEW LAB CASE RENDERS A CHAT' +
      ' CARD, so this assertion is the only mechanical witness the families have — do not delete' +
      ` it to make it pass:\n  ${orphaned.join('\n  ')}`
  );
});

test('the Foundry core allow-list names only classes the sheet still styles', () => {
  const declared = declaredClasses(css);
  const unused = FOUNDRY_CORE_CLASSES.filter((name) => !declared.has(name));

  assert.deepEqual(
    unused,
    [],
    'FOUNDRY_CORE_CLASSES in scripts/lib/stylesheetLiveClasses.js exempts these names from the' +
      ' dead-rule scan, but the sheet no longer has a selector for any of them. An allow-list that' +
      ' can grow without anything checking it stops being an allow-list, so remove them:\n  ' +
      unused.join('\n  ')
  );
});

test('the issue 1480 exemption is doing exactly one job', () => {
  const withoutExemption = deadRuleBlocks(css, live);
  const exempted = withoutExemption.filter((block) =>
    block.deadClasses.every((name) => exempt(name))
  );

  assert.equal(
    withoutExemption.length,
    exempted.length,
    'the availability-menu exemption is hiding a dead block it does not own — every block it' +
      ' covers must be dead ONLY through a manager-availability- class'
  );
  assert.ok(
    exempted.length > 0,
    'the availability-menu rules are gone, so the exemption is dead weight: delete' +
      ' AVAILABILITY_MENU_PREFIX and this test with it (see issue 1480)'
  );
});
