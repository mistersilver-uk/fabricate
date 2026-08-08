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

/**
 * The step keys `runSteps` dispatches on. Hoisted out of the step test so the drift check below can
 * compare them against the runner's own lists.
 */
const VERBS = ['select', 'fill', 'scroll', 'upload'];

/**
 * `modifiers` is a MODIFIER, not a verb: it does not choose which action runs, it changes how the
 * default click runs. Keeping it out of `VERBS` is load-bearing twice over — the mutual-exclusion
 * check counts the VERBS present, so admitting it there would reject the legal `{selector,
 * modifiers}` step as naming two verbs; and the pairing rule below is precisely that `modifiers`
 * may accompany none of them.
 */
const MODIFIERS_KEY = 'modifiers';

/** The click modifiers Playwright accepts, mirroring `CLICK_MODIFIERS` in the capture driver. */
const CLICK_MODIFIERS = ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'];

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
      const extra = Object.keys(step).filter(
        (key) => key !== 'selector' && key !== MODIFIERS_KEY && !VERBS.includes(key)
      );
      if (extra.length > 0) {
        missing.push(
          `${viewCase.id}: step for "${step.selector}" has unknown key(s) ${extra.join(', ')} — ` +
            `the runner would silently click instead. Known verbs: ${VERBS.join(', ')}; ` +
            `known modifier: ${MODIFIERS_KEY}`
        );
      }
      if (VERBS.filter((verb) => verb in step).length > 1) {
        missing.push(`${viewCase.id}: step for "${step.selector}" names more than one verb`);
      }
      // The runner rejects both of these too, but that throw only fires during a capture run, which
      // is not an `npm test` gate — so a bad step would sit green in the registry until somebody
      // spent twenty minutes discovering it. Both rules are therefore enforced HERE as well.
      if (MODIFIERS_KEY in step) {
        // A modifier can only ride on a click. Playwright's `selectOption`, `fill`, `setInputFiles`
        // and `scrollIntoViewIfNeeded` accept no `modifiers` option, so the pairing is not a
        // stricter step — it is an INERT one, capturing the unmodified state under the name of the
        // modified one.
        const paired = VERBS.filter((verb) => verb in step);
        if (paired.length > 0) {
          missing.push(
            `${viewCase.id}: step for "${step.selector}" pairs \`${MODIFIERS_KEY}\` with ` +
              `${paired.join(', ')} — a modifier applies only to a click, so it would be dropped ` +
              `and the case would capture the unmodified state. Split it into two steps.`
          );
        }
        const names = Array.isArray(step[MODIFIERS_KEY]) ? step[MODIFIERS_KEY] : [];
        if (names.length === 0) {
          missing.push(
            `${viewCase.id}: step for "${step.selector}" must declare \`${MODIFIERS_KEY}\` as a ` +
              `non-empty array of ${CLICK_MODIFIERS.join(', ')}`
          );
        }
        for (const name of names.filter((entry) => !CLICK_MODIFIERS.includes(entry))) {
          missing.push(
            `${viewCase.id}: step for "${step.selector}" names unknown modifier ` +
              `${JSON.stringify(name)} — Playwright accepts ${CLICK_MODIFIERS.join(', ')}`
          );
        }
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

test('the modifier vocabulary this file enforces is the one the capture driver enforces', () => {
  // The pairing rule and the modifier names are checked twice: statically above, and in `runSteps`
  // at capture time. Only the static half runs in `npm test`, and it is a hand-copied list — so a
  // modifier added to the driver, or a verb that stops being incompatible with one, would leave the
  // two halves disagreeing with nothing to say so. Read the driver's own arrays instead of trusting
  // the copy. The verb list is the same comparison in the other direction: the driver refuses to
  // pair `modifiers` with exactly the verbs this file knows about, so a sixth verb added there
  // without being added here would go unchecked at the only point that gates a PR.
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  const declaredArray = (name) => {
    const match = new RegExp(String.raw`const ${name} = \[([^\]]*)]`).exec(driver);
    assert.ok(match, `\`scripts/view-lab-screenshots.mjs\` no longer declares \`${name}\``);
    return [...match[1].matchAll(/'([^']+)'/g)].map(([, entry]) => entry).sort();
  };

  assert.deepEqual(
    declaredArray('CLICK_MODIFIERS'),
    [...CLICK_MODIFIERS].sort(),
    'the driver accepts a different set of click modifiers than this file admits'
  );
  assert.deepEqual(
    declaredArray('MODIFIER_INCOMPATIBLE_VERBS'),
    [...VERBS].sort(),
    'the driver refuses to pair `modifiers` with a different set of verbs than this file knows'
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

// ───────────────────────────────────────────────────────────────────────────────────────────────
// What a change to the lab's OWN inputs costs (issue 1000).
//
// Measured on PR #991: 157 frames, 20m29s, against a 25-minute job cap, re-run on every rebase —
// because any path under `tests/view-lab/` or this registry selected the whole corpus. These tests
// pin both halves of the narrowing that replaced it: the frames it is now allowed to skip, and the
// far larger set of inputs for which skipping any frame is still forbidden.
//
// The fail-safe direction is towards MORE frames. An input nobody has attributed, a patch that does
// not parse, a patch that does not describe this checkout — every one of them is an ALL, because
// the failure this rule exists to prevent is a PR that invalidates the corpus and publishes no
// evidence of it. `mapChangedFilesToCases(['tests/view-lab/world/labContent.js']) -> []` is the
// regression, verified as real before the blanket rule existed.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const REGISTRY_PATH = 'scripts/lib/viewLabCases.js';
const LAB_ACTORS_PATH = 'tests/view-lab/world/labActors.js';
const RUNNER_PATH = 'scripts/view-lab-screenshots.mjs';
const sourceOf = (path) => readFileSync(resolve(ROOT, path), 'utf8').split('\n');
const registrySource = sourceOf(REGISTRY_PATH);
const labActorsSource = sourceOf(LAB_ACTORS_PATH);

/** @returns {string[]} The ids a changed set selects, in registry order. */
const selectedIds = (files, options) =>
  mapChangedFilesToCases(files, options).map((viewCase) => viewCase.id);

/**
 * The 1-based line of a file holding an exact piece of text, asserted present so that a rename
 * fails the test loudly rather than quietly turning it into an assertion about line 0.
 *
 * @param {string[]} source The file, by line.
 * @param {string} text The whole line.
 * @param {string} where The file's path, for the failure message.
 * @returns {number} Its 1-based line number.
 */
function lineOf(source, text, where) {
  const index = source.indexOf(text);
  assert.notEqual(index, -1, `${where} no longer contains the line: ${text}`);
  return index + 1;
}

const registryLineOf = (text) => lineOf(registrySource, text, 'the registry');
const labActorsLineOf = (text) => lineOf(labActorsSource, text, LAB_ACTORS_PATH);

/**
 * A unified diff claiming those 1-based lines of a file were just ADDED, with the three lines of
 * context either side that `git` emits, and contiguous lines grouped into one hunk as it groups
 * them.
 *
 * The `+` lines carry the file's CURRENT text, which is exactly what a patch for a change that has
 * landed looks like — and, together with the context, is the sequence the selector locates each
 * hunk by. One builder for every attributed input rather than one per input: the shape of the diff
 * is the same fact whichever file it describes.
 *
 * @param {string[]} source The file the patch describes, by line.
 * @param {number[]} lineNumbers Lines to mark as added.
 * @returns {string} The patch.
 */
function patchAdding(source, lineNumbers) {
  const runs = [];
  for (const line of [...new Set(lineNumbers)].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && line === last.at(-1) + 1) last.push(line);
    else runs.push([line]);
  }

  return runs
    .map((run) => {
      const from = Math.max(1, run[0] - 3);
      const to = Math.min(source.length, run.at(-1) + 3);
      const body = [];
      for (let number = from; number <= to; number += 1) {
        body.push(`${run.includes(number) ? '+' : ' '}${source[number - 1]}`);
      }
      return [`@@ -${from},${body.length - run.length} +${from},${body.length} @@`, ...body].join(
        '\n'
      );
    })
    .join('\n');
}

const registryPatch = (lineNumbers) => patchAdding(registrySource, lineNumbers);

/** @returns {object} The `patches` option carrying one patch for one path. */
const patchesFor = (path, patch) => ({ patches: { [path]: patch } });

/** @returns {object} The `patches` option carrying one patch for this registry. */
const registryPatches = (lineNumbers) => patchesFor(REGISTRY_PATH, registryPatch(lineNumbers));

/** @returns {object} The `patches` option carrying one patch for the lab's actor fixture. */
const labActorsPatches = (lineNumbers) =>
  patchesFor(LAB_ACTORS_PATH, patchAdding(labActorsSource, lineNumbers));

/**
 * The 1-based span of the case literal containing an id line, found the way a reader would: up to
 * the factory call that opens it, down to the line that closes it.
 *
 * @param {string} id A case id declared inline in the array.
 * @returns {number[]} Every line number of the literal.
 */
function caseLiteralLines(id) {
  const idLine = registryLineOf(`    id: '${id}',`);
  let start = idLine;
  while (start > 1 && !/^ {2}[A-Za-z]\w*\(\{$/.test(registrySource[start - 1])) start -= 1;
  let end = idLine;
  while (end < registrySource.length && registrySource[end - 1] !== '  }),') end += 1;
  assert.ok(start < idLine && end > idLine, `could not bound the case literal for "${id}"`);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

test('a labRunStates change selects the player windows that render runs — not none, not all', () => {
  // Its whole output is the three actor run containers and the `gatheringBlindRuns` world setting,
  // and only the player window reads either: the Journal in its entirety, the Crafting tab's run
  // summary, the Gathering tab's in-flight rows. The manager renders `game.settings` definitions
  // and touches no actor run flag.
  const selected = selectedIds(['tests/view-lab/world/labRunStates.js']);
  const everything = publishableCases();
  const players = everything.filter((viewCase) => viewCase.app === 'fabricate-app');

  assert.ok(selected.length > 0, 'a run-state change must select evidence, not none');
  assert.ok(
    selected.length < everything.length,
    'a run-state change must not still select every frame'
  );

  // Derived, not listed: EVERY player case and ONLY player cases, so a player case added tomorrow
  // is covered without anyone remembering to add its id anywhere.
  assert.deepEqual(
    selected,
    players.map((viewCase) => viewCase.id)
  );
  assert.ok(
    selected.includes('fabricate-journal'),
    'the Journal is the run browser; it cannot be outside a run-state selection'
  );
});

test('every lab input the registry cannot attribute still selects every publishable case', () => {
  const everything = publishableCases().length;

  // The genuinely global inputs, plus a file nobody has ever heard of: the fail-safe is the
  // DEFAULT, so an input added under `tests/view-lab/` tomorrow is covered before anyone maps it.
  for (const file of [
    'tests/view-lab/world/labContent.js',
    'tests/view-lab/world/labFlags.js',
    'tests/view-lab/world/labActors.js',
    'tests/view-lab/world/labWorld.js',
    'tests/view-lab/foundry/installFoundryShim.js',
    'tests/view-lab/mount.js',
    'tests/view-lab/index.html',
    'tests/view-lab/vite.config.js',
    'tests/view-lab/foundryFrame.js',
    'tests/view-lab/foundryDialog.js',
    'tests/view-lab/labI18n.js',
    'tests/view-lab/cascade.css',
    'tests/view-lab/world/labNobodyHasAttributedThisYet.js',
    'scripts/lib/foundryChromeSpec.js',
    'scripts/view-lab-screenshots.mjs',
  ]) {
    assert.equal(selectedIds([file]).length, everything, `${file} must select every frame`);
  }

  // The regression the whole rule exists to prevent, asserted as itself.
  assert.notDeepEqual(mapChangedFilesToCases(['tests/view-lab/world/labContent.js']), []);
});

test('a registry change with no usable patch selects every publishable case', () => {
  const everything = publishableCases().length;

  // No patch at all — including the one-argument call every other caller makes.
  assert.equal(mapChangedFilesToCases([REGISTRY_PATH]).length, everything);
  assert.equal(selectedIds([REGISTRY_PATH], {}).length, everything);
  assert.equal(selectedIds([REGISTRY_PATH], { patches: {} }).length, everything);

  const idLine = registryLineOf(`    id: '${FALLBACK_CASE_ID}',`);
  const wrongRevision = registryPatch([idLine]).replace(
    registrySource[idLine - 1],
    "    id: 'a-line-this-file-does-not-have',"
  );

  for (const [patch, why] of [
    ['', 'an empty patch'],
    ['   ', 'a blank patch'],
    ['not a diff at all', 'a patch with no hunk header'],
    ['@@ this is not a hunk header @@\n+x', 'an unparseable hunk header'],
    ['@@ -1,1 +1,1 @@\n?x', 'an unknown line marker'],
    [wrongRevision, 'a patch whose lines do not match this checkout'],
  ]) {
    assert.equal(
      selectedIds([REGISTRY_PATH], { patches: { [REGISTRY_PATH]: patch } }).length,
      everything,
      `${why} must select every frame`
    );
  }
});

test('a registry change confined to case literals selects only those cases', () => {
  const inline = caseIds.filter((id) => registrySource.includes(`    id: '${id}',`));
  assert.ok(inline.length > 100, 'expected most cases to be declared inline in the array');

  // One case, sampled across the file so this is not an assertion about its first entry.
  for (const id of [inline[0], inline[Math.floor(inline.length / 2)], inline.at(-1)]) {
    const idLine = registryLineOf(`    id: '${id}',`);
    assert.deepEqual(selectedIds([REGISTRY_PATH], registryPatches([idLine])), [id]);
    // A line elsewhere in the same literal — the label, not the id — attributes the same way.
    assert.deepEqual(selectedIds([REGISTRY_PATH], registryPatches([idLine + 1])), [id]);
  }

  // Two cases, two hunks: the honest answer is two frames, where it used to be 157.
  const [first, second] = [inline[3], inline[40]];
  const bothPatches = registryPatches([
    registryLineOf(`    id: '${first}',`),
    registryLineOf(`    id: '${second}',`),
  ]);
  assert.deepEqual(selectedIds([REGISTRY_PATH], bothPatches), [first, second]);
});

test('ADDING a case to the registry selects that one case', () => {
  // The shape a diff has when a case is added: every line of the literal arrives as a `+`.
  const id = 'coverage-experimental-off-player';
  assert.deepEqual(selectedIds([REGISTRY_PATH], registryPatches(caseLiteralLines(id))), [id]);
});

test('a registry change OUTSIDE a case literal selects every publishable case', () => {
  const everything = publishableCases().length;

  // A shared helper, a pattern constant, the array's own spread of a case factory, and the mapping
  // function itself. Each can move every frame, and none is inside a case literal.
  for (const line of [
    'function managerCase(entry) {',
    "  'RadioCardGroup',",
    '  ...journalBlindRunCases(),',
    'export function mapChangedFilesToCases(files = [], { patches } = {}) {',
  ]) {
    assert.equal(
      selectedIds([REGISTRY_PATH], registryPatches([registryLineOf(line)])).length,
      everything,
      `a change to \`${line.trim()}\` must select every frame`
    );
  }
});

test('a comment-only registry change selects one frame — not 157, and not none', () => {
  // A comment cannot change a pixel, so widening to a twenty-minute capture for a typo fix is the
  // cost this narrowing exists to remove. It still yields the fallback frame rather than nothing,
  // so no changed set silently produces no evidence.
  const commentLine = registryLineOf(
    '    // Reached the way the smoke reaches it: by CLICKING the system row\'s identity, which is what'
  );
  assert.deepEqual(selectedIds([REGISTRY_PATH], registryPatches([commentLine])), [
    FALLBACK_CASE_ID,
  ]);
});

test('a lab input no longer swallows the render files it ships with', () => {
  // The old blanket branch answered for the whole changed set and returned before the render files
  // were consulted. That was invisible while the answer was "everything"; now that a lab input can
  // select a subset, the selection is a UNION or those frames go missing.
  const selected = selectedIds([
    'tests/view-lab/world/labRunStates.js',
    'src/ui/svelte/apps/manager/SystemEditView.svelte',
  ]);
  const fromRenderFileAlone = selectedIds(['src/ui/svelte/apps/manager/SystemEditView.svelte']);

  assert.ok(fromRenderFileAlone.length > 0, 'the render file must select something on its own');
  for (const id of fromRenderFileAlone) {
    assert.ok(selected.includes(id), `the union dropped "${id}", which the render file selects`);
  }
  assert.ok(
    selected.includes('fabricate-journal'),
    'the union dropped the run-state selection it started from'
  );
  // A union of two subsets, not a capitulation to everything — which is what "keeps both" would
  // trivially be satisfied by, and was, for as long as any lab input meant all 157 frames.
  assert.ok(
    selected.length < publishableCases().length,
    'the union widened back to the whole corpus'
  );
});

test('the capture workflow hands the selector the patches it can narrow on', () => {
  // The library is pure — it never reads git — so the narrowing only happens if the workflow passes
  // the `patch` field through. Without this guard the passthrough could be dropped and the only
  // symptom would be a job that quietly went back to twenty minutes.
  const workflow = readFileSync(resolve(ROOT, '.github/workflows/pr-screenshots.yml'), 'utf8');
  assert.match(workflow, /pulls\/\$PR_NUMBER\/files/, 'the files endpoint is where the patch comes from');
  assert.match(workflow, /patch: \(\.patch \/\/ ""\)/, 'the patch field must be requested');
  assert.match(
    workflow,
    /mapChangedFilesToCases\(files, \{ patches \}\)/,
    'the patches must reach the selector'
  );
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Content-anchored attribution (issue 1049).
//
// `pr-screenshots.yml` runs on `pull_request`, so `actions/checkout` gives the job the MERGE commit
// while the `patch` field from `pulls/{n}/files` describes the PR HEAD. A PR whose base moved the
// file it patches therefore arrives with hunk headers whose line numbers do not land on the file
// that will render — not a corner case, but the normal state of any PR that has been open while
// something else merged.
//
// The first narrowing seeded a cursor from the header and compared each line against
// `sourceLines[cursor - 1]`, so that PR silently paid the twenty-minute whole-corpus capture. Worse
// in the other direction: a shifted patch landing on a verbatim twin of its own content verified
// SUCCESSFULLY against the wrong occurrence and published a frame under a case name it does not
// show. Both are pinned below, as is the precision deliberately given up to close the second one.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The same patch with every hunk header's line numbers moved and its BODY untouched — what a
 * merge-commit checkout effectively does to a head-generated diff.
 *
 * The substitution is asserted to have applied. A `replaceAll` that quietly matched nothing would
 * leave every assertion below passing against the unshifted patch, which reads as "the anchoring
 * works" while nothing was perturbed.
 *
 * @param {string} patch A unified diff.
 * @param {number} delta Lines to move every header by.
 * @returns {string} The shifted patch.
 */
function shiftHunkHeaders(patch, delta) {
  const shifted = patch.replaceAll(
    /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/gm,
    (_, oldStart, oldCount, newStart, newCount) =>
      `@@ -${Number(oldStart) + delta},${oldCount} +${Number(newStart) + delta},${newCount} @@`
  );
  assert.notEqual(shifted, patch, `shifting by ${delta} matched no hunk header, so it changed nothing`);
  return shifted;
}

/**
 * Shifts that keep every header a positive line number, including the most extreme negative one
 * available — which moves the first hunk to line 1.
 *
 * @param {string} patch A unified diff.
 * @returns {number[]} Deltas to apply.
 */
function survivableShifts(patch) {
  const starts = [...patch.matchAll(/^@@ -(\d+),/gm)].map(([, start]) => Number(start));
  return [3, 17, 400, 4000, 1 - Math.min(...starts)];
}

/**
 * The case literal each registry line sits in, derived the way a reader would — from the factory
 * call that opens an element to the line that closes it.
 *
 * @returns {Map<number, string>} Line number -> case id, for lines inside a case literal.
 */
function caseIdByLine() {
  const byLine = new Map();
  for (const id of caseIds) {
    if (!registrySource.includes(`    id: '${id}',`)) continue;
    for (const line of caseLiteralLines(id)) byLine.set(line, id);
  }
  return byLine;
}

/**
 * Every window of `size` consecutive registry lines that occurs more than once, with the case each
 * occurrence's middle line belongs to.
 *
 * Measured from the shipped file rather than invented. The ambiguity the agreement rule refuses is
 * a property of THIS registry — a synthetic fixture would prove the rule against a file nobody
 * ships, and would keep passing after the real duplication went away.
 *
 * @param {number} size Window length in lines; 7 is what one changed line plus git's three lines of
 *   context either side produces.
 * @returns {{starts: number[], ids: Array<string|undefined>}[]} The recurring windows.
 */
function recurringWindows(size) {
  const byContent = new Map();
  for (let start = 1; start + size - 1 <= registrySource.length; start += 1) {
    const key = registrySource.slice(start - 1, start - 1 + size).join('\n');
    byContent.set(key, [...(byContent.get(key) ?? []), start]);
  }

  const owner = caseIdByLine();
  return [...byContent.values()]
    .filter((starts) => starts.length > 1)
    .map((starts) => ({
      starts,
      ids: starts.map((start) => owner.get(start + Math.floor(size / 2))),
    }));
}

test('a patch whose hunk headers do not land still selects exactly what its content names', () => {
  // The regression this replaces: the same patch with its headers moved down three lines selected
  // all 181 frames. The assertion is deliberately the same IDS, not merely a smaller count — a
  // narrowing that lands on the wrong case is worse than one that widens, and a count cannot tell
  // the two apart.
  const inline = caseIds.filter((id) => registrySource.includes(`    id: '${id}',`));
  for (const id of [inline[0], inline[Math.floor(inline.length / 2)], inline.at(-1)]) {
    const patch = registryPatch([registryLineOf(`    id: '${id}',`)]);
    assert.deepEqual(
      selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)),
      [id],
      'an aligned patch whose content is unique must still narrow to its own case'
    );
    for (const delta of survivableShifts(patch)) {
      assert.deepEqual(
        selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, shiftHunkHeaders(patch, delta))),
        [id],
        `a header shifted by ${delta} lines must select the same case, not the whole corpus`
      );
    }
  }
});

test('ADDING a case still narrows to that case when the hunk header numbers are wrong', () => {
  // The frame a PR that adds a case most needs is that case's own. Before content anchoring, a base
  // that had moved this file cost exactly that: 181 frames instead of the one that is new.
  const id = 'coverage-experimental-off-player';
  const patch = registryPatch(caseLiteralLines(id));
  assert.deepEqual(selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)), [id]);
  for (const delta of survivableShifts(patch)) {
    assert.deepEqual(
      selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, shiftHunkHeaders(patch, delta))),
      [id],
      `a header shifted by ${delta} lines must still select the added case alone`
    );
  }
});

