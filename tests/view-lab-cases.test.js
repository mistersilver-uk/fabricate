/**
 * Invariants for the View Lab case registry.
 *
 * These exist because the registry's failure modes are all silent. A `sourceMatches` pattern that
 * matches nothing selects no evidence and the gate still passes. A step naming a button that was
 * renamed clicks nothing and captures the wrong screen. A viewport a few pixels short lets Foundry
 * clamp the window and the frame is quietly the wrong size. None of those announce themselves in a
 * screenshot — which is exactly why they belong in `npm test` rather than in the capture run.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  APP_CHROME,
  FOUNDRY_CHROME_SPEC,
  minimumViewportFor,
} from '../scripts/lib/foundryChromeSpec.js';
import {
  FALLBACK_CASE_ID,
  VIEW_LAB_CASES,
  caseIds,
  fallbackCase,
  getCaseById,
  hasUiChanges,
  isUiFile,
  labelForCaseId,
  mapChangedFilesToCases,
  normalizePath,
  publishableCases,
} from '../scripts/lib/viewLabCases.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The viewport the capture driver uses; asserted here so the arithmetic is gated, not just run. */
const CAPTURE_VIEWPORT = { width: 1920, height: 1080 };

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

test('case ids are unique and non-empty', () => {
  assert.equal(new Set(caseIds).size, caseIds.length, 'duplicate case id');
  for (const id of caseIds) {
    assert.match(id, /^[a-z][a-z0-9-]*$/, `case id "${id}" must be lowercase kebab-case`);
  }
});

test('every case names a window the chrome spec knows how to build', () => {
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(
      APP_CHROME[viewCase.app],
      `case "${viewCase.id}" targets unknown app "${viewCase.app}"`
    );
    assert.ok(viewCase.label.trim().length > 0, `case "${viewCase.id}" has no label`);
    assert.equal(labelForCaseId(viewCase.id), viewCase.label);
    assert.ok(
      viewCase.readySelector.trim().length > 0,
      `case "${viewCase.id}" has no readySelector`
    );
  }
});

