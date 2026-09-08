import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-checks-validation-',
  // The ONE shared checks-tree manifest (issue 1095, BM9), imported rather than
  // re-typed. A `.js` or `.svelte` the tree renders but the harness omits HANGS the
  // suite (# cancelled) rather than failing it, so a per-file copy of this list is a
  // per-file chance to be silently unrunnable.
  rawModules: CHECKS_TREE_RAW_MODULES,
  compiledModules: CHECKS_TREE_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte',
});

describe('ChecksValidationTab (mounted)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('renders a per-subsystem section for every in-play check', async () => {
    const target = await harness.mount({
      sections: [
        { subsystem: 'crafting', mode: 'simple', check: { rollFormula: '1d20' } },
        { subsystem: 'salvage', mode: 'simple', check: { rollFormula: '1d20' } },
      ],
    });
    assert.ok(
      target.querySelector('[data-checks-validation-section="crafting"]'),
      'a crafting section renders'
    );
    assert.ok(
      target.querySelector('[data-checks-validation-section="salvage"]'),
      'a salvage section renders'
    );
    harness.remount();
  });

  it('shows the roll-formula readiness check and a warning when the formula is missing', async () => {
    const target = await harness.mount({
      sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '' } }],
    });
    const formulaCheck = target.querySelector(
      '[data-checks-validation-section="crafting"] [data-check="hasRollFormula"]'
    );
    assert.ok(formulaCheck, 'the roll-formula readiness check renders');
    assert.equal(formulaCheck.dataset.satisfied, 'false', 'it is unsatisfied with no formula');
    assert.ok(
      target.querySelector('[data-issue="noRollFormula"]'),
      'a missing-formula issue is listed'
    );
    assert.ok(
      target.querySelector('[data-issue-severity="warning"]'),
      'the missing formula is a warning'
    );
    harness.remount();
  });

  it('lists routed outcome-tier issues (unnamed tier, no Success) as critical', async () => {
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'routed',
          check: {
            type: 'relative',
            rollFormula: '1d20',
            relativeOutcomes: [{ id: 'a', name: '  ', success: false, dc: 0 }],
          },
        },
      ],
    });
    assert.ok(target.querySelector('[data-issue="unnamedOutcome"]'), 'unnamed tier issue listed');
    assert.ok(target.querySelector('[data-issue="noSuccessOutcome"]'), 'no-Success issue listed');
    assert.ok(
      target.querySelector('[data-issue-severity="critical"]'),
      'a critical issue group renders'
    );
    harness.remount();
  });

  it('draws a critical issue ABOVE the ticks of its own subsystem group (issue 1517)', async () => {
    // THE ONE ROUTE WHERE TWO KINDS OF ROW SHARE A GROUP, and therefore the only place the
    // shared surface's in-group sort is observable end to end. `rowsFor` builds ticks first and
    // issues second; `EditorValidationSurface` ranks `block` at 0 and everything else at 1, and
    // this tab maps a `critical` issue to `block` — so the built order and the drawn order
    // deliberately differ, and BOTH files' comments say so in as many words.
    //
    // Asserted on POSITION rather than on presence: `filter`/`some` over the same rows is what
    // every other clause in this file does, and not one of them can see an order.
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'routed',
          check: {
            type: 'relative',
            rollFormula: '1d20',
            relativeOutcomes: [{ id: 'a', name: '  ', success: false, dc: 0 }],
          },
        },
      ],
    });
    const rows = [
      ...target.querySelectorAll(
        '[data-checks-validation-section="crafting"] .manager-recipe-val-row'
      ),
    ];
    const kinds = rows.map((row) => (row.dataset.issue ? 'issue' : 'tick'));
    const ticks = kinds.indexOf('tick');
    assert.ok(ticks >= 0, 'the fixture draws at least one check tick to be risen above');
    assert.ok(
      rows.filter((row) => row.dataset.issueSeverity === 'critical').length > 0,
      'and at least one critical issue'
    );
    const lastCritical = rows.reduce(
      (found, row, index) => (row.dataset.issueSeverity === 'critical' ? index : found),
      -1
    );
    assert.ok(
      lastCritical < ticks,
      'every critical issue must precede the first tick of its group. A GM opens this tab ' +
        'because something is wrong, and reads down: the blocker cannot sit under a list of ' +
        `things that passed. Got ${JSON.stringify(kinds)} with the last critical at ` +
        `${lastCritical} and the first tick at ${ticks}`
    );
    harness.remount();
  });

  it('renders the tier-step target issues and their shared green tick (issue 975)', async () => {
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'routed',
          check: {
            type: 'relative',
            rollFormula: '1d20',
            relativeOutcomes: [{ id: 'a', name: 'Success', success: true, dc: 0 }],
            checkBreakage: {
              triggers: [
                {
                  id: 't1',
                  condition: { type: 'rollTotal', operator: '<=', value: 1 },
                  outcome: 'none',
                  breakTools: false,
                  tierStep: { mode: 'target', steps: 1, tierId: 'gone' },
                },
                {
                  id: 't2',
                  condition: { type: 'rollTotal', operator: '>=', value: 20 },
                  outcome: 'none',
                  breakTools: false,
                  tierStep: { mode: 'target', steps: 1, tierId: 'a' },
                },
              ],
            },
          },
        },
      ],
    });
    const tick = target.querySelector('[data-check="tierStepTargetsResolve"]');
    assert.ok(tick, 'the paired readiness check renders');
    assert.equal(tick.dataset.satisfied, 'false');
    // Both issues carry real localized copy, not a bare id echoed back to the GM.
    for (const id of ['danglingTierStepTarget', 'multipleTierStepTargets']) {
      const issue = target.querySelector(`[data-issue="${id}"]`);
      assert.ok(issue, `${id} is listed`);
      // The row title moved to the shared `EditorValidationSurface`'s own class when
      // issue 1096 rebuilt this route on it. Retargeted rather than dropped: what this
      // line proves — that the id resolves to real copy instead of being echoed at the GM
      // — is unchanged by which component renders the span.
      const title = issue.querySelector('.manager-recipe-val-title').textContent.trim();
      assert.notEqual(title, id, `${id} resolves to copy rather than echoing its own id`);
    }
    assert.ok(
      !target.querySelector('[data-issue-severity="critical"]'),
      'neither is critical — a target count is guidance, not breakage'
    );
    harness.remount();
  });

  it('reports a healthy check as zero counters and no issue rows', async () => {
    const target = await harness.mount({
      sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '1d20' } }],
    });
    // The per-section "No issues detected." note retired with the hand-rolled markup: the
    // shared surface says the same thing with its three counters, which are a stronger
    // statement because they are also what the rail badge and the section dots are summed
    // from. Asserting on them rather than on the note keeps the claim ("this check is
    // clean") and drops only the sentence that used to carry it.
    assert.equal(
      target.querySelector('[data-editor-validation-count="blocking"]').textContent.trim(),
      '0'
    );
    assert.equal(
      target.querySelector('[data-editor-validation-count="warnings"]').textContent.trim(),
      '0'
    );
    assert.ok(
      !target.querySelector('[data-issue]'),
      'a clean check lists no issue rows at all'
    );
    harness.remount();
  });

  it('deep-links each issue to the ACTIVITY and the SECTION that owns its control', async () => {
    // The whole point of rebuilding on the shared surface. A GM who reads "no roll formula"
    // on this route has to get to the control that fixes it, and the section is half of
    // that answer — the map this reads is proven exhaustive against the frozen issue
    // registry in `tests/checks-readiness.test.js`, so an id can never bucket nowhere.
    const selected = [];
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'salvage',
          mode: 'routed',
          check: {
            type: 'relative',
            rollFormula: '',
            relativeOutcomes: [{ id: 'a', name: '', success: false, dc: 0 }],
          },
        },
      ],
      onSelectIssue: (target_) => selected.push(target_),
    });
    const rows = [...target.querySelectorAll('[data-issue]')];
    assert.ok(rows.length >= 2, 'the fixture raises more than one issue');
    for (const row of rows) row.querySelector('.manager-recipe-val-view').click();
    assert.deepEqual(
      selected.filter((entry) => entry.section === 'roll').map((entry) => entry.activity),
      ['salvage'],
      'the missing formula routes to the salvage roll section'
    );
    assert.ok(
      selected.some((entry) => entry.section === 'outcomes'),
      'the unnamed tier routes to Outcomes'
    );
    assert.ok(
      selected.every((entry) => typeof entry.section === 'string' && entry.section),
      'no issue deep-links to a null section'
    );
    harness.remount();
  });

  // ── THE ROW ACTION'S TWO ADDRESSES (issue 1517) ─────────────────────────────────────────────
  //
  // A validation row carries `target` — the ROUTE, here the `{ activity, section }` pair the
  // studio's router opens — and `focusTarget` — the CONTROL, the value of the
  // `data-validation-target` attribute the offending control carries in that section.
  // `ChecksValidationTab` is the producer for this route; `CheckFormulaFields` and `CheckTriggers`
  // are its destinations; `ChecksView` is the host that resolves both.
  //
  // WHY THE HOST IS PROVEN FROM SOURCE HERE RATHER THAN MOUNTED. This suite's harness mounts the
  // VALIDATION TAB, which is what makes the producer half directly clickable — the tab takes
  // `onSelectIssue` as a prop, so the exact `(target, focusTarget)` pair a row hands the host is
  // read from a real click rather than inferred. Mounting `ChecksView` instead is what
  // `checks-must-not-regress-characterization.test.js` and two sibling suites already do with the
  // shared checks manifest, and a fourth copy of that whole studio closure here is exactly the
  // near-identical block the new-code duplication gate refuses. So the host's three obligations
  // are read off its source, and the ADDRESSES are joined to the destinations that carry them.
  describe('the Checks validation row action addresses a control (issue 1517)', () => {
    const viewButton = (root, id) =>
      root.querySelector(`[data-issue="${id}"] .manager-recipe-val-view`);

    it('hands the host BOTH addresses for a roll issue, and the ROUTE ALONE for an outcomes one', async () => {
      // WHICH OF THE TWO SHAPES A ROW IS, asserted rather than assumed. Route-only is a stated
      // outcome on this route and not a degradation: the Outcomes section's tier rows are
      // authored inline in the check editors and the row names no single tier, so those rows
      // change route and focus nothing. A `focusTarget` quietly going missing from the roll row
      // would otherwise degrade into exactly that, invisibly.
      const calls = [];
      const target = await harness.mount({
        sections: [
          {
            subsystem: 'salvage',
            mode: 'routed',
            check: {
              type: 'relative',
              rollFormula: '',
              relativeOutcomes: [{ id: 'a', name: '', success: false, dc: 0 }],
            },
          },
        ],
        onSelectIssue: (route, focusTarget) => calls.push([route, focusTarget]),
      });

      viewButton(target, 'noRollFormula').click();
      viewButton(target, 'unnamedOutcome').click();
      assert.deepEqual(calls, [
        [{ activity: 'salvage', section: 'roll' }, 'checks-roll-formula'],
        [{ activity: 'salvage', section: 'outcomes' }, undefined],
      ]);
      harness.remount();
    });

    it('addresses the trigger LIST for a tier-step issue, which is a set rather than one control', async () => {
      const calls = [];
      const target = await harness.mount({
        sections: [
          {
            subsystem: 'crafting',
            mode: 'routed',
            check: {
              type: 'relative',
              rollFormula: '1d20',
              relativeOutcomes: [{ id: 'a', name: 'Success', success: true, dc: 0 }],
              checkBreakage: {
                triggers: [
                  {
                    id: 't1',
                    condition: { type: 'rollTotal', operator: '<=', value: 1 },
                    outcome: 'none',
                    breakTools: false,
                    tierStep: { mode: 'target', steps: 1, tierId: 'gone' },
                  },
                ],
              },
            },
          },
        ],
        onSelectIssue: (route, focusTarget) => calls.push([route, focusTarget]),
      });
      viewButton(target, 'danglingTierStepTarget').click();
      assert.deepEqual(calls, [[{ activity: 'crafting', section: 'triggers' }, 'checks-triggers']]);
      harness.remount();
    });

    it('gives a satisfied tick no action at all, so the button only ever reaches a defect', async () => {
      const target = await harness.mount({
        sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '1d20' } }],
      });
      const tick = target.querySelector('[data-check="hasRollFormula"]');
      assert.equal(tick.dataset.satisfied, 'true', 'the fixture draws a satisfied tick');
      assert.ok(
        !tick.querySelector('.manager-recipe-val-view'),
        'and a passing tick renders no View button'
      );
      harness.remount();
    });
  });
});