test('a hunk whose content recurs in two different cases selects every publishable case', () => {
  const everything = publishableCases().length;
  const windows = recurringWindows(7);
  assert.ok(
    windows.length > 0,
    'this registry is supposed to contain seven-line windows that recur; if it no longer does, ' +
      'this test is measuring nothing and the agreement rule has lost its fixture'
  );

  const crossCase = windows.filter(
    (window) => window.ids.every(Boolean) && new Set(window.ids).size > 1
  );
  assert.ok(
    crossCase.length > 0,
    'no recurring window spans two different case literals any more, so nothing here can prove ' +
      'that an ambiguous hunk widens instead of guessing'
  );

  // The middle line of the window, patched with its OWN correct line numbers. This is the precision
  // the agreement rule deliberately gives up: the patch is aligned, it verifies, and it is still
  // ambiguous — the identical window elsewhere would attribute it to a different case, so the only
  // honest answer is the whole corpus.
  for (const window of crossCase.slice(0, 3)) {
    const line = window.starts[0] + 3;
    assert.equal(
      selectedIds([REGISTRY_PATH], registryPatches([line])).length,
      everything,
      `line ${line} sits in a window that also occurs at ${window.starts.slice(1).join(', ')}, ` +
        `attributing to ${[...new Set(window.ids)].join(' / ')} — an aligned patch there must widen`
    );
  }
});

