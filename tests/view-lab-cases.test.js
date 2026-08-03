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
import { dirname, relative, resolve } from 'node:path';
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

import { buildLabContent } from './view-lab/world/labContent.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The fixture world, for checks that must derive a case's truth rather than trust its author. */
const content = buildLabContent();

/** The viewport the capture driver uses; asserted here so the arithmetic is gated, not just run. */
const CAPTURE_VIEWPORT = { width: 1920, height: 1080 };

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

/**
 * Hooks the CAPTURE DRIVER hard-codes, which appear in no case and were therefore guarded by
 * nothing. Renaming `.manager-nav-button` breaks every label step at once — 92 of them across ~60
 * cases — with `npm test` green, because the registry never mentions it. Same for the route probe.
 */
const RAIL_BUTTON_CLASS = 'manager-nav-button';
const DRIVER_HOOKS = [
  RAIL_BUTTON_CLASS, // `runSteps` clicks every rail label through this — 1 file
  'data-manager-view', // the attribute the `expectView` probe reads — 1 file
  'fabricate-app-shell', // the player readiness root — 1 file
  'data-active-tab', // the attribute `expectTab` reads — 1 file
  // `fabricate-manager` is deliberately NOT here. It is the `expectView` probe's root, but it is
  // also a styling scope used in ten components, so a presence check over the tree would stay green
  // long after the root element stopped carrying it — the weak-check shape this file keeps finding.
  // Guarding it properly means asserting it is a class ATTRIBUTE on the manager root specifically,
  // which is worth doing and is not done here rather than being pretended at.
];

/**
 * Every tracked file that can carry a UI hook, keyed by path so a check can be scoped to the
 * component that actually renders the thing rather than to the whole tree. Scoping is what stops a
 * check passing on a coincidence, which has happened three times in this file.
 *
 * Includes : some nav ids are declared in a plain module rather than a component.
 */
function trackedRenderSources() {
  return new Map(
    tracked
      .filter(
        (file) =>
          file.endsWith('.svelte') ||
          file === 'lang/en.json' ||
          (file.startsWith('src/ui/') && file.endsWith('.js'))
      )
      .map((file) => [file, readFileSync(resolve(ROOT, file), 'utf8')])
  );
}

/**
 * The files that could legitimately declare a nav item id: whichever component builds the id
 * template, plus the modules it imports by relative path.
 *
 * One hop, not a full closure. A nav list is either inline in the component or in a module beside
 * it, and widening further starts readmitting the coincidences this scoping exists to exclude.
 *
 * @param {Map<string, string>} sources Tracked render sources.
 * @param {string} template The id-building fragment, e.g. `manager-crafting-nav-${`.
 * @returns {Array<[string, string]>} `[path, text]` pairs to search.
 */
function navDeclarationScope(sources, template) {
  const builders = [...sources].filter(([, text]) => text.includes(template));
  const scope = new Map(builders);
  for (const [file, text] of builders) {
    for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const resolved = normalizePath(
        relative(ROOT, resolve(dirname(resolve(ROOT, file)), match[1]))
      );
      if (sources.has(resolved)) scope.set(resolved, sources.get(resolved));
    }
  }
  return [...scope];
}