test('every sourceMatches pattern resolves to at least one tracked file', () => {
  // The anti-drift invariant carried over from the first View Lab attempt: a pattern that matches
  // nothing is indistinguishable from a pattern that matches everything until a PR needs it.
  const orphans = [];
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(viewCase.sourceMatches.length > 0, `case "${viewCase.id}" declares no sourceMatches`);
    for (const pattern of viewCase.sourceMatches) {
      if (!tracked.some((file) => pattern.test(normalizePath(file)))) {
        orphans.push(`${viewCase.id}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(
    orphans,
    [],
    `these patterns match no tracked file — a rename probably stranded them:\n  ${orphans.join('\n  ')}`
  );
});

test('every interaction step names text that exists in the manager UI', () => {
  // Steps are clicked by accessible name. A renamed rail entry would otherwise click nothing, and
  // the case would capture whichever screen happened to be showing.
  // Includes `src/ui/**/*.js`: the crafting sub-tab ids the selector steps target are declared in
  // `crafting/craftingNav.js`, not in any component file.
  const sources = new Map(
    tracked
      .filter(
        (file) =>
          file.endsWith('.svelte') ||
          file === 'lang/en.json' ||
          (file.startsWith('src/ui/') && file.endsWith('.js'))
      )
      .map((file) => [file, readFileSync(resolve(ROOT, file), 'utf8')])
  );
  const haystack = [...sources.values()].join('\n');

  const missing = [];
  const VERBS = ['select', 'fill', 'scroll'];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps ?? []) {
      if (typeof step === 'string') {
        if (!haystack.includes(step)) missing.push(`${viewCase.id}: label "${step}"`);
        continue;
      }
      // The runner dispatches on which verb key is present, so a typo'd key (`selectOption`,
      // `value`, `text`) silently degrades the step to a plain click and the case captures the
      // screen it started on. Only the known verbs may appear alongside `selector`.
      const extra = Object.keys(step).filter((key) => key !== 'selector' && !VERBS.includes(key));
      if (extra.length > 0) {
        missing.push(
          `${viewCase.id}: step for "${step.selector}" has unknown key(s) ${extra.join(', ')} — ` +
            `the runner would silently click instead. Known verbs: ${VERBS.join(', ')}`
        );
      }
      if (VERBS.filter((verb) => verb in step).length > 1) {
        missing.push(`${viewCase.id}: step for "${step.selector}" names more than one verb`);
      }
      // An editor tab strip renders `id={`<family>-tab-${tab.id}`}`, so neither half of the
      // selector appears literally. Both halves still have to be checked, and checking them
      // against the WHOLE tree would pass on a coincidence — `'overview'` occurs everywhere. So
      // locate the file that builds those ids, and require the tab id to be declared in THAT file.
      const editorTab = /^#([a-z-]+)-tab-([a-z-]+)$/.exec(step.selector);
      if (editorTab) {
        const [, family, tabId] = editorTab;
        const builders = [...sources].filter(([, text]) => text.includes(`${family}-tab-\${`));
        if (builders.length === 0) {
          missing.push(
            `${viewCase.id}: selector "${step.selector}" (no component builds ${family}-tab-* ids)`
          );
        } else if (!builders.some(([, text]) => text.includes(`'${tabId}'`))) {
          missing.push(
            `${viewCase.id}: selector "${step.selector}" (${builders
              .map(([file]) => file)
              .join(', ')} declares no "${tabId}" tab)`
          );
        }
        continue;
      }
      // The two rail groups build their subitem ids from a nav item's id
      // (`manager-crafting-nav-${id}` / `manager-gathering-nav-${id}`), so the literal selector
      // never appears in source; the id stem is what a rename would move.
      const navId = /^#manager-(?:crafting|gathering)-nav-(.+)$/.exec(step.selector);
      if (navId) {
        const token = `id: '${navId[1]}'`;
        if (!haystack.includes(token)) {
          missing.push(
            `${viewCase.id}: selector "${step.selector}" (nothing in src matches "${token}")`
          );
        }
        continue;
      }
      // Everything else is a compound of stable hooks: literal element ids, class names, and
      // `data-*` attribute names. EVERY hook in the selector is checked, not just the first —
      // a compound whose leading class survives a rename of its trailing attribute would
      // otherwise match a broader element and capture the wrong row. Attribute VALUES are not
      // hooks: they are fixture ids, which live in `tests/view-lab/world/`, not in `src/`.
      // Values are stripped BEFORE extraction, not filtered afterwards: a quoted uuid such as
      // `[data-essence-carrier="Item.sm-coal"]` otherwise reads `.sm-coal` as a class name and
      // fails against a tree that was never supposed to contain it.
      const withoutValues = step.selector.replaceAll(/=\s*("[^"]*"|'[^']*')/g, '');
      const tokens = [
        ...withoutValues.matchAll(/#([a-z][\w-]*)|\.([a-z][\w-]*)|\[([a-z-]+)/gi),
      ].map((match) => match[1] ?? match[2] ?? match[3]);
      if (tokens.length === 0) {
        missing.push(`${viewCase.id}: selector "${step.selector}" has no verifiable token`);
        continue;
      }
      for (const token of tokens) {
        if (haystack.includes(token)) continue;
        missing.push(
          `${viewCase.id}: selector "${step.selector}" (nothing in src matches "${token}")`
        );
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    `these steps reference UI that no longer exists:\n  ${missing.join('\n  ')}`
  );
});

test('every case declaring an expectView targets the manager', () => {
  // `data-manager-view` only exists on the manager root, so an expectView on a player case would
  // silently never be checked.
  for (const viewCase of VIEW_LAB_CASES) {
    if (!viewCase.expectView) continue;
    assert.equal(
      viewCase.app,
      'fabricate-crafting-system-manager',
      `case "${viewCase.id}" declares expectView but is not a manager case`
    );
  }
  // Every manager case must declare one: it is the only guard against capturing the wrong screen.
  for (const viewCase of VIEW_LAB_CASES) {
    if (viewCase.app !== 'fabricate-crafting-system-manager') continue;
    assert.ok(
      viewCase.expectView,
      `manager case "${viewCase.id}" must declare expectView, or a mis-click captures silently`
    );
  }
});

test('the capture viewport clears the max-height Foundry clamps windows to', () => {
  // `.application { max-height: calc(100vh - 1.5 * var(--hotbar-height)) }`. `_updatePosition`
  // applies that clamp with no signal, so a viewport a few pixels short yields a green run and a
  // wrong-sized frame.
  const ceiling = FOUNDRY_CHROME_SPEC.maxHeightFor(CAPTURE_VIEWPORT.height);
  for (const appId of Object.keys(APP_CHROME)) {
    const minimum = minimumViewportFor(appId);
    assert.ok(
      CAPTURE_VIEWPORT.height >= minimum.height,
      `${appId} needs a viewport at least ${minimum.height}px tall; the driver uses ${CAPTURE_VIEWPORT.height}px`
    );
    assert.ok(
      CAPTURE_VIEWPORT.width >= minimum.width,
      `${appId} needs a viewport at least ${minimum.width}px wide`
    );
    assert.ok(
      APP_CHROME[appId].position.height <= ceiling,
      `${appId} declares ${APP_CHROME[appId].position.height}px but the ceiling at this viewport is ${ceiling}px`
    );
  }
});

test('exactly one fallback case exists and it publishes', () => {
  const fallback = fallbackCase();
  assert.ok(fallback, `FALLBACK_CASE_ID "${FALLBACK_CASE_ID}" names no case`);
  assert.equal(
    fallback.publish,
    true,
    'the fallback case must publish or a broad change yields no evidence'
  );
});

test('getCaseById round-trips and rejects unknown ids', () => {
  for (const viewCase of VIEW_LAB_CASES) assert.equal(getCaseById(viewCase.id), viewCase);
  assert.equal(getCaseById('no-such-case'), null);
  assert.equal(labelForCaseId('no-such-case'), null);
});

test('UI file detection matches the documented rule', () => {
  assert.ok(isUiFile('src/ui/svelte/apps/crafting/CraftingView.svelte'));
  assert.ok(isUiFile('styles/fabricate.css'));
  assert.ok(isUiFile('src/ui/appFactory.js'));
  assert.ok(!isUiFile('lang/en.json'));
  assert.ok(!isUiFile('src/systems/CraftingEngine.js'));
  // A lang-only change needs no evidence; a lang change alongside a render file does.
  assert.equal(hasUiChanges(['lang/en.json']), false);
  assert.equal(
    hasUiChanges(['lang/en.json', 'src/ui/svelte/apps/crafting/CraftingView.svelte']),
    true
  );
});

test('changed files map to the windows they affect', () => {
  const ids = (files) => mapChangedFilesToCases(files).map((viewCase) => viewCase.id);

  // A gathering change selects the gathering screens and nothing else.
  const gathering = ids(['src/ui/svelte/apps/gathering/GatheringView.svelte']);
  assert.ok(gathering.length > 0, 'a gathering change must select at least one case');
  assert.ok(
    gathering.every((id) => id.includes('gathering')),
    `gathering change selected unrelated cases: ${gathering.join(', ')}`
  );

  assert.deepEqual(ids(['lang/en.json']), []);

  // A shared primitive or a global stylesheet can change every screen. Selecting all of them would
  // bury the reviewer, so those signals map to one player screen and one manager screen.
  assert.deepEqual(ids(['styles/fabricate.css']).sort(), [
    'fabricate-app-shell',
    'manager-components-normal',
  ]);

  // An unmatched render file still yields evidence rather than none.
  assert.deepEqual(ids(['src/ui/svelte/apps/SomeBrandNewRoot.svelte']), [FALLBACK_CASE_ID]);
});

test('every publishable case is in the registry order the driver iterates', () => {
  const publishable = publishableCases();
  assert.ok(publishable.length > 0);
  assert.deepEqual(
    publishable.map((viewCase) => viewCase.id),
    VIEW_LAB_CASES.filter((viewCase) => viewCase.publish).map((viewCase) => viewCase.id)
  );
});

test('manager cases pin the geometry their smoke label was captured at', () => {
  // The smoke does not use one manager size. `setManagerWindowSize` is called with 1280x820 for most
  // frames, 1280x900 for some, 880x900 for the narrow ones, and 1000x700 / 900x700 / 614x704 for the
  // Tool Studio parity set. A case captured at the wrong one cannot be compared with its counterpart:
  // a different content height changes the rail and inspector layout, and every difference then looks
  // like a rendering defect rather than a size difference.
  for (const viewCase of VIEW_LAB_CASES) {
    if (viewCase.app !== 'fabricate-crafting-system-manager') continue;
    assert.ok(viewCase.position, `manager case "${viewCase.id}" must pin its capture geometry`);
    assert.ok(
      Number.isInteger(viewCase.position.width) && viewCase.position.width > 0,
      `manager case "${viewCase.id}" has a bad capture width`
    );
    assert.ok(
      Number.isInteger(viewCase.position.height) && viewCase.position.height > 0,
      `manager case "${viewCase.id}" has a bad capture height`
    );
  }
});

test('every case declares how far it actually gets', () => {
  // `exact` — lands on the smoke counterpart's own condition, so a side-by-side is meaningful.
  // `window` — reaches the right application window but not that counterpart's specific condition;
  //   useful evidence and known remaining work, accounted for by a class-level entry in the
  //   known-gaps register in `scripts/README.md` rather than by 71 near-identical case comments.
  // `beyond` — a condition the smoke never walks, so there is no counterpart to fall short of.
  //
  // The values were `state` / `screen` before plan-review: `state` collided with Svelte's `$state`
  // and with the spec's own broader "the state it expects" phrasing one requirement over, and
  // `screen` collided with this file's own definition of a screen as the whole captured window.
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(
      ['exact', 'window', 'beyond'].includes(viewCase.reaches),
      `case "${viewCase.id}" must declare reaches: 'exact' | 'window' | 'beyond'`
    );
  }
});

test('every case records the smoke labels it corresponds to', () => {
  // The pairing is what makes a side-by-side possible, and what makes "which smoke frame does this
  // replace?" answerable without reading the capture walk. A `beyond` case has no counterpart by
  // definition, and must say so with an EMPTY array rather than by omitting the field — the
  // difference between "the smoke does not cover this" and "nobody filled this in".
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(Array.isArray(viewCase.smokeLabels), `case "${viewCase.id}" declares no smokeLabels`);
    if (viewCase.reaches === 'beyond') {
      assert.equal(
        viewCase.smokeLabels.length,
        0,
        `case "${viewCase.id}" reaches beyond the smoke but claims smoke labels`
      );
      continue;
    }
    assert.ok(viewCase.smokeLabels.length > 0, `case "${viewCase.id}" declares no smokeLabels`);
  }
});