test('no registry window recurs only within one case literal, so that branch has no fixture', () => {
  // The measurement, recorded rather than replaced by an invented fixture. `regionsTouchedByHunk`
  // ACCEPTS several candidate anchors when they all attribute identically — a window that recurs
  // inside one case literal. This registry contains no such window, so there is nothing real to
  // assert that branch against, and a synthetic file would only prove the test can build one.
  //
  // If this ever fails, the registry has grown exactly the fixture that branch is missing: name it
  // here and assert the branch narrows to the single case both occurrences share.
  const sameCase = recurringWindows(7).filter(
    (window) => window.ids.every(Boolean) && new Set(window.ids).size === 1
  );
  assert.deepEqual(
    sameCase.map((window) => `${window.ids[0]} at ${window.starts.join(', ')}`),
    [],
    'a seven-line window now recurs inside a single case literal, which is the fixture the ' +
      'all-candidates-agree branch of `regionsTouchedByHunk` has never had'
  );
});

test('a hunk the selector cannot anchor selects every publishable case', () => {
  const everything = publishableCases().length;

  // Every way a hunk can fail to name a unique place in the file that will render. The zero-context
  // hunk is the one worth stating out loud: `-U0` produces a hunk whose body is entirely removals,
  // so the sequence that must EXIST in the new file is empty — and an empty sequence occurs at
  // every offset, which is not an attribution.
  for (const [patch, why] of [
    ['@@ -100,0 +100,0 @@', 'a zero-context (`-U0`) hunk anchors nowhere'],
    ['@@ -1,2 +1,0 @@\n-one\n-two', 'a removal-only hunk has no new-file content to find'],
    [
      '@@ -1,2 +1,3 @@\n a line this registry does not contain\n+nor this one',
      'content this checkout does not have',
    ],
  ]) {
    assert.equal(
      selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)).length,
      everything,
      `${why} — that must select every frame`
    );
  }
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// `labActors.js`, attributed by fixture table (issue 1049).
//
// Narrowed on the axis that IS derivable — which fixture table a diff is confined to, and which
// cases render actor-owned data at all — and NOT per actor. Only three of 181 cases name an actor
// id; every player frame draws the whole roster through `ComponentSourcesBar` and computes its
// listings from all three inventories, so a per-actor list would be hand-maintained work wearing
// derived clothing, and its wrong answers would be silent.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** The manager render files a case must claim to be admitted by the knowledge-table predicate. */
const ACTOR_KNOWLEDGE_RENDER_FILES = [
  'src/ui/svelte/apps/manager/KnowledgeView.svelte',
  'src/ui/svelte/apps/manager/BooksScrollsView.svelte',
  'src/ui/svelte/apps/manager/ItemPageInspector.svelte',
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
];