/** Selector tokens are matched as regular expressions, so their own metacharacters must not be. */
function escapeForRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

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
  const sources = trackedRenderSources();
  const haystack = [...sources.values()].join('\n');

  const missing = [];
  const VERBS = ['select', 'fill', 'scroll', 'upload'];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps ?? []) {
      if (typeof step === 'string') {
        // Scoped to the component that RENDERS the rail, not the whole tree. The eight rail labels
        // are `Crafting`, `Components`, `Essences`, `Tools`, `Gathering` and friends — common
        // English words that occur all over a 300-file haystack, so an unscoped `includes` could
        // never fail. Demonstrated: deleting the entire manager rail still resolved all eight, out
        // of `lang/en.json` and unrelated components, leaving 92 steps across ~60 cases unguarded.
        const railFiles = [...sources].filter(([, text]) => text.includes(RAIL_BUTTON_CLASS));
        if (railFiles.length === 0) {
          missing.push(`${viewCase.id}: nothing renders "${RAIL_BUTTON_CLASS}" any more`);
        } else if (!railFiles.some(([, text]) => text.includes(step))) {
          missing.push(
            `${viewCase.id}: rail label "${step}" appears in no component that renders ` +
              `"${RAIL_BUTTON_CLASS}" (${railFiles.map(([file]) => file).join(', ')})`
          );
        }
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
      //
      // Scoped to the file that BUILDS those ids, exactly as the editor-tab branch above is. This
      // branch used to search the whole tree, which is the pass-on-a-coincidence failure that branch
      // exists to prevent — found by mutation: renaming `gatheringNavItems`' `id: 'tasks'` in
      // `CraftingSystemManagerRoot.svelte` left the guard green, because `id: 'tasks'` also occurs in
      // `GatheringDetailTabs.svelte`, which is a PLAYER-app component that has nothing to do with the
      // manager rail. Three nav ids were in that state: tasks, encounters, travel.
      const navId = /^#manager-(crafting|gathering)-nav-(.+)$/.exec(step.selector);
      if (navId) {
        const [, group, id] = navId;
        // The scope is the builder PLUS what it imports: the gathering items are declared inline in
        // the root, but the crafting ones live in `crafting/craftingNav.js`, which the root pulls
        // in. Builder-only would reject every crafting nav id; whole-tree would accept anything.
        const scope = navDeclarationScope(sources, `manager-${group}-nav-\${`);
        if (scope.length === 0) {
          missing.push(
            `${viewCase.id}: selector "${step.selector}" (no component builds manager-${group}-nav-* ids)`
          );
        } else if (!scope.some(([, text]) => text.includes(`id: '${id}'`))) {
          missing.push(
            `${viewCase.id}: selector "${step.selector}" (${scope
              .map(([file]) => file)
              .join(', ')} declares no "${id}" nav item)`
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
        // Anchored on a word boundary at BOTH ends, not a bare substring. `haystack.includes(token)`
        // passes on a coincidence whenever one hook name contains another:
        //
        //   prefix — renaming the real `data-component-select` left `data-component-select-all-page`
        //     in a sibling component, so the substring still matched and the guard stayed green over
        //     six broken selectors.
        //   suffix — deleting the `.inventory-card` CLASS while keeping the `data-inventory-card`
        //     ATTRIBUTE left the token `inventory-card` still matching, because the attribute name
        //     ENDS with it. A trailing-only boundary does not see this.
        //
        // Both were found by mutation, the second after the first was "fixed". `[\w-]` is what an
        // attribute or class name continues with, so requiring neither neighbour to be one is what
        // makes a token stop matching a longer name that merely contains it.
        const bounded = new RegExp(String.raw`(?<![\w-])${escapeForRegExp(token)}(?![\w-])`);
        if (bounded.test(haystack)) continue;
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

test('the hooks the capture driver hard-codes still exist in the UI', () => {
  // These are the load-bearing selectors no case names, so nothing else can notice them going away.
  // `scripts/view-lab-screenshots.mjs` clicks every rail label through `.manager-nav-button` and
  // reads both route probes off the two roots — a rename there breaks the whole registry at once
  // while every other assertion in this file still passes.
  // Comments are stripped first, and that is not fastidiousness — it is a bug this check had.
  // A comment I wrote in `FabricateAppRoot.svelte` mentioned `data-manager-view` by name to explain
  // what the new player attribute mirrors. Renaming the REAL attribute then left the guard green,
  // because the prose still matched. A check whose haystack includes its own documentation cannot
  // fail on a rename that only the documentation survives.
  const haystack = [...trackedRenderSources().values()]
    .join('\n')
    .replaceAll(/<!--[\S\s]*?-->/g, '')
    .replaceAll(/\/\*[\S\s]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '');
  const absent = DRIVER_HOOKS.filter(
    (hook) => !new RegExp(String.raw`(?<![\w-])${hook}(?![\w-])`).test(haystack)
  );
  assert.deepEqual(
    absent,
    [],
    'the capture driver hard-codes these hooks and no case references them, so nothing else would ' +
      'catch their removal. Update `scripts/view-lab-screenshots.mjs` alongside the rename:\n  ' +
      absent.join('\n  ')
  );
});

test('no two cases claiming exact reach produce the same frame', () => {
  // Identical inputs produce a byte-identical PNG, by construction. So two cases that both claim
  // `exact` from the same tuple cannot both be landing on their own counterpart's condition — at
  // least one is publishing a frame of something else under its name.
  //
  // This is mechanical where reading the registry is not. Three separate overclaims of exactly this
  // shape survived hand review: `manager-default-selection` / `-selected-normal` / `-rail-expanded`
  // are three different smoke screens sharing one tuple, `manager-component-edit-salvage` claimed a
  // ROUTED salvage editor while opening the same Simple-mode component as `-salvage-simple`, and
  // `manager-tags-categories-stacked` pinned the normal geometry while declaring itself responsive.
  //
  // A `window` case sharing a tuple with an `exact` one is fine and deliberately not flagged: it has
  // already declared that it falls short, which is the honest state for a case still to be reached.
  const byTuple = new Map();
  for (const viewCase of VIEW_LAB_CASES) {
    if (!viewCase.publish || viewCase.reaches !== 'exact') continue;
    const tuple = JSON.stringify([
      viewCase.app,
      viewCase.query ?? {},
      viewCase.steps ?? [],
      viewCase.position ?? null,
    ]);
    byTuple.set(tuple, [...(byTuple.get(tuple) ?? []), viewCase.id]);
  }

  const collisions = [...byTuple.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ids.join(' == '));

  assert.deepEqual(
    collisions,
    [],
    'these cases all claim `exact` while rendering identical frames, so at least one is publishing ' +
      'a picture of something other than what it names. Give each the steps, query or geometry that ' +
      'distinguishes it, or downgrade the ones that fall short to `window`:\n  ' +
      collisions.join('\n  ')
  );
});

test('every crafting case claims exactly the resolution-mode body it renders', () => {
  // The crafting cases carry a per-MODE `sourceMatches` pattern so that editing
  // `detail/ProgressiveBody.svelte` selects the four progressive frames rather than all 27. That
  // narrowing is only safe while each case's declared mode matches the mode it actually renders,
  // and the case list is hand-maintained — so derive the truth from the fixture instead.
  //
  // `resolutionMode` is a SYSTEM property (`labContent.js`), so a case's mode is the mode of the
  // system owning the recipe its steps select. A case that opens no recipe detail renders no body
  // and must claim none.
  const modeOfSystem = new Map(
    content.systems.map((system) => [system.id, system.resolutionMode ?? null])
  );
  const systemOfRecipe = new Map(
    content.recipes.map((recipe) => [recipe.id, recipe.craftingSystemId])
  );
  const MODE_PATTERN_FILES = {
    simple: 'SimpleRecipeBody',
    routedByIngredients: 'IngredientRoutedBody',
    routedByCheck: 'RoutedByCheckBody',
    progressive: 'ProgressiveBody',
  };

  // `RegExp.source` escapes every forward slash, so a literal `apps/crafting` never matches it.
  // Comparing against the unescaped form is what makes this check non-vacuous — the first draft
  // examined zero cases and passed.
  const plain = (pattern) => pattern.source.replaceAll('\\', '');

  const examined = [];
  const wrong = [];
  for (const viewCase of VIEW_LAB_CASES) {
    const claimsCrafting = viewCase.sourceMatches.some((pattern) =>
      plain(pattern).includes('apps/crafting')
    );
    if (!claimsCrafting) continue;
    examined.push(viewCase.id);

    const step = (viewCase.steps ?? []).find(
      (entry) => typeof entry === 'object' && /data-recipe-id="([^"]+)"/.test(entry.selector ?? '')
    );
    const recipeId = step ? /data-recipe-id="([^"]+)"/.exec(step.selector)[1] : null;
    const expected = recipeId ? (modeOfSystem.get(systemOfRecipe.get(recipeId)) ?? null) : null;

    for (const [mode, file] of Object.entries(MODE_PATTERN_FILES)) {
      const claimed = viewCase.sourceMatches.some(
        (pattern) => plain(pattern).includes(file) && !plain(pattern).includes('?!')
      );
      const shouldClaim = expected === mode;
      if (claimed !== shouldClaim) {
        wrong.push(
          `${viewCase.id}: renders ${expected ?? 'no body'} but ${claimed ? 'claims' : 'does not claim'} ${mode}`
        );
      }
    }
  }

  assert.deepEqual(
    wrong,
    [],
    'these crafting cases declare a resolution-mode body they do not render, or omit the one they ' +
      'do — either way the changed-file mapping sends a reviewer the wrong frames:\n  ' +
      wrong.join('\n  ')
  );

  // The check above is only worth anything if it looked at the cases. It did not, in its first
  // draft, and passed clean.
  assert.equal(
    examined.length,
    28,
    `expected the 28 crafting cases to be examined, saw ${examined.length}`
  );
  assert.ok(
    examined.filter((id) =>
      getCaseById(id).sourceMatches.some((pattern) =>
        /SimpleRecipeBody|IngredientRoutedBody|RoutedByCheckBody|ProgressiveBody/.test(
          pattern.source.replaceAll('\\', '')
        )
      )
    ).length >= 20,
    'expected most crafting cases to claim a resolution-mode body'
  );
});

test('no case tags itself with a second, competing reach vocabulary', () => {
  // `reaches` is this registry's honesty contract, and the index page prints `kinds` and `reaches`
  // into one tag list. So a kind that reads like a reach value is not a label — it is a SECOND
  // claim about the same thing, free to contradict the first.
  //
  // It did. `window-only` survived on 85 cases while only 5 still reached `window`, so most of the
  // registry would have rendered tagged `exact` and `window-only` at once, on the very page whose
  // job is to tell a reviewer what each frame is evidence of. It was defined nowhere and consumed
  // by nothing but the filter.
  const RESERVED = new Set(['exact', 'window', 'beyond', 'window-only', 'state', 'screen']);
  const offenders = VIEW_LAB_CASES.flatMap((viewCase) =>
    (viewCase.kinds ?? [])
      .filter((kind) => RESERVED.has(kind))
      .map((kind) => `${viewCase.id}: ${kind}`)
  );

  assert.deepEqual(
    offenders,
    [],
    'these cases carry a `kinds` entry from the reach vocabulary, which the index renders beside ' +
      'the real `reaches` value and which is free to contradict it. Say it once, in `reaches`:\n  ' +
      offenders.join('\n  ')
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