// ── THE PAIR, AND THE HOST THAT JOINS IT (issue 1517) ───────────────────────────────────────
//
// THE HAYSTACK, STATED. Every scan below reads source text with its COMMENTS STRIPPED, and that
// is not tidiness: this change documents each address in prose immediately above the code that
// writes it — the producer's table names `checks-roll-formula` and `checks-triggers` in a
// docblock, and both destinations explain their stamp in an HTML comment — so an un-stripped
// scan would find every address in the sentence explaining it and report a destination as
// stamped when nothing stamps it. `stripComments` removes HTML comment blocks, block comments
// and whole-line `//` comments; string literals are deliberately left in, because the attribute
// values themselves ARE string literals and are what is being read.
const SOURCE_ROOT = 'src/ui/svelte/apps/manager';

function stripComments(source) {
  return source
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/^[ \t]*\/\/.*$/gmu, '');
}

function sourceOf(relativePath) {
  return stripComments(readFileSync(resolve(repoRoot, `${SOURCE_ROOT}/${relativePath}`), 'utf8'));
}

describe('every Checks address the producer emits is carried by a real control', () => {
  // The producer's own table, read out of its source rather than restated here. Restating it
  // would make this gate agree with a copy of the thing it is checking.
  const producer = sourceOf('checks/ChecksValidationTab.svelte');
  const table = /const CHECK_ISSUE_CONTROLS = Object\.freeze\(\{([\s\S]*?)\n {2}\}\);/u.exec(
    producer
  );
  const emitted = table ? [...new Set([...table[1].matchAll(/'([^']+)',/gu)].map((m) => m[1]))] : [];

  // WHICH FILE IS SUPPOSED TO CARRY WHICH ADDRESS. This is the half a producer cannot check: an
  // address no control carries is a View button that changes route and focuses nothing, and
  // neither half alone can see it.
  const DESTINATIONS = {
    'checks-roll-formula': 'checks/CheckFormulaFields.svelte',
    'checks-triggers': 'checks/CheckTriggers.svelte',
  };

  it('reads a non-empty address table out of the producer, so the clauses below are not vacuous', () => {
    assert.ok(
      Boolean(table),
      'the `CHECK_ISSUE_CONTROLS` table could not be located in the producer'
    );
    assert.equal(
      emitted.length,
      2,
      `read ${emitted.length} distinct addresses; expected the roll field and the trigger list`
    );
  });

  it('stamps every emitted focusTarget on a control in the section its route names', () => {
    const missing = [];
    for (const address of emitted) {
      const file = DESTINATIONS[address];
      if (!file) {
        missing.push(`${address}: no destination file is declared for it`);
        continue;
      }
      const destination = sourceOf(file);
      // BOTH SPELLINGS, because an address may ride a primitive's attribute bag and reach the
      // DOM as an object key rather than as a written attribute.
      const written = destination.includes(`data-validation-target="${address}"`);
      const bagged = destination.includes(`'data-validation-target': '${address}'`);
      if (!written && !bagged) missing.push(`${address}: ${file} carries no such control`);
    }
    assert.deepEqual(
      missing,
      [],
      'these addresses are emitted by a validation row and carried by nothing, so the row ' +
        'action would change route and focus nothing:\n  ' +
        missing.join('\n  ')
    );
  });

  it('declares no destination the producer never emits', () => {
    assert.deepEqual(
      Object.keys(DESTINATIONS).filter((address) => !emitted.includes(address)),
      [],
      'a destination is declared for an address no row carries; either the producer dropped it ' +
        'or this list is stale'
    );
  });

  it('gives the set-level destination the focusability a real browser needs', () => {
    // THE MUTATION THIS EXISTS FOR: happy-dom focuses anything, so a mounted assertion that the
    // trigger list took focus passes even with the tabindex deleted, while a real browser would
    // have done nothing. The attribute is read off the SOURCE for that reason, and the Foundry
    // keyboard declaration is read with it — without it Space pauses the game and the arrows
    // pan the canvas behind the open application.
    const triggers = sourceOf('checks/CheckTriggers.svelte');
    const stamp = triggers.indexOf('data-validation-target="checks-triggers"');
    assert.ok(stamp >= 0, 'the trigger list carries the address');
    const element = triggers.slice(stamp, stamp + 200);
    assert.match(element, /tabindex="-1"/u, 'a div takes focus only with an explicit tabindex');
    assert.match(element, /data-keyboard-focus="true"/u, 'and must declare itself to Foundry');
  });
});

describe('ChecksView wires the row action in the order the mechanism needs', () => {
  const host = stripComments(
    readFileSync(resolve(repoRoot, `${SOURCE_ROOT}/checks/ChecksView.svelte`), 'utf8')
  );

  it('passes its own handler to the validation tab', () => {
    assert.match(host, /<ChecksValidationTab[\s\S]*?onSelectIssue=\{selectIssue\}/u);
  });

  it('opens the route BEFORE it awaits the focus move, and announces only after', () => {
    // THE ORDER IS THE MECHANISM. `onOpenActivity` is the router's synchronous state write, and
    // the helper defers with `queueMicrotask` so Svelte has flushed it and the destination
    // panel exists when the query runs; awaiting the focus move first would query a panel that
    // is not in the DOM. And the announcement is derived FROM the element the helper resolved,
    // so it cannot be written before focus moved.
    const body = /async function selectIssue\([\s\S]*?\n {2}\}/u.exec(host);
    assert.ok(Boolean(body), 'the row-action handler could not be located');
    const route = body[0].indexOf('onOpenActivity(');
    const focus = body[0].indexOf('await focusValidationTarget(');
    const announce = body[0].indexOf('issueAnnouncement =');
    assert.ok(route >= 0 && focus >= 0 && announce >= 0, 'all three steps must be present');
    assert.ok(route < focus, 'the route must be opened before the focus move is awaited');
    assert.ok(focus < announce, 'the announcement must be written after the focus move resolved');
  });

  it('hosts the live region OUTSIDE the route switch, so the route change cannot unmount it', () => {
    // The defect this shape exists to prevent: the surface that would otherwise host the region
    // is inside `{#if activity === 'validation'}`, and the row action's whole job is to leave
    // that branch — so the region would be unmounted in the same update that was supposed to
    // announce.
    const region = host.indexOf('data-checks-issue-announcement');
    const chain = host.indexOf("{#if activity === 'validation'}");
    assert.ok(region >= 0, 'the live region must exist');
    assert.ok(chain >= 0, 'the route switch must exist');
    assert.ok(region < chain, 'the region sits outside the route switch');
    assert.match(host, /data-checks-issue-announcement[\s\S]{0,120}\{#if issueAnnouncement\}/u);
  });
});