const playerCaseIds = () =>
  publishableCases()
    .filter((viewCase) => viewCase.app === 'fabricate-app')
    .map((viewCase) => viewCase.id);

const knowledgeSurfaceCaseIds = () =>
  publishableCases()
    .filter((viewCase) =>
      viewCase.sourceMatches.some((pattern) =>
        ACTOR_KNOWLEDGE_RENDER_FILES.some((file) => pattern.test(file))
      )
    )
    .map((viewCase) => viewCase.id);

test('a labActors patch confined to a stock table selects every player frame and only those', () => {
  // No manager surface renders a component stack: the manager's only walk of `actor.items`
  // (`_collectKnowledgeOwnedCopies`) keeps just the items matching a recipe-item definition, so a
  // component stack or a `toolBroken` flag reaches no manager frame.
  const players = playerCaseIds();
  for (const [table, text] of [
    ['INVENTORIES', "    'sm-iron-ore': 12,"],
    ['BROKEN_STACKS', "  'lab-actor-brenna': ['sm-longsword'],"],
  ]) {
    const patches = labActorsPatches([labActorsLineOf(text)]);
    assert.deepEqual(
      selectedIds([LAB_ACTORS_PATH], patches),
      players,
      `a ${table} change must select every player frame and no manager frame`
    );
    // Derived, not listed, and shift-proof for the same reason the registry is.
    assert.deepEqual(
      selectedIds(
        [LAB_ACTORS_PATH],
        patchesFor(LAB_ACTORS_PATH, shiftHunkHeaders(patches.patches[LAB_ACTORS_PATH], 200))
      ),
      players,
      `a shifted ${table} patch must select the same frames`
    );
  }
});

test('a labActors patch confined to a knowledge table adds the frames that read owned copies', () => {
  // Owned copies and learned entries are read by the whole Knowledge surface — roster meta, tab
  // badges, both tabs, the owned-copy row's uses/inert/spent chips, the learned row's source ladder
  // — and by `ItemPageInspector`'s learned-by stat on the Books & Scrolls library.
  const expected = publishableCases()
    .filter(
      (viewCase) =>
        viewCase.app === 'fabricate-app' || knowledgeSurfaceCaseIds().includes(viewCase.id)
    )
    .map((viewCase) => viewCase.id);

  for (const [table, text] of [
    ['RECIPE_ITEM_COPIES', "      id: 'copy-scroll',"],
    ['LEARNED_RECIPES', "    'hb-r-kiln': { sourceItemUuid: null, learnedAt: 1_195_000 },"],
  ]) {
    assert.deepEqual(
      selectedIds([LAB_ACTORS_PATH], labActorsPatches([labActorsLineOf(text)])),
      expected,
      `a ${table} change must select the player frames plus the Knowledge / Books & Scrolls ones`
    );
  }

  // Strictly narrower than everything, or the assertion above is satisfied by capitulation.
  assert.ok(expected.length < publishableCases().length, 'the knowledge tables widened to all');
  // And strictly wider than the stock tables, or the two predicates are the same predicate.
  assert.ok(expected.length > playerCaseIds().length, 'the knowledge tables added no manager frame');
});

test('every knowledge or books-scrolls case is inside the sourceMatches-derived set', () => {
  // The predicate is keyed on `sourceMatches` rather than on `kinds`, because `sourceMatches`
  // already declares which render files a case is evidence about and is ALREADY gated for
  // completeness by `tests/view-lab-source-coverage.test.js`. A `kinds`-keyed predicate would need
  // a hand-listed set of nav selectors to police instead.
  //
  // The two derivations must therefore agree in the direction that matters: a case tagged as a
  // Knowledge or Books & Scrolls frame that does NOT claim one of those render files would be
  // dropped from the selection silently. The reverse is allowed and is one frame today —
  // `manager-system-edit-normal` declares `ItemPageInspector` in its own `sourceMatches`, so
  // honouring its declaration costs that frame rather than second-guessing it.
  const derived = new Set(knowledgeSurfaceCaseIds());
  const missing = publishableCases()
    .filter((viewCase) => (viewCase.kinds ?? []).some((kind) => ['knowledge', 'books-scrolls'].includes(kind)))
    .map((viewCase) => viewCase.id)
    .filter((id) => !derived.has(id));

  assert.deepEqual(
    missing,
    [],
    'these cases are tagged as Knowledge or Books & Scrolls frames but claim none of ' +
      `${ACTOR_KNOWLEDGE_RENDER_FILES.join(', ')} in sourceMatches, so a change to an owned copy ` +
      `or a learned recipe would not select them:\n  ${missing.join('\n  ')}`
  );
  assert.ok(derived.size > 0, 'nothing claims the knowledge render files, so the predicate is dead');
});

test('a labActors change outside its fixture tables selects every publishable case', () => {
  const everything = publishableCases().length;

  // `ACTOR_DEFINITIONS` is deliberately on this side. A name and a portrait are not confined to the
  // surfaces that read an actor's holdings: `ActorSelectTopBar` draws them on every player frame,
  // and the manager draws them in the Knowledge roster, the Gathering → Travel party rows, the
  // grant-access roster and the stamina roster. The builders below reach further still —
  // `buildDocumentIndex` is the uuid table `fromUuid` resolves against.
  for (const line of [
    "    name: 'Brenna Karrunsdottir',",
    'function ownedItem(componentId, component, quantity, index) {',
    'function recipeItemCopy({ id, uuid, name, icon, usage = null }) {',
    'export function buildLabActors(content) {',
    'export function buildDocumentIndex(content, actors) {',
  ]) {
    assert.equal(
      selectedIds([LAB_ACTORS_PATH], labActorsPatches([labActorsLineOf(line)])).length,
      everything,
      `a change to \`${line.trim()}\` must select every frame`
    );
  }

  // And with no patch at all, which is how every caller but the capture workflow asks.
  assert.equal(selectedIds([LAB_ACTORS_PATH]).length, everything);
  assert.equal(selectedIds([LAB_ACTORS_PATH], { patches: {} }).length, everything);
});

test('the four labActors fixture tables the selector keys on still exist under those names', () => {
  // The selector finds each table by a column-zero `const NAME = ` line. A rename fails SAFE — the
  // parse returns null and the whole corpus is selected — which is correct and invisible: the only
  // symptom would be a job quietly back at twenty minutes. So it has to fail LOUDLY here too.
  const declared = ['INVENTORIES', 'BROKEN_STACKS', 'RECIPE_ITEM_COPIES', 'LEARNED_RECIPES'].filter(
    (name) => !labActorsSource.some((line) => line.startsWith(`const ${name} = `))
  );
  assert.deepEqual(
    declared,
    [],
    'these fixture tables are no longer declared at column zero under these names, so ' +
      '`parseLabActorTableRegions` finds nothing and every labActors change captures all 181 ' +
      `frames again:\n  ${declared.join('\n  ')}`
  );
});

test('the capture runner still selects every publishable case, and records that decision', () => {
  const everything = publishableCases().length;
  const runnerSource = sourceOf(RUNNER_PATH);

  assert.equal(selectedIds([RUNNER_PATH]).length, everything);
  // Supplying a patch must not narrow an input nobody has attributed. The patch path is the one
  // that grew, so this is the assertion that it grew only where it was meant to.
  assert.equal(
    selectedIds(
      [RUNNER_PATH],
      patchesFor(
        RUNNER_PATH,
        patchAdding(runnerSource, [lineOf(runnerSource, 'const READY_TIMEOUT_MS = 20_000;', RUNNER_PATH)])
      )
    ).length,
    everything,
    'the runner is not an attributed input; a patch for it must not narrow anything'
  );

  // The decision is a decision, not an omission — so it is written down where the next person to
  // wonder "why is this one not narrowed too?" will read it.
  assert.ok(
    runnerSource.some((line) => line.includes('SELECTS EVERY PUBLISHABLE CASE')),
    `${RUNNER_PATH} must record why it is not narrowed from its own diff`
  );
});

test('the capture workflow renders and publishes the one id list it computed', () => {
  // What makes "frames this PR did not re-render survive the publish" true by construction rather
  // than by luck: ONE selection, computed over the PR's whole changed-file set, handed to the
  // renderer, and published from the directory that renderer wrote — without wiping it first.
  const workflow = readFileSync(resolve(ROOT, '.github/workflows/pr-screenshots.yml'), 'utf8');
  const runner = readFileSync(resolve(ROOT, RUNNER_PATH), 'utf8');

  assert.equal(
    [...workflow.matchAll(/echo "ids=/g)].length,
    1,
    'a second id list would let render and publish disagree about what the PR selected'
  );
  assert.match(
    workflow,
    /CASE_IDS: \$\{\{ steps\.select\.outputs\.ids }}/,
    'the renderer must consume the selection step\'s own output'
  );
  assert.match(workflow, /view-lab-screenshots\.mjs apps "\$CASE_IDS"/);

  // The publish step names the directory the renderer writes. Derived from the runner rather than
  // trusted twice, so a moved output directory fails here instead of publishing an empty set.
  assert.match(runner, /join\(ARTIFACT_DIR, 'apps'\)/, 'the runner no longer writes `apps/`');
  assert.match(workflow, /--output-dir ui-screenshot-artifact\/apps/);

  // `--clean` wipes that directory. The workflow must not pass it: a scoped render followed by a
  // wiping publish would drop every frame the PR did not re-select, which is exactly the failure a
  // narrowing makes reachable.
  assert.ok(
    !/view-lab-screenshots\.mjs apps[^\n]*--clean/.test(workflow),
    'the workflow wipes the frame directory before a scoped render, so unrendered frames are lost'
  );
});
