/** Invariants for the View Lab case registry. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'svelte/compiler';

import { createManagerServices } from '../src/ui/managerServices.js';

import {
  APP_CHROME,
  FOUNDRY_CHROME_SPEC,
  minimumViewportFor,
} from '../scripts/lib/foundryChromeSpec.js';
import {
  ACCESS_ROSTER_SEARCH_MISS_TERM,
  ACTOR_KNOWLEDGE_RENDER_FILES,
  BROAD_SIGNAL_CASE_OVERRIDES,
  FALLBACK_CASE_ID,
  LAB_SURFACE_CASES,
  LAB_SURFACE_CASE_IDS,
  VIEW_LAB_CASES,
  VIEW_LAB_CASE_FILES,
  caseIds,
  fallbackCase,
  getCaseById,
  hasUiChanges,
  isUiFile,
  labSurfaceKey,
  labelForCaseId,
  mapChangedFilesToCases,
  normalizePath,
  parseLabActorTableRegions,
  parseMountRegions,
  partitionConsoleErrors,
  publishableCases,
  WORLD_PARTIES_SEARCH_TERM,
  WORLD_TOOL_SEARCH_MISS_TERM,
  WORLD_TOOL_SEARCH_TERM,
} from '../scripts/lib/viewLabCases.js';

import { chooseSelectOption } from '../scripts/lib/view-lab-cases/caseFactories.js';
import { evaluateRecipeReadiness } from '../src/ui/svelte/apps/manager/recipe/recipeReadiness.js';
import { MODIFIER_POLICY_OPTION_ATTR } from '../src/ui/svelte/apps/manager/checks/modifierPolicyAttrs.js';
import { CHECK_SECTION_IDS } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import { SMOKE_SOURCE } from './helpers/interactablesSmokeLocators.js';
import {
  CHECKS_VIEWS,
  buildChecksNavItems,
} from '../src/ui/svelte/apps/manager/checks/checksNav.js';
import { MODIFIER_POLICIES } from '../src/systems/checkModifierResolver.js';

import {
  TOTALS_DOCUMENT,
  totalsRegion,
  withTotalsRegion,
} from '../scripts/view-lab-registry-totals.mjs';

import { emittingHalfOf } from './helpers/interactablesSmokeLocators.js';
import { collectWorkingTreeSources } from './helpers/sourceScan.js';
import { SOURCES, walkTemplate } from './helpers/primitiveAdoptionContract.js';
import { buildLabContent } from './view-lab/world/labContent.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The fixture world, for checks that must derive a case's truth rather than trust its author. */
const content = buildLabContent();

// THE LAB'S WORLD VOCABULARY SEED (issue 1392, epic 1357, PR 7a). The `world-vocabulary` case
// photographs ONE resting state and types nothing, so everything the frame has to show has to be in
// the fixture.
test('the lab seeds a world vocabulary carrying all three delete affordances', () => {
  const settingsSource = readFileSync(resolve(ROOT, 'tests/view-lab/world/labWorld.js'), 'utf8');
  assert.match(
    settingsSource,
    /put\('worldVocabulary', content\.worldVocabulary\)/,
    'the lab world must actually PUT the vocabulary; the shim falls back to the registered ' +
      'default, so an unseeded key photographs an empty screen'
  );
  assert.match(settingsSource, /put\('componentScope', content\.componentScope\)/);

  const vocabulary = content.worldVocabulary;
  assert.ok(vocabulary, 'the fixture builds one');
  const kinds = ['componentCategories', 'componentTags', 'recipeCategories'];
  for (const kind of kinds) {
    assert.ok(vocabulary[kind]?.length >= 1, `${kind} carries at least one entry`);
  }
  assert.ok(
    kinds.some((kind) => vocabulary[kind].length >= 3),
    'at least one vocabulary carries three entries, so a panel is photographed with a real list'
  );

  const defaults = Object.values(content.componentScope?.defaults ?? {});
  assert.ok(
    defaults.some((record) => typeof record.category === 'string' && record.category),
    'a world component default carries a world CATEGORY, so a zero-reference entry can still be ' +
      'confirm-gated'
  );
  assert.ok(
    defaults.some((record) => Array.isArray(record.tags) && record.tags.length > 0),
    'and one carries a world TAG, which is the half of the count no membership record mirrors'
  );

  // The three affordances, derived from the fixture rather than trusted from its author.
  const categoryNames = new Set(
    content.components.map((component) => String(component.category ?? '').toLowerCase())
  );
  const componentTagNames = new Set(
    content.components.flatMap((component) =>
      (component.tags ?? []).map((tag) => tag.toLowerCase())
    )
  );
  const recipeCategoryNames = new Set(
    content.recipes.map((entry) => String(entry.category ?? '').toLowerCase())
  );
  const defaultCategories = new Set(
    defaults.map((record) => String(record.category ?? '').toLowerCase())
  );
  const defaultTags = new Set(
    defaults.flatMap((record) => (record.tags ?? []).map((tag) => tag.toLowerCase()))
  );

  assert.ok(
    vocabulary.componentCategories.some((entry) => categoryNames.has(entry.id)),
    'a REFERENCED component category, so the reference chip is in the frame'
  );
  assert.ok(
    vocabulary.componentCategories.some(
      (entry) => !categoryNames.has(entry.id) && defaultCategories.has(entry.id)
    ),
    'a ZERO-REFERENCE component category that a world default still carries, so the frame shows ' +
      'a confirm-gated row rendering `0 references` rather than `Unused`'
  );
  assert.ok(
    vocabulary.componentTags.some(
      (entry) => !componentTagNames.has(entry.id) && defaultTags.has(entry.id)
    ),
    'a component tag whose ONLY reference is a world default, which is the count asymmetry'
  );
  assert.ok(
    vocabulary.recipeCategories.some((entry) => !recipeCategoryNames.has(entry.id)),
    'and a genuinely unused entry, so the `Unused` chip and the destructive delete are in the frame'
  );
});

/** The viewport the capture driver uses, EXTRACTED from the driver rather than restated. */
const CAPTURE_VIEWPORT = (() => {
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  const match = /viewport:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/.exec(driver);
  assert.ok(match, '`scripts/view-lab-screenshots.mjs` no longer declares a browser viewport');
  return { width: Number(match[1]), height: Number(match[2]) };
})();

/**
 * The roots every check below draws its corpus from, and the extensions that make them complete.
 */
const CORPUS_ROOTS = ['src', 'styles', 'lang'];
const CORPUS_EXTENSIONS = ['.js', '.mjs', '.svelte', '.css', '.json'];

/** The corpus, read from the WORKING TREE in a single walk. */
const sourceCorpus = collectWorkingTreeSources(CORPUS_ROOTS, CORPUS_EXTENSIONS);
const sourceFiles = Object.keys(sourceCorpus);

/**
 * Hooks the CAPTURE DRIVER hard-codes, which appear in no case and were therefore guarded by
 * nothing.
 */
const RAIL_BUTTON_CLASS = 'manager-nav-button';
const DRIVER_HOOKS = [
  RAIL_BUTTON_CLASS, // `runSteps` clicks every rail label through this — 1 file
  'data-manager-view', // the attribute the `expectView` probe reads — 1 file
  'fabricate-app-shell', // the player readiness root — 1 file
  'data-active-tab', // the attribute `expectTab` reads — 1 file
  // `fabricate-manager` is deliberately NOT here.
];

/**
 * Every source file that can carry a UI hook, keyed by path so a check can be scoped to the
 * component that actually renders the thing rather than to the whole tree.
 */
function renderSources() {
  return new Map(
    Object.entries(sourceCorpus).filter(
      ([file]) =>
        file.endsWith('.svelte') ||
        file === 'lang/en.json' ||
        (file.startsWith('src/ui/') && file.endsWith('.js'))
    )
  );
}

/**
 * The same corpus, reduced to the half of each file that can put a hook ON AN ELEMENT (issue 1520).
 *
 * @returns {Map<string, string>} `path -> emitting half`, keyed as {@link renderSources}.
 */
function emittingSources() {
  return new Map(
    [...renderSources()].map(([file, text]) => [
      file,
      file === 'lang/en.json' ? text : emittingHalfOf(text),
    ])
  );
}

/**
 * The files that could legitimately declare a nav item id: whichever component builds the id
 * template, plus the modules it imports by relative path.
 *
 * @param {Map<string, string>} sources Render sources, keyed by repo-relative path.
 * @param {string} template The id-building fragment, e.g. `manager-crafting-nav-${`.
 * @returns {Array<[string, string]>} `[path, text]` pairs to search.
 */
/** The components that RENDER the manager rail. */
function railRenderingFiles(sources) {
  return [...sources].filter(([, text]) => text.includes(RAIL_BUTTON_CLASS));
}

function relativeImportsOf(file, text) {
  const found = [];
  for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    found.push(normalizePath(relative(ROOT, resolve(dirname(resolve(ROOT, file)), match[1]))));
  }
  return found;
}

function navDeclarationScope(sources, template) {
  const builders = [...sources].filter(([, text]) => text.includes(template));
  // The id template and the item table can sit in different units (issue 1717): a rail entry
  // component builds the id, from a table the component that renders it owns and passes in. So
  // the roots are the builders plus whatever renders one, and the scope is those and their
  // relative imports.
  // Transitive, and through components only: the rail's entry unit is rendered by the rail unit,
  // which the shell renders, and the shell is where the item tables are imported.
  const roots = new Map(builders);
  for (let added = true; added; ) {
    added = false;
    for (const [file, text] of sources) {
      if (roots.has(file) || !file.endsWith('.svelte')) continue;
      if (relativeImportsOf(file, text).some((resolved) => roots.has(resolved))) {
        roots.set(file, text);
        added = true;
      }
    }
  }
  const scope = new Map(roots);
  for (const [file, text] of [...roots]) {
    for (const resolved of relativeImportsOf(file, text)) {
      if (sources.has(resolved)) scope.set(resolved, sources.get(resolved));
    }
  }
  return [...scope];
}

/**
 * The step keys `runSteps` dispatches on. Hoisted out of the step test so the drift check below can
 * compare them against the runner's own lists.
 */
const VERBS = ['select', 'fill', 'scroll', 'upload', 'press'];
const PRESS_KEYS = ['Enter', 'Space'];

/**
 * `modifiers` is a MODIFIER, not a verb: it does not choose which action runs, it changes how the
 * default click runs.
 */
const MODIFIERS_KEY = 'modifiers';

/** The click modifiers Playwright accepts, mirroring `CLICK_MODIFIERS` in the capture driver. */
const CLICK_MODIFIERS = ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'];

/** Selector tokens are matched as regular expressions, so their own metacharacters must not be. */
function escapeForRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

test('the corpus every check below reads is the whole tree, not a slice of it', () => {
  // Every other check in this file answers against `sourceCorpus`, so a corpus that quietly lost a
  // root or an extension would not fail — it would go VACUOUS, and the orphan check would then
  // report the absence as a stranded pattern in the registry.
  assert.ok(
    sourceFiles.length >= 500,
    `expected the whole ${CORPUS_ROOTS.join('/, ')}/ tree, got ${sourceFiles.length} files`
  );
  // Defence in depth rather than a live guard: 283 non-`.svelte` files mean the `>= 500` above
  // already forces `>= 217` components, so nothing reaches this that did not red first.
  const components = sourceFiles.filter((file) => file.endsWith('.svelte'));
  assert.ok(
    components.length >= 200,
    `expected >= 200 .svelte files under ${CORPUS_ROOTS.join('/, ')}/, got ${components.length}`
  );

  // By KEY, one per root — because a count threshold cannot see a single file go missing, and each
  // of these is a whole root's or a whole extension's worth of coverage standing on one file.
  for (const file of [
    'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    'styles/fabricate.css',
    'lang/en.json',
  ]) {
    assert.ok(
      Object.hasOwn(sourceCorpus, file),
      `"${file}" is missing from the corpus, so every check keyed on it is now vacuous`
    );
  }

  // `tests/view-lab-chrome-license.test.js` still shells out to `git ls-files`, and must keep doing
  // so.
});

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

test('every sourceMatches pattern resolves to at least one source file', () => {
  // The anti-drift invariant carried over from the first View Lab attempt: a pattern that matches
  // nothing is indistinguishable from a pattern that matches everything until a PR needs it.
  const orphans = [];
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(viewCase.sourceMatches.length > 0, `case "${viewCase.id}" declares no sourceMatches`);
    for (const pattern of viewCase.sourceMatches) {
      if (!sourceFiles.some((file) => pattern.test(normalizePath(file)))) {
        orphans.push(`${viewCase.id}: ${pattern}`);
      }
    }
  }
  // The roots are named because the corpus is scoped to them: a pattern aimed at `scripts/` or
  // `tests/` is out of scope rather than stranded, and reads as the latter without them.
  assert.deepEqual(
    orphans,
    [],
    `these patterns match no file under ${CORPUS_ROOTS.map((root) => `${root}/`).join(', ')} — a ` +
      `rename probably stranded them, or the pattern points outside those roots:\n  ${orphans.join('\n  ')}`
  );
});

/** The four gathering/travel leaves the rail renders, moved out of the root by issue 1707. */
const GATHERING_INSPECTOR_LEAF_PATHS = Object.freeze([
  'src/ui/svelte/apps/manager/environment/GatheringTaskInspector.svelte',
  'src/ui/svelte/apps/manager/environment/GatheringEventInspector.svelte',
  'src/ui/svelte/apps/manager/environment/GatheringRulesInspector.svelte',
  'src/ui/svelte/apps/manager/world/TravelInspector.svelte',
]);

const GATHERING_INSPECTOR_RAIL_PATH =
  'src/ui/svelte/apps/manager/environment/GatheringInspectorRail.svelte';

test('every case claiming a gathering/travel leaf also claims the rail that renders it', () => {
  // A case that claims a leaf but not the rail asks for no photograph when the rail's own branch
  // chain breaks — the defect phase 3's post-implementation review found (issue 1707 phase 3).
  const drifted = VIEW_LAB_CASES.filter(
    (viewCase) =>
      GATHERING_INSPECTOR_LEAF_PATHS.some((leaf) =>
        viewCase.sourceMatches.some((pattern) => pattern.test(leaf))
      ) && !viewCase.sourceMatches.some((pattern) => pattern.test(GATHERING_INSPECTOR_RAIL_PATH))
  ).map((viewCase) => viewCase.id);
  assert.deepEqual(drifted, [], 'these cases claim a leaf without also claiming its rail');
});

/** Hooks that belong to Foundry's own chrome, which this repository neither ships nor renames. */
const FOUNDRY_CHROME_HOOKS = new Set(['dialog-content']);

/** Hooks the LAB HARNESS renders rather than `src/`, matched by their reserved `lab-` prefix. */
const LAB_HOOK = /^(?:data-)?lab-/;
const labHarnessSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');

/** A selector with every `:not(…)` group removed, brackets balanced. */
function stripNegations(selector) {
  let result = '';
  let index = 0;
  while (index < selector.length) {
    const start = selector.indexOf(':not(', index);
    if (start === -1) return result + selector.slice(index);
    result += selector.slice(index, start);
    let depth = 0;
    let cursor = start + 4;
    for (; cursor < selector.length; cursor += 1) {
      if (selector[cursor] === '(') depth += 1;
      else if (selector[cursor] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }
  return result;
}

/** Assert that every stable hook in ONE selector still exists in the UI corpus (issue 1118). */
function collectSelectorHookFailures(viewCase, selector, sources, haystack, missing) {
  // A LITERAL ID IS ANSWERED BY THE ID ITSELF (issue 1520 review).
  const literalId = /^#([\w-]+)$/.exec(selector);
  if (literalId && [...sources].some(([, text]) => text.includes(`id="${literalId[1]}"`))) {
    return;
  }
  const editorTab = /^#([a-z-]+)-tab-([a-z-]+)$/.exec(selector);
  if (editorTab) {
    const [, family, tabId] = editorTab;
    // TWO WAYS to build the stem, because `EditorTabs.svelte` took the interpolation over (issues
    // 1362 and 1038).
    const builders = [...sources].filter(
      ([, text]) => text.includes(`${family}-tab-\${`) || text.includes(`idStem="${family}"`)
    );
    if (builders.length === 0) {
      missing.push(
        `${viewCase.id}: selector "${selector}" (no component builds ${family}-tab-* ids)`
      );
    } else if (!builders.some(([, text]) => text.includes(`'${tabId}'`))) {
      missing.push(
        `${viewCase.id}: selector "${selector}" (${builders
          .map(([file]) => file)
          .join(', ')} declares no "${tabId}" tab)`
      );
    }
    return;
  }
  // The two rail groups build their subitem ids from a nav item's id (`manager-crafting-nav-${id}`
  // / `manager-gathering-nav-${id}`), so the literal selector never appears in source; the id stem
  // is what a rename would move (issue 1096).
  const sectionId = /^#checks-section-(.+)$/.exec(selector);
  if (sectionId) {
    if (!CHECK_SECTION_IDS.includes(sectionId[1])) {
      missing.push(
        `${viewCase.id}: selector "${selector}" names no CHECK_SECTION_IDS member ` +
          `(${CHECK_SECTION_IDS.join(', ')})`
      );
    }
    return;
  }
  // A RAIL HOOK, scoped to the components that render the rail (issue 1362).
  const railHook =
    /^#(manager-(?:world-)?nav-[a-z0-9-]+)$/.exec(selector) ??
    /^\[data-(?:manager|world)-nav-item="([^"]+)"\]$/.exec(selector);
  if (railHook) {
    const railFiles = railRenderingFiles(sources);
    if (railFiles.length === 0) {
      missing.push(`${viewCase.id}: nothing renders "${RAIL_BUTTON_CLASS}" any more`);
    } else if (!railFiles.some(([, text]) => text.includes(railHook[1]))) {
      missing.push(
        `${viewCase.id}: rail hook "${railHook[1]}" appears in no component that renders ` +
          `"${RAIL_BUTTON_CLASS}" (${railFiles.map(([file]) => file).join(', ')})`
      );
    }
    return;
  }
  const navId = /^#manager-(crafting|gathering|checks)-nav-(.+)$/.exec(selector);
  if (navId) {
    const [, group, id] = navId;
    // The scope is the builder PLUS what it imports: the gathering items are declared inline in the
    // root, but the crafting ones live in `crafting/craftingNav.js`, which the root pulls in.
    const scope = navDeclarationScope(sources, `manager-${group}-nav-\${`);
    if (scope.length === 0) {
      missing.push(
        `${viewCase.id}: selector "${selector}" (no component builds manager-${group}-nav-* ids)`
      );
    } else if (!scope.some(([, text]) => text.includes(`id: '${id}'`))) {
      missing.push(
        `${viewCase.id}: selector "${selector}" (${scope
          .map(([file]) => file)
          .join(', ')} declares no "${id}" nav item)`
      );
    }
    return;
  }
  // Everything else is a compound of stable hooks: literal element ids, class names, and `data-*`
  // attribute names.
  const withoutValues = stripNegations(selector).replaceAll(/=\s*("[^"]*"|'[^']*')/g, '');
  const tokens = [...withoutValues.matchAll(/#([a-z][\w-]*)|\.([a-z][\w-]*)|\[([a-z-]+)/gi)].map(
    (match) => match[1] ?? match[2] ?? match[3]
  );
  if (tokens.length === 0) {
    missing.push(`${viewCase.id}: selector "${selector}" has no verifiable token`);
    return;
  }
  for (const token of tokens) {
    // Anchored on a word boundary at BOTH ends, not a bare substring. `haystack.includes(token)`
    // passes on a coincidence whenever one hook name contains another:. prefix — renaming the real
    // `data-component-select` left `data-component-select-all-page` in a sibling component, so the
    // substring still matched and the guard stayed green over six broken selectors.
    if (FOUNDRY_CHROME_HOOKS.has(token)) continue;
    const bounded = new RegExp(String.raw`(?<![\w-])${escapeForRegExp(token)}(?![\w-])`);
    // A `lab-` hook is rendered by the harness's companion stand-in, so that is where it has
    // to be found; everything else is Core's and is looked for in `src/`.
    const owner = LAB_HOOK.test(token) ? labHarnessSource : haystack;
    if (bounded.test(owner)) continue;
    const where = LAB_HOOK.test(token) ? 'the view-lab harness' : 'src';
    missing.push(`${viewCase.id}: selector "${selector}" (nothing in ${where} matches "${token}")`);
  }
}

test('every interaction step names text that exists in the manager UI', () => {
  // Steps are clicked by accessible name. A renamed rail entry would otherwise click nothing, and
  // the case would capture whichever screen happened to be showing.
  const sources = emittingSources();
  const haystack = [...sources.values()].join('\n');

  const missing = [];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps ?? []) {
      if (typeof step === 'string') {
        // Scoped to the component that RENDERS the rail, not the whole tree.
        const railFiles = railRenderingFiles(sources);
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
      if ('press' in step && !PRESS_KEYS.includes(step.press)) {
        missing.push(
          `${viewCase.id}: step for "${step.selector}" names unknown key ` +
            `${JSON.stringify(step.press)} — press accepts ${PRESS_KEYS.join(', ')}`
        );
      }
      // The runner rejects both of these too, but that throw only fires during a capture run, which
      // is not an `npm test` gate — so a bad step would sit green in the registry until somebody
      // spent twenty minutes discovering it. Both rules are therefore enforced HERE as well.
      if (MODIFIERS_KEY in step) {
        // A modifier can only ride on a click.
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
      // selector appears literally.
      collectSelectorHookFailures(viewCase, step.selector, sources, haystack, missing);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `these steps reference UI that no longer exists:\n  ${missing.join('\n  ')}`
  );
});

/**
 * The four rail labels that BECAME AMBIGUOUS when the world scoped-entity leaves landed (issue
 * 1362), as an enumerated DENY-LIST rather than a blanket ban on string steps.
 */
const MIGRATED_RAIL_LABELS = Object.freeze([
  'Components',
  'Essences',
  'Tools',
  'Tags & Categories',
]);

test('no case reaches a rail entry by one of the four ambiguous labels', () => {
  const offending = [];
  let stringSteps = 0;
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps ?? []) {
      if (typeof step !== 'string') continue;
      stringSteps += 1;
      if (MIGRATED_RAIL_LABELS.includes(step)) offending.push(`${viewCase.id}: "${step}"`);
    }
  }
  // NON-VACUITY. The string branch stays ALIVE for the labels this relabel does not touch, so
  // a registry that had quietly lost every string step would satisfy the deny-list while also
  // having discarded the stronger check it protects.
  assert.ok(
    stringSteps > 100,
    `only ${stringSteps} string steps remain; the string branch and its scoped rail check are ` +
      'supposed to stay alive for the 109 steps this relabel does not touch'
  );
  assert.deepEqual(
    offending,
    [],
    'these steps click a rail entry by a label that now names TWO buttons (or is a ' +
      'substring of another). Use the stable id instead: `#manager-nav-component-rules`, ' +
      '`#manager-nav-essence-rules`, `#manager-nav-tool-rules`, `#manager-nav-tags`, or ' +
      'the matching `#manager-world-nav-*` leaf.\n  ' +
      offending.join('\n  ')
  );
});

test('every expectSelector names UI that still exists', () => {
  // The step sweep above never looked at `expectSelector`, so a hook named only there — which is
  // the normal shape for a case whose whole job is to assert a state — was guarded by nothing.
  const sources = emittingSources();
  const haystack = [...sources.values()].join('\n');
  const missing = [];
  let checked = 0;
  for (const viewCase of VIEW_LAB_CASES) {
    if (typeof viewCase.expectSelector !== 'string') continue;
    checked += 1;
    collectSelectorHookFailures(viewCase, viewCase.expectSelector, sources, haystack, missing);
  }
  assert.ok(checked > 0, 'a sweep over an empty collection passes exactly as loudly as a real one');
  assert.deepEqual(
    missing,
    [],
    'these expectSelectors reference UI that no longer exists, so the capture job fails WHOLE ' +
      `and publishes nothing:\n  ${missing.join('\n  ')}`
  );
});

/** Every SELECTOR-BEARING field on a case, so a scan cannot silently miss one. */
function caseSelectors(viewCase) {
  const selectors = [];
  for (const step of viewCase.steps ?? []) {
    if (typeof step === 'object' && typeof step.selector === 'string')
      selectors.push(step.selector);
  }
  if (typeof viewCase.expectSelector === 'string') selectors.push(viewCase.expectSelector);
  if (typeof viewCase.expectLayout?.containerSelector === 'string') {
    selectors.push(viewCase.expectLayout.containerSelector);
  }
  if (typeof viewCase.expectLayout?.gridSelector === 'string') {
    selectors.push(viewCase.expectLayout.gridSelector);
  }
  if (typeof viewCase.expectLayout?.fillSelector === 'string') {
    selectors.push(viewCase.expectLayout.fillSelector);
  }
  return selectors;
}

// The five player cases whose layout expectation asserts "this STACKED at 1024px": one
// resolved track, inside a 960px content box.
const RESPONSIVE_LAYOUT_CASE_IDS = [
  'player-inventory-bulk-mixed-narrow',
  'player-gathering-stacked',
  'player-crafting-stacked',
  'player-alchemy-stacked',
  'player-journal-stacked',
];

// And the manager case that asserts the OPPOSITE shape (issue 1362): a released third column —
// exactly TWO resolved tracks — with the inspector aside genuinely ABSENT.
const FULL_WIDTH_LAYOUT_CASE_IDS = ['world-scoped-narrow'];

// And the two consumers of the SHARED EDITOR FRAME, which assert the stacked shape on a grid of
// their OWN rather than on `.manager-body` (issue 1371 r19-entry2).
const FRAME_STACK_LAYOUT_CASE_IDS = [
  'world-component-entry-stacked',
  'manager-component-edit-stacked',
];
// And the band cases whose side rail must reach the body's bottom edge: Knowledge (issue 1972),
// and Downtime once its own 1120px rail rule folded into the shared reset (issue 1976).
const RAIL_FILL_LAYOUT_CASES = {
  'manager-knowledge-narrow': { tracks: 3, width: 880 },
  'manager-world-downtime-narrow': { tracks: 2, width: 960 },
};
const RAIL_FILL_LAYOUT_CASE_IDS = Object.keys(RAIL_FILL_LAYOUT_CASES);
const LAYOUT_CASE_IDS = [
  ...RESPONSIVE_LAYOUT_CASE_IDS,
  ...FULL_WIDTH_LAYOUT_CASE_IDS,
  ...FRAME_STACK_LAYOUT_CASE_IDS,
  ...RAIL_FILL_LAYOUT_CASE_IDS,
  'fabricate-journal-lifecycle-narrow',
  'fabricate-journal-lifecycle-wide',
];
const LAYOUT_ASSERTION_PATH = 'scripts/lib/viewLabLayoutAssertion.js';

test('exactly the declared layout cases carry complete layout expectations', () => {
  const declared = VIEW_LAB_CASES.filter((viewCase) => viewCase.expectLayout);
  assert.deepEqual(declared.map((viewCase) => viewCase.id).sort(), [...LAYOUT_CASE_IDS].sort());
  for (const viewCase of declared) {
    if (
      viewCase.query?.journalCaseState === 'wide' ||
      viewCase.query?.journalCaseState === 'narrow'
    ) {
      const narrow = viewCase.query.journalCaseState === 'narrow';
      assert.deepEqual(viewCase.position, { width: narrow ? 1024 : 1240, height: 880 });
      assert.equal(viewCase.expectLayout.expectedTracks, narrow ? 1 : 2);
      assert.equal(viewCase.expectLayout.maxContentBoxInlineSize, narrow ? 960 : undefined);
      continue;
    }
    // THE WINDOW IS PER GROUP, because the breakpoint each group asserts is a different one and a
    // shared literal would be asserting one screen's threshold about another's.
    assert.deepEqual(viewCase.position, layoutCasePosition(viewCase.id));
    assert.equal(typeof viewCase.expectLayout.containerSelector, 'string');
    assert.equal(typeof viewCase.expectLayout.gridSelector, 'string');
  }
  for (const viewCase of declared.filter((entry) =>
    RESPONSIVE_LAYOUT_CASE_IDS.includes(entry.id)
  )) {
    assert.equal(viewCase.expectLayout.maxContentBoxInlineSize, 960);
    assert.equal(viewCase.expectLayout.expectedTracks ?? 1, 1, 'a stacked case is one track');
  }
  for (const viewCase of declared.filter((entry) =>
    FRAME_STACK_LAYOUT_CASE_IDS.includes(entry.id)
  )) {
    // No width bound and no absent aside: the subject is the frame's own grid, and what makes the
    // case worth capturing is that BOTH halves survive the stack — which the capture driver reads
    // as one column track plus the pointer hit on the stacked preview tile, scrolled into the
    // bounded frame's view. The first tab's hit is its wide twin's to prove (issue 1976).
    assert.equal(viewCase.expectLayout.maxContentBoxInlineSize, undefined);
    assert.equal(viewCase.expectLayout.expectedTracks, 1);
    assert.equal(viewCase.expectLayout.absentSelector, undefined);
    assert.equal(viewCase.expectCenterHit, '[data-scoped-entry-preview-tile]');
    // The side rail beside the stacked frame runs the body's full height (issue 1976).
    assert.equal(viewCase.expectLayout.fillSelector, '.manager-rail');
  }
  assert.equal(
    getCaseById('manager-component-edit-normal').expectCenterHit,
    '[data-component-edit-tab="rules"]'
  );
  assert.equal(
    getCaseById('world-component-entry-definition').expectCenterHit,
    '[data-scoped-entry-tab="definition"]'
  );
  for (const viewCase of declared.filter((entry) =>
    FULL_WIDTH_LAYOUT_CASE_IDS.includes(entry.id)
  )) {
    // NO width bound: a full-width case is not asserting a breakpoint, and a default would
    // silently bound it at the responsive cases' 960px.
    assert.equal(viewCase.expectLayout.maxContentBoxInlineSize, undefined);
    assert.equal(viewCase.expectLayout.expectedTracks, 2);
    assert.equal(viewCase.expectLayout.absentSelector, '.manager-inspector');
    // And the side rail runs the body's full height below the 1120px rung (issue 1976).
    assert.equal(viewCase.expectLayout.fillSelector, '.manager-rail');
  }
  for (const viewCase of declared.filter((entry) =>
    RAIL_FILL_LAYOUT_CASE_IDS.includes(entry.id)
  )) {
    assert.equal(viewCase.expectLayout.fillSelector, '.manager-rail');
    assert.equal(viewCase.expectLayout.expectedTracks, RAIL_FILL_LAYOUT_CASES[viewCase.id].tracks);
    assert.equal(viewCase.expectLayout.maxContentBoxInlineSize, undefined);
    assert.equal(viewCase.expectLayout.absentSelector, undefined);
  }
});

// The side-rail routes' own scrollers below the 1120px rung (issue 1976): the two editors whose
// band override is put back, and the stacked catalogue whose list-over-inspector layout scrolls.
test('the side-rail band cases name the scroller that owns their overflow', () => {
  const scrollers = {
    'manager-recipe-edit-step-narrow': 'main.manager-recipe-edit-main',
    'manager-gathering-task-editor-selector-narrow': 'main.manager-gathering-task-edit-view',
    'manager-gathering-task-editor-straight-narrow': 'main.manager-gathering-task-edit-view',
    'manager-gathering-task-editor-routed-narrow': 'main.manager-gathering-task-edit-view',
    'world-tool-catalogue-stacked': '.manager-scoped-list-layout',
  };
  for (const [id, scroller] of Object.entries(scrollers)) {
    assert.equal(getCaseById(id).expectScrollable, scroller, id);
  }
  const stacked = getCaseById('world-tool-catalogue-stacked');
  const parent = getCaseById('world-tool-catalogue');
  // 882 wide, so the list frame is below its own 760px stack while the body keeps two tracks.
  assert.deepEqual(stacked.position, { width: 882, height: 720 });
  assert.deepEqual(stacked.steps.slice(0, parent.steps.length), parent.steps);
  assert.deepEqual(stacked.steps.at(-1), {
    selector: '[data-scoped-list-inspect="sm-tool-hammer"]',
    scroll: true,
  });
  assert.equal(stacked.expectView, parent.expectView);
  assert.equal(stacked.expectSelector, parent.expectSelector);
  assert.equal(stacked.expectContained, undefined, 'the stacked inspector sits below the fold');
});

function layoutCasePosition(id) {
  if (FRAME_STACK_LAYOUT_CASE_IDS.includes(id)) return { width: 980, height: 860 };
  if (RAIL_FILL_LAYOUT_CASE_IDS.includes(id)) {
    return { width: RAIL_FILL_LAYOUT_CASES[id].width, height: 900 };
  }
  return { width: 1024, height: 860 };
}

test('compact Journal captures add full, short, empty, restored and tool witnesses at both widths', () => {
  const cases = VIEW_LAB_CASES.filter((entry) => entry.id.startsWith('fabricate-journal-history-batch-'));
  assert.equal(cases.length, 10);
  for (const width of [1240, 1024]) {
    for (const state of ['full', 'partial', 'empty', 'restored', 'tools']) {
      const capture = getCaseById(`fabricate-journal-history-batch-${state}-${width}`);
      assert.equal(capture.position.width, width);
      assert.equal(capture.expectTab, 'journal');
      assert.match(capture.expectSelector, /data-history-items="tools"/);
      if (state === 'partial') assert.equal(capture.steps.filter((step) => step.selector.includes('data-pagination-next')).length, 4);
      if (state === 'restored') assert.equal(capture.steps.at(-1).fill, '');
      if (state === 'empty') assert.match(capture.expectSelector, /is-fill/);
    }
  }
});

// The evidence each history-data state exists to photograph, keyed by its own witness.
const HISTORY_DATA_EVIDENCE = [
  // The saved world's two independent rolls, and the global cut that must NOT be synthesised.
  ['legacy-row-rolls', [/legacy-iron-ore-roll-12"\]\.is-cleared/, /legacy-copper-ore-roll-94"\]\.is-cleared/, /:not\(:has\(\[data-yield-cut\]\)\)/]],
  ['shared-roll-control', [/:has\(\[data-yield-cut\]\)/, /shared-ruby:2"\]\.is-missed/]],
  ['recovered-materials', [/title="Steel Billet"/, /title="Coal"/, /consumed"\] i\.fa-box/, /produced"\] \[title="Steel Ingot"\]/]],
  ['unknown-material-resolution', [/data-yield-shared-roll/, /data-history-unattributed\] \+ \[data-history-items="produced"/, /:not\(:has\(\[data-yield-entry="unknown-ruby"\]\.is-cleared\)\)/]],
  ['settled-zero', [/data-journal-verdict="failed"/, /barren-iron-ore"\]\.is-missed/, /:not\(:has\(\[data-yield-entry\]\.is-cleared\)\)/]],
  ['uncertain-awards', [/data-effect-phase="applied"\] \[data-list-row\]/, /data-effect-phase="applying"\] \[data-list-row\]/, /data-journal-recovery-evidence\] ~ \[data-journal-history-detail\] \[data-journal-guidance\]/]],
  ['fizzle', [/data-history-summary="none"/, /title="Quicksilver"/, /img\.fab-medallion-img/]],
  ['salvage', [/data-history-items="produced"\] \+ \[data-journal-fact\]/, /produced"\] \[data-list-row\] ~ \[data-list-row\]/, /:not\(:has\(\[data-history-items="consumed"\]\)\)/]],
];

test('the history-data witnesses name their defining evidence on the selected record', () => {
  const cases = VIEW_LAB_CASES.filter((entry) =>
    entry.id.startsWith('fabricate-journal-history-data-')
  );
  assert.equal(cases.length, 16);
  for (const width of [1240, 1024]) {
    for (const [state, evidence] of HISTORY_DATA_EVIDENCE) {
      const capture = getCaseById(`fabricate-journal-history-data-${state}-${width}`);
      assert.deepEqual(capture.position, { width, height: 880 });
      assert.equal(capture.expectTab, 'journal');
      assert.equal(capture.reaches, 'beyond');
      assert.equal(capture.query.journalCaseState, `history-data-${state}`);
      // The walk selects its OWN record: a witness reached by whatever row happened to be first
      // would photograph a different account's evidence under this case's name.
      assert.deepEqual(capture.steps, [
        { selector: `[data-history-run-id="lab-v1-history-data-${state}"]` },
      ]);
      for (const pattern of evidence) assert.match(capture.expectSelector, pattern, capture.id);
      assert.ok(
        capture.expectSelector.startsWith('[data-journal-detail]'),
        `${capture.id} asserts against the open record, not the list`
      );
      assert.ok(
        !capture.expectSelector.includes('data-journal-case-state'),
        `${capture.id} checks product output`
      );
    }
  }
  // Only the alchemy attempt record is GM evidence; the other seven are the player's own.
  assert.deepEqual(
    cases.filter((entry) => entry.query.viewer === 'gm').map((entry) => entry.id),
    ['fabricate-journal-history-data-fizzle-1240', 'fabricate-journal-history-data-fizzle-1024']
  );
  // The two families this one sits beside are unchanged by it.
  assert.equal(
    VIEW_LAB_CASES.filter((entry) => entry.id.startsWith('fabricate-journal-lifecycle-')).length,
    73
  );
  assert.equal(
    VIEW_LAB_CASES.filter((entry) => entry.id.startsWith('fabricate-journal-history-batch-')).length,
    10
  );
});

test('no expectSelector nests one :has() inside another', () => {
  // `:has()` may not appear inside a relative selector of another `:has()`.
  const nests = (selector) => {
    const stack = [];
    let open = 0;
    for (let index = 0; index < selector.length; index += 1) {
      if (selector.startsWith(':has(', index)) {
        if (open > 0) return true;
        open += 1;
        stack.push('has');
        index += 4;
      } else if (selector[index] === '(') stack.push('other');
      else if (selector[index] === ')' && stack.pop() === 'has') open -= 1;
    }
    return false;
  };
  // The scan is proved to fail before it is trusted: the first is the shape it must reject.
  assert.equal(nests('a:has(b:has(c))'), true);
  assert.equal(nests('a:has(b):not(:has(c)) :has(d)'), false);

  const nested = VIEW_LAB_CASES.filter(
    (viewCase) => typeof viewCase.expectSelector === 'string' && nests(viewCase.expectSelector)
  );
  assert.deepEqual(
    nested.map((viewCase) => viewCase.id),
    []
  );
});

test('all Journal lifecycle captures assert defining product state rather than a populated shell', () => {
  const cases = VIEW_LAB_CASES.filter((entry) =>
    entry.id.startsWith('fabricate-journal-lifecycle-')
  );
  assert.equal(cases.length, 73);
  for (const entry of cases) {
    assert.equal(entry.expectTab, 'journal', entry.id);
    assert.ok(entry.expectSelector, `${entry.id} has an explicit assertion`);
    assert.notEqual(entry.expectSelector, '[data-journal-state="populated"]', entry.id);
    assert.ok(
      !entry.expectSelector.includes('data-journal-case-state'),
      `${entry.id} checks product output`
    );
  }
  const byState = new Map(
    cases.map((entry) => [entry.id.replace('fabricate-journal-lifecycle-', ''), entry])
  );
  // The manual setup frame is GONE, and its absence is asserted rather than merely not asserted:
  // the ledger is provisioned automatically, so a GM blocked by `ledger-missing` is a state no
  // world can reach and a frame of it would photograph a button that no longer exists.
  assert.equal(byState.has('authority-setup'), false, 'manual authority setup was removed');
  assert.equal(
    byState.get('authority-unavailable').query.viewer,
    undefined,
    'the player refusal frame, which shows a blocker that still happens, is retained'
  );
  // Issue 1648: the retained-claim frame is GM-only BY CONSTRUCTION.
  assert.equal(byState.get('claim-retained').query.viewer, 'gm');
  assert.match(byState.get('claim-retained').expectSelector, /data-notice-action/);
  for (const state of ['stale-action', 'command-timeout']) {
    assert.match(byState.get(state).expectSelector, /data-journal-command-error/);
    assert.match(byState.get(state).expectSelector, /data-notice-action/);
    assert.match(byState.get(state).expectSelector, /aria-busy/);
  }
  for (const state of [
    'gathering-straight-finished',
    'gathering-d100-finished',
    'gathering-check-finished',
    'finished-success',
    'automatic-completion',
    'salvage',
  ]) {
    assert.match(byState.get(state).expectSelector, /data-journal-history-detail/);
    assert.match(byState.get(state).expectSelector, /:not\(:has\(\[data-stage-nav\]\)\)/);
    assert.match(byState.get(state).expectSelector, /:not\(:has\(\[data-journal-summary\]\)\)/);
    assert.doesNotMatch(byState.get(state).expectSelector, /data-journal-verdict="succeeded"/);
  }
  for (const state of [
    'history-checked-choice',
    'history-resolution-ingredients',
    'history-resolution-simple',
    'history-checked-ingredients',
    'history-legacy-no-check-failure',
    'history-multi-essence',
    'history-multi-shared-essence',
    'history-multi-success',
    'history-multi-failure',
    'history-cancelled-before',
    'history-cancelled-multi',
    'history-d100-all-hit',
    'history-d100-all-miss',
    'history-gathering-check-failure',
    'history-just-resolved',
    'history-redacted',
    'history-missing-material',
    'history-gm-deleted-recipe',
    'history-failure-awards',
    'current-choice-closed',
    'essence-overshoot',
    'past-routed-stage',
    'future-routed-stage',
    'kind-menu-open',
    'history-settling',
  ]) {
    assert.ok(byState.has(state), `issue #1648 v4 explicitly requires ${state}`);
  }
  assert.match(byState.get('legacy').expectSelector, /data-run-action="pause"\]:disabled/);
  assert.equal(
    byState.get('filter-paused').steps.at(-1).selector,
    '[data-journal-status-filter] label:has(input[value="paused"])'
  );
  assert.equal(
    byState.get('filter-paused').expectCenterHit,
    byState.get('filter-paused').steps.at(-1).selector
  );
  assert.match(byState.get('filter-paused').expectSelector, /:checked/);
  assert.match(byState.get('empty-search').expectSelector, /data-journal-empty="active"/);
  assert.match(byState.get('empty-search').expectSelector, /data-journal-empty="history"/);
});

test('layout expectation selectors name UI that still exists', () => {
  const sources = emittingSources();
  const haystack = [...sources.values()].join('\n');
  const missing = [];
  for (const viewCase of VIEW_LAB_CASES.filter((entry) => entry.expectLayout)) {
    collectSelectorHookFailures(
      viewCase,
      viewCase.expectLayout.containerSelector,
      sources,
      haystack,
      missing
    );
    collectSelectorHookFailures(
      viewCase,
      viewCase.expectLayout.gridSelector,
      sources,
      haystack,
      missing
    );
    if (viewCase.expectLayout.fillSelector) {
      collectSelectorHookFailures(
        viewCase,
        viewCase.expectLayout.fillSelector,
        sources,
        haystack,
        missing
      );
    }
  }
  assert.deepEqual(
    missing,
    [],
    `these layout selectors no longer exist:\n  ${missing.join('\n  ')}`
  );
});

test('a layout assertion helper change selects every case whose layout it validates', () => {
  assert.equal(
    hasUiChanges([LAYOUT_ASSERTION_PATH]),
    true,
    'a helper-only change must require screenshot evidence'
  );
  assert.deepEqual(selectedIds([LAYOUT_ASSERTION_PATH]).sort(), [...LAYOUT_CASE_IDS].sort());
});

test('the capture runner threads and asserts declared layouts before taking a screenshot', () => {
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  assert.match(driver, /expectLayout: viewCase\.expectLayout \?\? null/);
  const assertion = driver.indexOf('await assertViewLabLayout(page, expectLayout, label)');
  const screenshot = driver.indexOf('frame.screenshot(', assertion);
  assert.ok(assertion >= 0, 'the runner must invoke the generic layout assertion');
  assert.ok(screenshot > assertion, 'the layout assertion must run before frame.screenshot()');
});

// THE PER-CASE CONSOLE-ERROR ALLOWANCE (issue 1515). The capture driver fails a render on ANY
// console error, and that is why a lab frame is worth looking at: a frame rendered over a thrown
// handler is indistinguishable from one rendered over a working handler.
test('an undeclared console error is still fatal, and a declared one is not', () => {
  const allowance = [/Failed to toggle recipe enabled state/];

  // (1) THE DEFAULT IS UNCHANGED. A case declaring nothing tolerates nothing.
  assert.deepEqual(partitionConsoleErrors(['boom'], []), {
    unmatched: ['boom'],
    unusedAllowances: [],
  });

  // (2) A DECLARED ERROR PASSES, and only that one.
  assert.deepEqual(
    partitionConsoleErrors(
      ['Fabricate | Failed to toggle recipe enabled state: refused'],
      allowance
    ),
    { unmatched: [], unusedAllowances: [] }
  );

  // (3) AND AN UNMATCHED ERROR BESIDE A MATCHED ONE IS STILL FATAL, which is the property that
  // makes the allowance narrow rather than a mute button.
  assert.deepEqual(
    partitionConsoleErrors(
      ['Fabricate | Failed to toggle recipe enabled state: refused', 'TypeError: x is undefined'],
      allowance
    ),
    { unmatched: ['TypeError: x is undefined'], unusedAllowances: [] }
  );
});

test('a declared console error that never arrives fails the case too', () => {
  // The allowance is an ASSERTION, not a permission.
  assert.deepEqual(partitionConsoleErrors([], [/never happens/]), {
    unmatched: [],
    unusedAllowances: ['/never happens/'],
  });

  // Reported per pattern, so a case declaring two learns WHICH one went stale.
  assert.deepEqual(partitionConsoleErrors(['seen'], [/seen/, /unseen/]), {
    unmatched: [],
    unusedAllowances: ['/unseen/'],
  });
});

test('a global-flagged allowance does not skip its second match', () => {
  // `RegExp#test` advances `lastIndex` on a `g`-flagged pattern, so the second call against a fresh
  // string starts from the first match's offset and can miss.
  const sticky = /refused/g;
  assert.deepEqual(partitionConsoleErrors(['refused once', 'refused twice'], [sticky]), {
    unmatched: [],
    unusedAllowances: [],
  });
});

test('the capture runner threads the per-case console allowance into the render', () => {
  // The same shape as the layout-threading check above, and for the same reason: the field is
  // declarative data on a case, and a case field that the driver never reads is configuration
  // that cannot fail. Asserted against the driver's SOURCE because the module cannot be imported.
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  assert.match(driver, /allowedConsoleErrors: viewCase\.allowedConsoleErrors \?\? \[\]/);
  assert.match(driver, /partitionConsoleErrors\(\s*consoleErrors,\s*allowedConsoleErrors\s*\)/);

  // BOTH halves of the rule reach a throw, and BOTH throws precede the return that hands the buffer
  // back to the publisher. THE GUARD AND ITS THROW ARE PINNED AS ONE STATEMENT, not as two
  // substrings that both occur somewhere.
  assert.match(
    driver,
    /\n\s*if \(unmatched\.length > 0\) \{\n\s*throw new Error\(/,
    'an unmatched console error must still throw, from an unguarded `if`'
  );
  assert.match(
    driver,
    /\n\s*if \(unusedAllowances\.length > 0\) \{\n\s*throw new Error\(/,
    'an unused allowance must throw, from an unguarded `if`'
  );
  const partition = driver.indexOf('partitionConsoleErrors(');
  const unusedThrow = driver.indexOf('unusedAllowances.length > 0', partition);
  const handOff = driver.indexOf('return { buffer, box }', partition);
  assert.ok(partition >= 0, 'the runner must consult the shared partition helper');
  assert.ok(handOff > unusedThrow, 'both gates must run before the frame is returned');

  // AND THE ALLOWANCE IS RARE BY CONSTRUCTION.
  const declaring = VIEW_LAB_CASES.filter(
    (viewCase) => (viewCase.allowedConsoleErrors ?? []).length > 0
  ).map((viewCase) => viewCase.id);
  assert.deepEqual(
    declaring,
    // The Knowledge error frame's rejected read is rethrown by the store (issue 1969).
    ['manager-recipes-blocked-enable-flash', 'manager-knowledge-error'],
    'a case gained or lost a console-error allowance; the console gate is what makes a lab frame ' +
      'evidence, so widening it is an accepted edit rather than an incidental one'
  );
});

// AN ALERT FRAME HAS TO CONTAIN ITS ALERT (issue 1515, driver capture).
// `manager-world-parties-pane-alert` PASSED its first real capture and did not depict the state it
// is named for.
test('the two alert frames assert their alert is inside the box that clips it', () => {
  const pinned = [
    // The pane's own scroller - the element `GatheringPartiesTab.svelte` binds as `scroller` and
    // gives `overflow` to. An alert scrolled above it has a box above the container's and fails.
    [
      'manager-world-parties-pane-alert',
      '.manager-travel-parties-content',
      '[data-manager-party-summary-error]',
    ],
    // The recipes flash is `position: absolute` against this route's `.manager-main`, so it does
    // not ride the row list's scroll - but that is an argument about a stylesheet, and this makes
    // it a measurement taken at capture time instead.
    ['manager-recipes-blocked-enable-flash', '.manager-main', '[data-recipe-flash]'],
  ];

  for (const [caseId, container, target] of pinned) {
    const declared = getCaseById(caseId).expectContained ?? [];
    assert.ok(
      declared.some((entry) => entry.container === container && entry.target === target),
      `${caseId} no longer asserts ${target} is contained by ${container}, so it can publish a ` +
        'frame that resolves every selector and shows none of the state it is named for'
    );
  }

  // AND THE RUNNER STILL ENFORCES IT. A declaration the driver stopped reading is configuration
  // that cannot fail, which is the same defect one level down.
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  assert.match(driver, /expectContained: viewCase\.expectContained \?\? \[\]/);
  assert.match(driver, /for \(const expectation of expectContained\)/);
});

test('resource-node interval evidence reaches over-time controls at both required window sizes', () => {
  const editorPath = 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte';
  const selected = mapChangedFilesToCases([editorPath]).map((viewCase) => viewCase.id);
  for (const [suffix, width, height] of [
    ['normal', 1280, 820],
    ['narrow', 1000, 720],
  ]) {
    const id = `manager-gathering-task-node-interval-${suffix}`;
    const viewCase = getCaseById(id);
    assert.ok(viewCase, `${id} must exercise the node-enabled system`);
    assert.ok(selected.includes(id), `${id} must be selected when its editor changes`);
    assert.equal(viewCase.query.system, 'lab-smithing');
    assert.equal(viewCase.expectView, 'gathering-task-edit');
    assert.deepEqual(viewCase.position, { width, height });
    assert.ok(viewCase.steps.some((step) => step.selector?.includes('sm-task-prospect')));
    // Chosen, not `select:`ed, since issue 1510 converted the control: the step is the factory's
    // own pair rather than two selectors spelled here, which would pin the panel's internals.
    assert.deepEqual(viewCase.steps.slice(-4), [
      ...chooseSelectOption('[data-gathering-task-node-respawn]', 'overTime'),
      { selector: '[data-gathering-task-node-interval]', fill: '1440' },
      { selector: '[data-gathering-task-nodes]', scroll: true },
    ]);
    // A trigger has no `:checked`, and the row click shuts the panel, so the choice is claimed by
    // what it unlocks: the interval row renders only under `overTime`.
    assert.equal(
      viewCase.expectSelector,
      '.manager-task-node-interval-row .fabricate-select-trigger[data-gathering-task-node-interval-unit]'
    );
    assert.equal(viewCase.expectVisible, '[data-gathering-task-node-interval]');
    assert.equal(viewCase.expectCenterHit, '[data-gathering-task-node-interval]');
    assert.equal(viewCase.expectNoHorizontalOverflow, '[data-gathering-task-nodes]');
    for (const target of [
      '[data-gathering-task-node-count]',
      '.manager-task-node-interval-row .fab-stepper',
      '[data-gathering-task-node-interval]',
      '[data-gathering-task-node-interval-unit]',
    ]) {
      assert.ok(
        viewCase.expectContained.some(
          (entry) => entry.container === '[data-gathering-task-nodes]' && entry.target === target
        ),
        `${id} must keep ${target} inside the node card`
      );
    }
  }
});

test('gathering feedback evidence reaches selected tools and all-empty fields at both sizes', () => {
  const selected = mapChangedFilesToCases([
    'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
    'src/ui/svelte/apps/manager/GatheringEventEditView.svelte',
  ]).map((entry) => entry.id);
  const emptyStateCases = mapChangedFilesToCases([
    'src/ui/svelte/components/EmptyState.svelte',
  ]).map((entry) => entry.id);
  for (const [suffix, width, height] of [
    ['normal', 1280, 820],
    ['narrow', 1000, 720],
  ]) {
    for (const state of ['task-availability', 'task-tools', 'event-availability']) {
      const id = `manager-gathering-${state}-feedback-${suffix}`;
      const viewCase = getCaseById(id);
      const kind = state.startsWith('task') ? 'task' : 'event';
      assert.ok(viewCase, id);
      assert.ok(selected.includes(id));
      if (state.endsWith('availability')) assert.ok(emptyStateCases.includes(id));
      assert.deepEqual(viewCase.position, { width, height });
      assert.equal(viewCase.expectView, `gathering-${kind}-edit`);
      for (const field of ['biomes', 'timeOfDay', 'weather']) {
        assert.ok(
          viewCase.expectSelector.includes(
            `[data-gathering-${kind}-availability-pills="${field}"] .manager-empty.is-field`
          )
        );
        assert.ok(
          viewCase.steps.some(
            (step) =>
              step.selector ===
                `[data-gathering-${kind}-availability-pill="${field}"] [data-chip-remove]` &&
              step.press === 'Space'
          ),
          `${id} must return ${field} to empty through keyboard removal`
        );
      }
      if (kind === 'task') {
        assert.ok(
          viewCase.steps.some(
            (step) =>
              step.selector === '[data-gathering-task-required-tools-card="hb-tool-mortar"]' &&
              step.press === 'Enter'
          ),
          `${id} must actually select its required tool`
        );
        assert.ok(
          viewCase.expectSelector.includes(
            '[data-gathering-task-required-tool-pill="hb-tool-mortar"] img'
          )
        );
      }
      assert.equal(viewCase.steps.at(-1).scroll, true);
      assert.ok(viewCase.expectContained.length >= 2);
    }
  }
});

test('environment empty membership evidence clears the actual fixture and is selected by its caller', () => {
  const selected = mapChangedFilesToCases([
    'src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte',
  ]).map((entry) => entry.id);
  const grove = content.environments.find((entry) => entry.id === 'hb-env-grove');
  assert.deepEqual(grove.includedRealmIds, ['hb-realm-verdant']);
  assert.deepEqual(grove.biomes, ['forest']);
  for (const [suffix, width, height] of [
    ['normal', 1280, 820],
    ['narrow', 1000, 720],
  ]) {
    const id = `manager-environment-empty-membership-${suffix}`;
    const viewCase = getCaseById(id);
    assert.ok(selected.includes(id));
    assert.deepEqual(viewCase.position, { width, height });
    assert.equal(viewCase.query.system, 'lab-herbalism');
    assert.equal(viewCase.expectView, 'environment-edit');
    assert.ok(viewCase.steps.some((step) => step.selector === '[data-gathering-realm-toggle]'));
    for (const [kind, member] of [
      ['realm', grove.includedRealmIds[0]],
      ['biome', grove.biomes[0]],
    ]) {
      assert.equal(
        viewCase.steps.filter(
          (step) =>
            step.selector === `[data-environment-${kind}-pill="${member}"] [data-chip-remove]` &&
            step.press === 'Space'
        ).length,
        2,
        `${id} clears, adds, then removes the last ${kind}`
      );
      // The add step is `chooseSelectOption`'s pair since issue 1510, not the `select:` verb.
      assert.ok(
        viewCase.steps.some((step) =>
          step.selector?.endsWith(`.fabricate-select-popover [data-popover-option="${member}"]`)
        ),
        `${id} adds the ${kind} back by clicking its option row`
      );
    }
    assert.equal(viewCase.expectContained.length, 4);
    for (const entry of viewCase.expectContained.filter(({ target }) =>
      target.includes('.manager-empty')
    )) {
      assert.ok(viewCase.expectSelector.includes(entry.target));
    }
    assert.deepEqual(viewCase.steps.at(-1), {
      selector: '[data-overview-section="context"]',
      scroll: true,
    });
  }
});

test('every combination-rule value the registry targets is a real MODIFIER_POLICIES member', () => {
  // Ten selectors in this registry pin a rule option by its VALUE, and NOTHING else could see them
  // go stale (issue 1095).
  const pattern = new RegExp(
    String.raw`\[` + escapeForRegExp(MODIFIER_POLICY_OPTION_ATTR) + String.raw`="([^"]*)"\]`,
    'g'
  );
  const found = [];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const selector of caseSelectors(viewCase)) {
      for (const match of selector.matchAll(pattern)) {
        found.push({ id: viewCase.id, value: match[1] });
      }
    }
  }

  // NON-EMPTY, and of the EXPECTED CARDINALITY (issue 1095).
  assert.equal(
    found.length,
    10,
    `expected 10 combination-rule selectors in the registry, found ${found.length} — ` +
      `either \`${MODIFIER_POLICY_OPTION_ATTR}\` was renamed in the registry without being ` +
      'renamed here, or cases carrying it were added or deleted'
  );

  const foreign = found.filter((entry) => !MODIFIER_POLICIES.includes(entry.value));
  assert.deepEqual(
    foreign,
    [],
    'these registry selectors target a combination rule that is not in MODIFIER_POLICIES, so ' +
      'they match nothing and the capture job fails whole:\n  ' +
      foreign.map((entry) => `${entry.id}: "${entry.value}"`).join('\n  ')
  );
});

test('the combination-rule scan reads expectSelector, not only steps', () => {
  // The property that keeps the check above honest, asserted rather than assumed.
  const fromExpect = VIEW_LAB_CASES.filter((viewCase) =>
    (viewCase.expectSelector ?? '').includes(MODIFIER_POLICY_OPTION_ATTR)
  ).map((viewCase) => viewCase.id);
  assert.ok(
    fromExpect.length > 0,
    'no case pins a combination rule through `expectSelector` any more, so the scan above no ' +
      'longer proves it covers that field — re-point it at whichever field now carries one'
  );
  // …and the same for the step field, so neither half can be dropped unnoticed.
  const fromSteps = VIEW_LAB_CASES.filter((viewCase) =>
    (viewCase.steps ?? []).some(
      (step) =>
        typeof step === 'object' && (step.selector ?? '').includes(MODIFIER_POLICY_OPTION_ATTR)
    )
  ).map((viewCase) => viewCase.id);
  assert.ok(fromSteps.length > 0, 'no case CLICKS a combination rule any more');
  assert.notDeepEqual(fromExpect, fromSteps, 'the two fields must be genuinely distinct sets');
});

test('the hooks the capture driver hard-codes still exist in the UI', () => {
  // These are the load-bearing selectors no case names, so nothing else can notice them going away
  // (issue 1520).
  const haystack = [...emittingSources().values()].join('\n');
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
  // at capture time.
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
  assert.deepEqual(
    declaredArray('PRESS_KEYS'),
    [...PRESS_KEYS].sort(),
    'the driver accepts a different press-key vocabulary than this file admits'
  );
});

test('no two cases claiming exact reach produce the same frame', () => {
  // Identical inputs produce a byte-identical PNG, by construction. This is mechanical where
  // reading the registry is not.
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

test('the no-selection World Parties case clears selection through the real Manager store', () => {
  const noSelection = getCaseById('manager-world-parties-no-selection');
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');

  assert.equal(noSelection.query?.clearSystem, '1');
  assert.deepEqual(noSelection.smokeLabels, []);
  assert.match(mountSource, /clearSystem: params\.get\('clearSystem'\) === '1'/);
  assert.match(mountSource, /clearSystem: params\.clearSystem/);
  assert.match(mountSource, /if \(params\.clearSystem\) await props\.store\.selectSystem\(''\)/);
});

test("the two day-one repair frames drop the fixture's OWN world component records", () => {
  // BOTH OF THESE CASES PHOTOGRAPH AN ABSENCE, and issue 1392 authored the record that filled it
  // (issue 1540). A MIRROR GUARD IN BOTH DIRECTIONS.
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  const worldSource = readFileSync(resolve(ROOT, 'tests/view-lab/world/labWorld.js'), 'utf8');
  const emptyCatalogue = getCaseById('world-tool-entry-on-break-repair-empty-catalogue');
  const emptyPicker = getCaseById('world-tool-entry-on-break-repair-tag-picker-empty');

  // The catalogue frame needs BOTH sources gone, because they are independent.
  assert.equal(emptyCatalogue.query?.clearSystem, '1');
  assert.equal(emptyCatalogue.query?.noAuthoredWorldComponents, '1');
  // The picker frame needs only the authored one.
  assert.equal(emptyPicker.query?.noAuthoredWorldComponents, '1');
  assert.ok(!emptyPicker.query?.clearSystem, 'the picker frame keeps its crafting systems');

  assert.match(
    mountSource,
    /noAuthoredWorldComponents: params\.get\('noAuthoredWorldComponents'\) === '1'/
  );
  assert.match(mountSource, /noAuthoredWorldComponents: params\.noAuthoredWorldComponents/);
  assert.match(
    worldSource,
    /if \(noAuthoredWorldComponents\) stripAuthoredWorldComponents\(content\)/
  );
  assert.match(worldSource, /content\.componentScope = \{ entities: \[\], defaults: \{\} \}/);

  // The fixture premise the flag exists for, in the fixture's own terms.
  assert.ok(
    (content.componentScope?.entities ?? []).length > 0,
    'the lab world authors world-only component records the migration would not produce'
  );
  assert.ok(
    Object.values(content.componentScope?.defaults ?? {}).flatMap((entry) => entry?.tags ?? [])
      .length > 0,
    "and one of their defaults carries the world's only component tag"
  );
});

test('the narrow World Parties case reuses the normal populated state below the stack breakpoint', () => {
  const normal = getCaseById('manager-world-parties-normal');
  const narrow = getCaseById('manager-world-parties-stacked');

  assert.ok(narrow, 'the responsive Parties layout needs registered screenshot evidence');
  assert.deepEqual(narrow.position, { width: 1100, height: 900 });
  assert.deepEqual(narrow.query, normal.query);
  assert.deepEqual(narrow.steps, normal.steps);
  assert.equal(narrow.expectView, normal.expectView);
  assert.equal(narrow.expectSelector, normal.expectSelector);
  assert.deepEqual(narrow.smokeLabels, []);
  assert.equal(narrow.reaches, 'beyond');
  assert.ok(narrow.kinds.includes('responsive'));
});

test('the 680px World Parties case pins the card-column container breakpoint', () => {
  const normal = getCaseById('manager-world-parties-normal');
  const narrow = getCaseById('manager-world-parties-card-stacked-680');

  assert.ok(narrow, 'the <=720px party-card layout needs registered screenshot evidence');
  assert.deepEqual(narrow.position, { width: 680, height: 900 });
  assert.deepEqual(narrow.query, normal.query);
  assert.deepEqual(narrow.steps, normal.steps);
  assert.equal(narrow.expectView, normal.expectView);
  assert.match(narrow.expectSelector, /data-manager-party-body="lab-party"/);
  assert.match(narrow.expectSelector, /data-manager-party-add-open="lab-party"/);
  assert.match(narrow.expectSelector, /data-manager-party-actor-trigger="lab-party"/);
  assert.deepEqual(narrow.smokeLabels, []);
  assert.equal(narrow.reaches, 'beyond');
  assert.ok(narrow.kinds.includes('responsive'));
});

test('the World Parties fixture is legal, and its search and pager cases claim what it seeds', () => {
  const worldSource = readFileSync(resolve(ROOT, 'tests/view-lab/world/labWorld.js'), 'utf8');
  const actorSource = readFileSync(resolve(ROOT, 'tests/view-lab/world/labActors.js'), 'utf8');
  const tabSource = readFileSync(
    resolve(ROOT, 'src/ui/svelte/apps/manager/GatheringPartiesTab.svelte'),
    'utf8'
  );

  // The actor definitions, read out of the fixture: id, name and the DECLARED type, which is
  // what makes `characterActors` resolvable below rather than assumed.
  const actorsStart = actorSource.indexOf('const ACTOR_DEFINITIONS = [');
  assert.ok(actorsStart > 0, 'the actor definitions must remain locatable');
  const actors = [
    ...actorSource
      .slice(actorsStart, actorSource.indexOf('\n];', actorsStart))
      .matchAll(/id: '([\w-]+)',\s*\n\s*name: '([^']+)',(?:\s*\n\s*type: '([\w-]+)',)?/g),
  ].map(([, id, name, type]) => ({ id, name, type: type ?? 'character', uuid: `Actor.${id}` }));
  const actorNames = actors.map((actor) => actor.name);
  const characterActors = actors.filter((actor) => actor.type === 'character');
  const uuidOf = (id) => actors.find((actor) => actor.id === id)?.uuid ?? null;
  // The uuid shape this walk composes is `buildLabActors`' own, not a guess.
  assert.match(actorSource, /uuid: `Actor\.\$\{definition\.id\}`,/);

  // The seeded party list, read out of the fixture rather than restated here — with the three
  // fields legality depends on RESOLVED against those actors, not merely matched.
  const seedStart = worldSource.indexOf("put(\n    'gatheringParties',");
  assert.ok(seedStart > 0, 'the gatheringParties seed must remain locatable');
  const seedEnd = worldSource.indexOf("put('lastCraftingActor'", seedStart);
  const seed = worldSource.slice(seedStart, seedEnd);

  // Field reads are anchored to the START of a line, so a field NAMED in one of the seed's
  // comments cannot be read as a value.
  const fieldIn = (block, name) => new RegExp(`^\\s*${name}: (.+?),\\s*$`, 'm').exec(block)?.[1];

  // `characterActors`, optionally `.slice(a[, b])`, mapped to uuids.
  function resolveCharacterSubset(expression) {
    const match =
      /^characterActors(?:\.slice\((\d+)(?:,\s*(\d+))?\))?\.map\(\(actor\) => actor\.uuid\)$/.exec(
        expression
      );
    if (!match) return null;
    const [, from, to] = match;
    const subset =
      from === undefined
        ? characterActors
        : characterActors.slice(Number(from), to === undefined ? undefined : Number(to));
    return subset.map((actor) => actor.uuid);
  }

  function resolveActorUuid(expression, partyId) {
    if (expression === 'null') return null;
    const named = /^uuidOf\('([\w-]+)'\)$/.exec(expression);
    if (named) {
      const uuid = uuidOf(named[1]);
      assert.ok(uuid, `${partyId} names actor '${named[1]}', which no actor definition declares`);
      return uuid;
    }
    const indexed = /^characterActors\[(\d+)\]\??\.uuid(?:\s*\?\?\s*(.+))?$/.exec(expression);
    if (indexed) {
      const direct = characterActors[Number(indexed[1])]?.uuid;
      if (direct) return direct;
      return indexed[2] ? resolveActorUuid(indexed[2].trim(), partyId) : null;
    }
    return assert.fail(
      `${partyId} sets travelActorUuid to \`${expression}\`, which this legality walk cannot ` +
        'resolve. Extend the resolver rather than deleting the walk: an unresolvable expression ' +
        'is an unchecked one, and the lab writes this map RAW.'
    );
  }

  const starts = [...seed.matchAll(/id: '(lab-party[\w-]*)',\s*\n\s*name: '([^']+)'/g)];
  const parties = starts.map((match, index) => {
    const block = seed.slice(match.index, starts[index + 1]?.index ?? seed.length);
    const id = match[1];
    const memberExpression = fieldIn(block, 'memberActorUuids');
    const travelExpression = fieldIn(block, 'travelActorUuid');
    assert.ok(memberExpression, `${id} must declare memberActorUuids`);
    assert.ok(travelExpression, `${id} must declare travelActorUuid`);
    const members = memberExpression === '[]' ? [] : resolveCharacterSubset(memberExpression);
    assert.ok(
      members,
      `${id} sets memberActorUuids to \`${memberExpression}\`, which this legality walk cannot ` +
        'resolve. Members must derive from `characterActors` (so the vehicle can never be ' +
        'enrolled as one) or be `[]`.'
    );
    return {
      id,
      name: match[2],
      enabled: fieldIn(block, 'enabled') === 'true',
      members,
      travelActorUuid: resolveActorUuid(travelExpression, id),
    };
  });

  assert.equal(parties.length, 5, 'the pane pages at four, so five parties is the point');
  assert.equal(actors.length, 4);

  // The vehicle. Its `type` must be DECLARED and must survive `buildLabActors`, which spreads
  // the definition and then sets `type` — a hardcoded `'character'` there would have made it a
  // player character with no error, and every claim made for it false.
  assert.match(
    actorSource,
    /id: 'lab-actor-wagon',\s*\n\s*name: 'The Ashfall Wagon',\s*\n\s*type: 'vehicle',/
  );
  assert.match(actorSource, /type: definition\.type \?\? 'character',/);

  // Legality under `GatheringPartyStore._validateList`, which the lab does NOT run: it writes the
  // settings map raw and validation lives in `_persist`, so an impossible world would render and
  // publish.
  const enabled = parties.filter((party) => party.enabled);
  assert.deepEqual(
    enabled.map((party) => party.id),
    ['lab-party', 'lab-party-long-haul'],
    'exactly these two parties are enabled'
  );
  for (const party of enabled) {
    assert.ok(
      party.travelActorUuid,
      `${party.id} is enabled, and req 4 refuses to enable a party with no travel actor`
    );
  }
  const holder = new Map();
  for (const party of enabled) {
    // Deduped per party: an actor may be BOTH a member and that same party's travel actor,
    // which `lab-party` relies on. Composite uniqueness is across enabled parties.
    for (const uuid of new Set([...party.members, party.travelActorUuid].filter(Boolean))) {
      const held = holder.get(uuid);
      assert.equal(
        held,
        undefined,
        `${uuid} is associated with BOTH '${held}' and '${party.id}', and both are enabled — an ` +
          'actor may be associated with at most one enabled party'
      );
      holder.set(uuid, party.id);
    }
  }

  // The search term matches exactly two of the five, and it matches them by DIFFERENT routes: one
  // on its own name, one on its travel actor's name.
  const term = WORLD_PARTIES_SEARCH_TERM.toLowerCase();
  const byPartyName = parties.filter((party) => party.name.toLowerCase().includes(term));
  const byActorName = actorNames.filter((name) => name.toLowerCase().includes(term));
  assert.deepEqual(
    byPartyName.map((party) => party.id),
    ['lab-party-wagonwright']
  );
  assert.deepEqual(byActorName, ['The Ashfall Wagon']);
  assert.equal(
    parties.find((party) => party.id === 'lab-party-long-haul')?.travelActorUuid,
    uuidOf('lab-actor-wagon'),
    'the second match is by TRAVEL ACTOR name, which is the widened filter domain the ' +
      'filtered case exists to photograph'
  );

  const filtered = getCaseById('manager-world-parties-search-filtered');
  // The hook on the INPUT, not the row's own class: the field is `ManagerSearchField` as of
  // issue 1515, whose `class` prop lands on the `<label>` — a `fill` step targeting the label
  // would throw — so the case types into the `inputAttrs` hook the caller passes through.
  assert.deepEqual(filtered.steps.at(-1), {
    selector: '[data-manager-party-search]',
    fill: WORLD_PARTIES_SEARCH_TERM,
  });
  assert.deepEqual(filtered.smokeLabels, []);
  for (const id of ['lab-party-long-haul', 'lab-party-wagonwright']) {
    assert.ok(filtered.expectSelector.includes(`[data-manager-travel-party-id="${id}"]`));
  }

  // The page arithmetic the last-page case photographs, derived from the same seed and from
  // the tab's own default rather than asserted as two magic numbers.
  assert.match(tabSource, /const PAGE_SIZE_OPTIONS = \[3, 6, 9\];/);
  const declaredPageSize = Number(/let pageSize = \$state\((\d+)\)/.exec(tabSource)?.[1]);
  assert.equal(declaredPageSize, 3);
  assert.equal(Math.ceil(parties.length / declaredPageSize), 2, 'five records is two pages');
  assert.equal(parties.length - declaredPageSize, 2, 'the last page holds the trailing two cards');
  // The pager itself is gated on the smallest offered size, so a seed below it would photograph a
  // pane with no footer at all — and the last-page case would have no control to reach page two
  // with.
  const declaredPageSizes = /const PAGE_SIZE_OPTIONS = \[([\d, ]+)\];/
    .exec(tabSource)?.[1]
    .split(',')
    .map((size) => Number(size.trim()));
  assert.ok(Array.isArray(declaredPageSizes) && declaredPageSizes.length > 0);
  assert.match(
    tabSource,
    /const PAGER_THRESHOLD = PAGE_SIZE_OPTIONS\[0\];/,
    'the threshold is derived from the smallest offered page size, not restated'
  );
  const declaredPagerThreshold = declaredPageSizes[0];
  assert.equal(declaredPagerThreshold, declaredPageSize, 'and equals the default page size');
  assert.ok(parties.length >= declaredPagerThreshold, 'the seed opens the pager gate');
  const lastPage = getCaseById('manager-world-parties-last-page');
  assert.ok(
    lastPage.expectSelector.includes(`[data-manager-travel-party-id="${parties.at(-1).id}"]`)
  );
  assert.ok(
    lastPage.expectSelector.includes(
      `:not(:has([data-manager-travel-party-id="${parties[0].id}"]))`
    )
  );

  // THE REFUSED ENABLE (issue 1515), derived from the same parsed seed, the same `holder` map the
  // uniqueness walk above built, and the same page size the last-page case is held to.
  const alertCase = getCaseById('manager-world-parties-pane-alert');
  const alertPartyId = /data-manager-party-enable="([^"]+)"/.exec(
    alertCase.steps.map((step) => step.selector ?? '').join(' ')
  )?.[1];
  assert.ok(alertPartyId, 'the pane-alert case must press a named party enable pill');
  const alertParty = parties.find((party) => party.id === alertPartyId);
  assert.ok(
    alertParty,
    `the pane-alert case presses "${alertPartyId}", which the seeded party list does not hold`
  );
  assert.equal(
    alertParty.enabled,
    false,
    `${alertPartyId} is enabled, so the case's press DISABLES it - which is never refused, and ` +
      'the frame would be the resting parties pane under a case named for the alert'
  );
  const alertAssociations = [
    ...new Set([...alertParty.members, alertParty.travelActorUuid].filter(Boolean)),
  ];
  assert.ok(
    alertAssociations.some((uuid) => holder.has(uuid)),
    `${alertPartyId} associates no actor that an enabled party already holds, so enabling it ` +
      'would SUCCEED and no pane alert would render'
  );

  // And the card has to be on the RESTING page: the case takes no pager step, so a card the
  // first page does not hold has no enable pill in the DOM for its step to press.
  assert.ok(
    parties.slice(0, declaredPageSize).some((party) => party.id === alertPartyId),
    `${alertPartyId} is not on the parties pane's first page, so its enable pill is not rendered ` +
      'and the capture aborts on that step'
  );

  // The empty state reaches its world through the seeded setting, not a post-construction call.
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  const empty = getCaseById('manager-world-parties-empty');
  assert.equal(empty.query?.noParties, '1');
  assert.deepEqual(empty.smokeLabels, []);
  assert.match(mountSource, /noParties: params\.get\('noParties'\) === '1'/);
  assert.match(mountSource, /noParties: params\.noParties/);
  assert.match(worldSource, /noParties\s*\n?\s*\? \[\]/);
});

test('the Knowledge loading and error frames reach their state through the snapshot seam', () => {
  // Neither state is reachable in the smoke, so each case is `beyond` and its only route is the
  // lab's own override of the manager's snapshot builder (issue 1969).
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  for (const [id, param] of [
    ['manager-knowledge-loading', 'knowledgeLoading'],
    ['manager-knowledge-error', 'knowledgeError'],
  ]) {
    const capture = getCaseById(id);
    assert.equal(capture.query?.[param], '1', `${id} does not set ${param}`);
    assert.equal(capture.reaches, 'beyond', `${id} claims the smoke reaches it`);
    assert.deepEqual(capture.smokeLabels, [], `${id} names a smoke label`);
    assert.match(mountSource, new RegExp(`${param}: params\\.get\\('${param}'\\) === '1'`));
    assert.match(
      mountSource,
      new RegExp(`params\\.${param}\\s*\\?\\s*\\{\\s*_buildKnowledgeSnapshot:`),
      `mount.js does not guard a _buildKnowledgeSnapshot override with params.${param}`
    );
  }
});

test('the World Tools Catalogue search terms match exactly the rows their frames claim', async () => {
  // WHY THIS EXISTS AT ALL is the reason its parties counterpart above does: an over-match is
  // INVISIBLE in a screenshot.
  const [{ buildLabContent }, { worldToolSearchText }] = await Promise.all([
    import('./view-lab/world/labContent.js'),
    import('../src/ui/svelte/apps/manager/scoped/worldToolStudio.js'),
  ]);
  const content = buildLabContent();

  // THE DOMAIN IS THE UNION, and that is what makes the derivation honest rather than convenient.
  const seeded = new Map(content.toolScope.entities.map((entity) => [entity.id, entity]));
  const domain = [
    ...content.toolScope.entities,
    ...content.tools
      .filter((tool) => !seeded.has(tool.id))
      // The shape the lift produces, in the fields the search reads. `label` is the authored
      // display override and it is what the row draws when a tool carries one.
      .map((tool) => ({
        id: tool.id,
        name: tool.label ?? tool.name,
        description: tool.description ?? '',
        originItemUuid: tool.originItemUuid,
        registeredItemUuid: tool.registeredItemUuid,
      })),
  ];
  assert.equal(domain.length, 12, 'the lab catalogue holds twelve rows');

  const survivors = (term) =>
    domain
      .filter((entity) => worldToolSearchText({ entity }).includes(term.toLowerCase()))
      .map((entity) => entity.id)
      .sort();

  assert.deepEqual(
    survivors(WORLD_TOOL_SEARCH_TERM),
    ['rw-tool-punch', 'rw-tool-stylus'],
    'the search frame claims exactly these two rows'
  );
  assert.deepEqual(
    survivors(WORLD_TOOL_SEARCH_MISS_TERM),
    [],
    'and the filtered-empty frame claims a term nothing answers'
  );

  // NON-VACUITY: a `searchOf` that answered the empty string for everything would satisfy both
  // assertions above, and so would a domain the filter reads nothing from.
  assert.ok(
    survivors('tool').length > 0,
    'the search text is non-empty; the two assertions above are answering something'
  );

  // AND THE CASES ACTUALLY TYPE THEM. The constants are exported so the two ends cannot drift,
  // which only holds while the cases still read them.
  assert.deepEqual(getCaseById('world-tool-catalogue-search').steps.at(-1), {
    selector: '[data-scoped-list-search]',
    fill: WORLD_TOOL_SEARCH_TERM,
  });
  assert.deepEqual(getCaseById('world-tool-catalogue-filtered-empty').steps.at(-1), {
    selector: '[data-scoped-list-search]',
    fill: WORLD_TOOL_SEARCH_MISS_TERM,
  });
  assert.ok(
    getCaseById('world-tool-catalogue-search').expectContained.some(
      (rule) => rule.target === '[data-scoped-list-row="rw-tool-punch"]'
    ),
    'the second survivor is asserted, so a filter that widened to one row fails the capture'
  );
});

test('World Downtime publishes four tabs plus narrow/collapsed frames with generic browser assertions', () => {
  const allCases = VIEW_LAB_CASES.filter((entry) => entry.id.startsWith('manager-world-downtime-'));
  assert.deepEqual(
    allCases.map((entry) => entry.id),
    [
      'manager-world-downtime-tracking',
      'manager-world-downtime-activities',
      'manager-world-downtime-factions',
      'manager-world-downtime-settings',
      'manager-world-downtime-narrow',
      'manager-world-downtime-collapsed',
      'manager-world-downtime-test-companion-installed',
      // The companion driving Core's own route header.
      'manager-world-downtime-test-companion-chrome',
      // Issue 1302 — the parent rollup, appended after the four tab cases (never inserted
      // among them): the manifest above is order-sensitive and `cases.slice(0, 4)` below is
      // index-based, so a new case has to land after both without disturbing either.
      'manager-world-downtime-test-companion-rollup',
      // Issue 1332 — the companion NAVIGATING, appended for the same reason.
      'manager-world-downtime-test-companion-tab-navigation',
    ]
  );
  // The Core-preview frames and the premium-installed frame prove DIFFERENT things and cannot share
  // one assertion loop: Core's `Unlock with Premium` CTA and its scrolling preview pane are Core's
  // own content, and the spec says neither is rendered over a companion's screens — so requiring
  // the CTA of every downtime case would pin exactly the defect it forbids.
  const withCompanion = allCases.filter((entry) => entry.query?.downtimeProvider === '1');
  assert.equal(
    withCompanion.length,
    4,
    'the frames that register the stand-in companion are no longer four'
  );
  const named = (id) => {
    const found = withCompanion.find((entry) => entry.id === id);
    assert.ok(Boolean(found), `${id} is no longer registered as a stand-in companion frame`);
    return found;
  };
  const premium = named('manager-world-downtime-test-companion-installed');
  const companionChrome = named('manager-world-downtime-test-companion-chrome');
  const rollup = named('manager-world-downtime-test-companion-rollup');
  const cases = allCases.filter((entry) => !withCompanion.includes(entry));
  for (const viewCase of cases) {
    assert.equal(viewCase.expectView, 'world-downtime');
    assert.ok(viewCase.expectNoHorizontalOverflow);
    assert.ok(viewCase.expectOverflowY);
    assert.ok(viewCase.expectVisible, `${viewCase.id} proves its keyboard tooltip is visible`);
    assert.equal(viewCase.expectContained.length, 2, `${viewCase.id} checks both World rail icons`);
    assert.equal(
      viewCase.expectCenterHit,
      '.downtime-preview:not([hidden]) .downtime-cta',
      `${viewCase.id} checks the CTA pointer target`
    );
    assert.equal(
      viewCase.expectClick,
      '.downtime-preview:not([hidden]) .downtime-cta',
      `${viewCase.id} checks the CTA accepts a real pointer click`
    );
  }
  /**
   * `expectOverflowY` above is what every downtime case owes: the PANEL owns the vertical overflow,
   * not the shell around it. It used to be required of all six, and the preview satisfied it by
   * carrying a 720px `min-height` that no content asked for.
   */
  const scrolls = cases.filter((entry) => entry.expectScrollable);
  assert.deepEqual(
    scrolls.map((entry) => entry.id),
    ['manager-world-downtime-narrow'],
    'the narrow frame is the one whose window really overflows, and it proves the pane scrolls'
  );
  assert.equal(
    getCaseById('manager-world-downtime-narrow').expectScrollable,
    '.downtime-preview-scroll'
  );
  const normal = cases.slice(0, 4);
  for (const viewCase of normal) {
    assert.ok(
      ['tracking', 'activities', 'factions', 'settings'].every((tabId) =>
        viewCase.expectAttributes.some(
          (entry) =>
            entry.selector === `[data-downtime-tab="${tabId}"]` &&
            entry.name === 'aria-controls' &&
            entry.value === `world-downtime-panel-${tabId}`
        )
      ),
      `${viewCase.id} proves all four tab/panel IDREFs`
    );
  }
  const narrow = cases.find((entry) => entry.id.endsWith('-narrow'));
  assert.deepEqual(narrow.expectNoHorizontalOverflow, [
    '[data-world-downtime-host]',
    '.manager-main',
    '.manager-body',
    '.fabricate-manager',
  ]);
  assert.deepEqual(narrow.position, { width: 960, height: 900 });
  assert.match(
    narrow.expectAttributes.find((entry) => entry.name === 'aria-label').value,
    /campaign-wide tracking and pending decisions/i
  );
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  for (const contract of [
    'expectAttributes: viewCase.expectAttributes ?? []',
    'expectVisible: viewCase.expectVisible ?? null',
    'expectContained: viewCase.expectContained ?? []',
    'expectCenterHit: viewCase.expectCenterHit ?? null',
    'expectClick: viewCase.expectClick ?? null',
    'expectNoHorizontalOverflow: viewCase.expectNoHorizontalOverflow ?? null',
    'expectOverflowY: viewCase.expectOverflowY ?? null',
    'expectScrollable: viewCase.expectScrollable ?? null',
  ]) {
    assert.ok(driver.includes(contract), `capture runner should thread ${contract}`);
  }
  assert.match(driver, /await clickTarget\.click\(\)/, 'expectClick uses Playwright pointer input');
  assert.doesNotMatch(
    driver,
    /element\.click\(\);\s*return count === 1/,
    'expectClick does not fall back to a synthetic DOM click'
  );

  // The four tab cases hand-copy `Tabs.<Tab>.Tooltip` into an `expectVisible` text match, so
  // the registry is a MIRROR of `lang/en.json` and mirrors rot silently: a lang edit would
  // leave these frames waiting for a caption that no longer exists, and the failure would
  // surface in the capture run rather than here. Pin the mirror instead.
  const lang = JSON.parse(readFileSync(resolve(ROOT, 'lang/en.json'), 'utf8'));
  const downtimeTabs = lang.FABRICATE.Admin.Manager.World.Downtime.Tabs;
  for (const viewCase of cases.slice(0, 4)) {
    const tabId = viewCase.id.replace('manager-world-downtime-', '');
    const tabKey = tabId[0].toUpperCase() + tabId.slice(1);
    assert.ok(
      viewCase.expectVisible.includes(downtimeTabs[tabKey].Tooltip),
      `${viewCase.id} expects the shipped ${tabKey} tooltip verbatim`
    );
  }

  // Issue 1185 — the premium-installed frame.
  assert.equal(premium.expectView, 'world-downtime');
  assert.equal(premium.query.downtimeProvider, '1', 'the premium frame registers a companion');
  // Issue 1213 — the rail lock. The frame has to REACH the locked state or it proves nothing: the
  // lab world seeds an expanded rail and cases cannot override a lab setting, so a run that never
  // presses the toggle is pixel-identical with and without the lock.
  assert.deepEqual(
    premium.steps.map((step) => step.selector),
    ['[data-manager-rail-toggle]', '#manager-world-nav-downtime'],
    'the premium frame collapses the rail first, then enters the route the lock applies to'
  );
  assert.equal(
    premium.expectSelector,
    '.manager-body:not(.is-rail-collapsed) [data-manager-rail-toggle][disabled][aria-pressed="false"]',
    'and asserts the rail displayed expanded under a disabled control reading the display state'
  );
  assert.equal(
    premium.expectScrollable,
    '[data-lab-companion-scroll]',
    'the companion owns the scrolling, which is only reachable at the full panel height'
  );
  assert.ok(
    premium.expectVisible.includes(lang.FABRICATE.Admin.Manager.Titlebar.Premium),
    'the badge caption is the shipped titlebar premium mark'
  );
  const premiumAttribute = (selector, name) =>
    premium.expectAttributes.find((entry) => entry.selector === selector && entry.name === name)
      ?.value;
  assert.equal(
    premiumAttribute('[data-manager-titlebar-premium]', 'aria-label'),
    lang.FABRICATE.Admin.Manager.Titlebar.PremiumStatus
  );
  assert.equal(
    premiumAttribute('#manager-world-nav-downtime', 'title'),
    lang.FABRICATE.Admin.Manager.World.Downtime.InstalledTooltip,
    'and the rail tooltip is the installed wording, not the unlock offer'
  );
  assert.equal(
    premiumAttribute('[data-world-nav-premium]', 'data-world-nav-premium-state'),
    'installed',
    'the frame proves the rail chip is the muted variant'
  );
  assert.equal(
    premiumAttribute('[data-manager-rail-toggle]', 'title'),
    lang.FABRICATE.Admin.Manager.Nav.RailLockedOpen,
    'and the locked control explains itself with the sidebar string, not the section one'
  );

  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  // WHERE THE TAB FIELDS LAND, read back out of the lab provider that supplies them, because this
  // frame is the only place the two are rendered side by side.
  const labLedger = mountSource.match(
    /id: 'ledger',\s*\n\s*label: '([^']+)',\s*\n\s*accessibleName: '([^']+)',/
  );
  assert.ok(labLedger, "the lab companion still declares a 'ledger' tab with both name fields");
  assert.notEqual(
    labLedger[2],
    labLedger[1],
    'which proves anything only while the fixture keeps the two genuinely different'
  );
  assert.equal(
    premiumAttribute('#manager-downtime-nav-ledger', 'aria-label'),
    labLedger[2],
    "the rail sub-item consumes the provider tab's accessibleName"
  );
  assert.equal(
    premiumAttribute('#world-downtime-panel-ledger', 'aria-labelledby'),
    'manager-downtime-nav-label-ledger',
    'and the region is named by the rail LABEL element, whose text is the visible tab label'
  );
  assert.match(mountSource, /applyLongDowntimeLocalization\(world\)/);
  assert.match(
    mountSource,
    /params\.downtimeProvider[\s\S]{0,200}registerWorldNavProvider/,
    'the premium frame registers its companion through the production registry'
  );
  assert.doesNotMatch(
    mountSource,
    /longDowntimeLabels[\s\S]{0,900}registerWorldNavProvider/,
    'long-copy evidence keeps the real Core fallback provider active'
  );

  // Issue 1302 — the parent rollup, on a closed disclosure with zero interaction (AC-19).
  assert.equal(rollup.expectView, 'systems', 'reached with no interaction, on the systems browser');
  assert.equal(
    rollup.query?.downtimeProvider,
    '1',
    'a provider is registered so the rollup can render'
  );
  assert.deepEqual(rollup.steps, [], 'the default state, not a state reached by clicking anything');
  assert.match(
    rollup.expectSelector,
    /data-world-downtime-badge-total/,
    'proves the rollup itself is present'
  );
  assert.match(
    rollup.expectSelector,
    /:not\(:has\(\[data-world-nav-premium\]\)\)/,
    'and proves the muted PREMIUM chip is a DOM removal here, not merely restyled — the two ' +
      'never coexist in the parent row’s one trailing track'
  );
  const rollupLabelAttribute = rollup.expectAttributes.find(
    (entry) => entry.selector === '[data-world-downtime-badge-total]' && entry.name === 'aria-label'
  );
  assert.ok(rollupLabelAttribute, 'the rollup states its own accessible name');
  // The lab provider's only badge lives on `ledger`, so the total is that badge's own count —
  // proving the arithmetic sums the RESOLVED value once per tab, never registered-plus-runtime.
  const labBadge = mountSource.match(
    /id: 'ledger',[\s\S]{0,400}?badge: \{ count: (\d+), accessibleName: '[^']+' \}/
  );
  assert.ok(labBadge, "the lab companion's ledger tab still declares a badge");
  assert.equal(
    rollupLabelAttribute.value,
    `${labBadge[1]} updates`,
    "the rollup's aria-label states the lab provider's own badge total, unformatted"
  );
  assert.deepEqual(
    rollup.expectContained,
    [{ container: '#manager-world-nav-downtime', target: '[data-world-downtime-badge-total]' }],
    'the rollup sits inside the parent row it replaces the chip in'
  );
  // Issue 1302 — the sub-item badge is keyed on the tab id on BOTH sides, matching the
  // rollup's own pair above: `expectContained` resolves each side with `document.querySelector`
  // and is first-match, not strict, so an unkeyed pair (e.g. `.manager-nav-subitem`) would
  // silently compare the first sub-item's box against the first badge's box instead of the
  // ledger row's own pair, and ship green while mis-targeting the capture.
  assert.deepEqual(
    premium.expectContained,
    [
      { container: '#manager-world-nav-parties', target: '#manager-world-nav-parties > i' },
      { container: '#manager-world-nav-downtime', target: '#manager-world-nav-downtime > i' },
      {
        container: '[data-world-downtime-item="ledger"]',
        target: '[data-world-downtime-badge="ledger"]',
      },
    ],
    'the premium-installed frame pins its own tab-id-keyed badge containment, not just the rollup'
  );

  // Issue 1332 — the navigating frame.
  const tabNavigation = named('manager-world-downtime-test-companion-tab-navigation');
  assert.deepEqual(
    tabNavigation.steps.map((step) => step.selector),
    ['#manager-world-nav-downtime', '[data-lab-companion-tab-link]'],
    'the destination is reached by pressing the COMPANION’s own control'
  );
  assert.ok(
    tabNavigation.steps.every((step) => !step.selector.startsWith('#manager-downtime-nav-')),
    'and never by pressing the rail sub-item, which would reach the same frame for free'
  );
  assert.match(
    mountSource,
    /data-lab-companion-tab-link[\s\S]{0,600}navigateToTab/,
    'and the control it presses is the one the stand-in wires to context.navigateToTab'
  );
  assert.equal(
    tabNavigation.expectSelector,
    '[data-downtime-extension-panel="crew"]',
    'the frame asserts the DESTINATION tab’s panel, not the one that asked'
  );
  const followed = tabNavigation.expectAttributes.filter((entry) => entry.name === 'aria-current');
  assert.deepEqual(
    followed,
    [
      { selector: '#manager-downtime-nav-crew', name: 'aria-current', value: 'true' },
      { selector: '#manager-downtime-nav-ledger', name: 'aria-current', value: null },
    ],
    'and asserts the RAIL followed — both that it moved and that it left, which one side alone ' +
      'would not distinguish from a rail that marks every sub-item current'
  );
});

test('system Travel Map evidence is populated and long-label focus cannot duplicate stacked', () => {
  const normal = getCaseById('manager-world-travel-map-normal');
  const stacked = getCaseById('manager-world-travel-map-stacked');
  const longLabel = getCaseById('manager-world-travel-long-label-focus');
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  const contentSource = readFileSync(resolve(ROOT, 'tests/view-lab/world/labContent.js'), 'utf8');
  const worldSource = readFileSync(resolve(ROOT, 'tests/view-lab/world/labWorld.js'), 'utf8');
  const runnerSource = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');

  for (const viewCase of [normal, stacked]) {
    assert.match(viewCase.expectSelector, /Scene\.lab-map\.Region\.deep-gate/);
    assert.match(viewCase.expectSelector, /manager-map-link-name/);
    assert.match(viewCase.expectSelector, /manager-travel-region-item-name/);
  }
  assert.match(contentSource, /name: 'The Underdeep'/);
  assert.match(contentSource, /sceneRegionUuid: 'Scene\.lab-map\.Region\.deep-gate'/);
  assert.match(worldSource, /name: 'Deep Gate Approach'/);
  assert.equal(longLabel.query?.longTravelLabels, '1');
  assert.deepEqual(longLabel.smokeLabels, []);
  assert.equal(longLabel.distinctEvidenceGroup, stacked.distinctEvidenceGroup);
  assert.match(mountSource, /longTravelLabels: params\.get\('longTravelLabels'\) === '1'/);
  assert.match(worldSource, /Map Region Links Across the Active Scene/);
  assert.match(runnerSource, /evidence frame is byte-identical to/);
});

test('system Travel Map no-regions evidence reaches its world through the lab flag', () => {
  const empty = getCaseById('manager-world-travel-map-empty');
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  const worldSource = readFileSync(resolve(ROOT, 'tests/view-lab/world/labWorld.js'), 'utf8');

  assert.equal(empty.query?.noSceneRegions, '1');
  assert.deepEqual(empty.smokeLabels, []);
  // The no-regions icon; the no-scene empty state draws a different one.
  assert.match(empty.expectSelector, /\.fa-map-location-dot/);
  assert.match(mountSource, /noSceneRegions: params\.get\('noSceneRegions'\) === '1'/);
  assert.match(mountSource, /noSceneRegions: params\.noSceneRegions/);
  assert.match(worldSource, /regions: noSceneRegions\s*\n?\s*\? \[\]/);
  // The interactable seed throws on a scene without the `deep-gate` region.
  assert.match(worldSource, /!noSceneRegions && worldHasInteractableSources/);
});

test('every crafting case claims exactly the resolution-mode body it renders', () => {
  // The crafting cases carry a per-MODE `sourceMatches` pattern so that editing
  // `detail/ProgressiveBody.svelte` selects the four progressive frames rather than all 27. That
  // narrowing is only safe while each case's declared mode matches the mode it actually renders,
  // and the case list is hand-maintained — so derive the truth from the fixture instead.
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
  // draft, and passed clean. 31 rather than 28 as of issue 1513, and the three that joined are
  // three DIFFERENT things this scan now sees.
  assert.equal(
    examined.length,
    41,
    `expected the 34 crafting-path cases to be examined, saw ${examined.length}`
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
  // into one tag list.
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
  // `.application { max-height: calc(100vh - 1.5 * var(--hotbar-height)) }`.
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

  // AND EVERY CASE'S OWN GEOMETRY, NOT ONLY EACH APP'S DEFAULT (issue 1392). A case may override
  // `position`, and an override above the clamp does not render taller — it renders CLAMPED, at a
  // height nobody declared, with no signal at all.
  const tooTall = VIEW_LAB_CASES.filter((viewCase) => viewCase.position.height > ceiling)
    .map((viewCase) => `${viewCase.id}: ${viewCase.position.height}px`)
    .sort();
  assert.deepEqual(
    tooTall,
    [],
    `\`.application\` is clamped to \`100vh - 1.5 * hotbar\`, which is ${ceiling}px at the ` +
      `driver's ${CAPTURE_VIEWPORT.width}x${CAPTURE_VIEWPORT.height} context. A case declaring ` +
      'more is silently photographed at the clamp:\n  ' +
      tooTall.join('\n  ')
  );
  // NON-VACUITY: the ceiling has to be a real number the cases could exceed, or the filter above
  // quantifies over nothing meaningful.
  assert.ok(ceiling > 0 && ceiling < CAPTURE_VIEWPORT.height, `implausible ceiling ${ceiling}`);
  assert.ok(
    VIEW_LAB_CASES.some((viewCase) => viewCase.position.height > ceiling - 100),
    'no case comes within 100px of the ceiling, so this clause is not measuring the registry it ' +
      'quantifies over'
  );
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

  // A shared primitive or a global stylesheet can change every screen (issue 1515).
  assert.deepEqual(ids(['styles/fabricate.css']).sort(), [
    'fabricate-app-shell',
    'manager-components-normal',
    'manager-gathering-task-editor-normal',
    'manager-world-downtime-collapsed',
    'manager-world-downtime-tracking',
  ]);

  // An unmatched render file still yields evidence rather than none.
  assert.deepEqual(ids(['src/ui/svelte/apps/SomeBrandNewRoot.svelte']), [FALLBACK_CASE_ID]);
});

test('the broad SearchablePopover signal captures every deliberate picker state, in both apps', () => {
  const selected = mapChangedFilesToCases([
    'src/ui/svelte/components/SearchablePopover.svelte',
  ]).map((viewCase) => viewCase.id);

  // Three overrides, not one, because the primitive has three modes and no frame shows another's
  // chrome (issue 1458).
  assert.deepEqual(
    selected.sort((a, b) => a.localeCompare(b)),
    [
      'fabricate-app-shell',
      'manager-components-normal',
      'manager-essences-source-picker',
      'manager-gathering-task-availability-menu',
      'manager-recipe-edit-ingredients-or-menu',
      'manager-recipe-edit-tag-picker',
      // THE NINTH AND TENTH OVERRIDES (issue 1513), and they are two capabilities rather than two
      // more instances of one.
      'manager-recipe-item-contents-picker',
      'manager-world-parties-actor-picker',
      'manager-world-parties-realm-override-picker',
      'player-actor-picker',
      'player-crafting-sources-picker',
      'world-tool-entry-on-break-repair-tag-picker-empty',
    ]
  );
});

test('the broad SearchablePopoverPanel signal captures every deliberate picker state (issue 1719)', () => {
  const selected = mapChangedFilesToCases([
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
  ]).map((viewCase) => viewCase.id);

  // The representative pair plus the panel's fifteen overrides.
  assert.deepEqual(
    selected.sort((a, b) => a.localeCompare(b)),
    [
      'fabricate-app-shell',
      'interactables-manager-region-open',
      'manager-components-normal',
      'manager-essences-source-picker',
      'manager-gathering-task-availability-menu',
      'manager-recipe-edit-crafting-modifier-cap-reached',
      'manager-recipe-edit-ingredients-or-menu',
      'manager-recipe-edit-tag-picker',
      'manager-recipe-item-contents-picker',
      'manager-recipes-bulk-edit-check-tier',
      'manager-system-edit-lists',
      'manager-world-parties-actor-picker',
      'manager-world-parties-realm-override-picker',
      'player-actor-picker',
      'player-crafting-sources-picker',
      'player-inventory-page-size',
      'world-tool-entry-on-break-repair-tag-picker-empty',
    ]
  );
});

// The thirty-three frames a change to the shared positioning seam must publish: every case whose
// walk leaves a panel measured, clamped and portaled, across both application roots and the two GM
// canvas windows (issues 1500, 1503, 1504, 1520). Issue 1510's thirteen are the converted manager
// selects whose panel sits somewhere no other frame puts one: inside a card or a row the walk
// authors, in an editor, in an inspector rail, in a browse toolbar row of siblings, under a trigger
// wider than its rung's ceiling at a one-column window, addressed by a caption id, or at a panel
// floor the call site raises above its rung's.
const ANCHORED_POPOVER_FRAMES = [
  'interactables-config-source-open',
  'interactables-manager-region-open',
  'manager-books-scrolls-cap-filter-list',
  'manager-checks-trigger-operator-list',
  'manager-component-edit-category-list',
  'manager-components-essence-filter-list',
  'manager-environment-danger-level-list',
  'manager-environment-edit-automatic-force-add',
  'manager-essences-source-picker',
  'manager-gathering-condition-current-list',
  'manager-gathering-task-availability-menu',
  'manager-gathering-task-node-respawn-list',
  'manager-gathering-task-stamina-modifier-list',
  'manager-gathering-tasks-availability-filter-list',
  'manager-recipe-edit-ingredients-kind-list',
  'manager-recipe-edit-ingredients-or-menu',
  'manager-recipe-edit-tag-picker',
  'manager-recipe-item-contents-picker',
  'manager-recipes-bulk-edit-check-tier',
  'manager-recipes-bulk-edit-picker',
  'manager-recipes-inspector-route-list',
  'manager-system-edit-lists',
  'manager-tool-preview-actor-list',
  'manager-tool-rules-sort-key-list',
  'manager-world-parties-actor-picker',
  'manager-world-parties-realm-override-picker',
  'player-actor-picker',
  'player-crafting-category-filter-list',
  'player-crafting-sources-picker',
  'player-inventory-page-size',
  'player-inventory-sort-list',
  'player-journal-sort-list',
  'world-tool-entry-on-break-repair-tag-picker-empty',
];

// The anchored-panel class families a member's own `expectSelector` can name: every portaled panel
// in the tree is either a `*-popover` or the action menu's `fabricate-action-menu-panel`.
const ANCHORED_PANEL_CLAIM = /popover|action-menu-panel/u;

// The one member whose selector claims no panel. Its walk DOES open the shared icon picker, but its
// `expectSelector` was spent on issue 1117's bounds pair, so it is listed here by name rather than
// silently tolerated by a weaker clause.
const ANCHORED_POPOVER_FRAMES_WITHOUT_A_PANEL_CLAIM = ['manager-system-edit-lists'];

test('every anchored-popover frame claims an open panel in its own expectSelector', () => {
  // The membership list above is gated against `sourceMatches` routing and NOTHING ELSE: reducing
  // either issue 1510 case's `expectSelector` to a bare `.fabricate-manager` left all of this
  // file's registry tests green. So the sentence the failure message makes about what each id
  // proves is asserted here rather than only asserted about.
  const byId = new Map(VIEW_LAB_CASES.map((viewCase) => [viewCase.id, viewCase]));
  const claimless = [];
  for (const id of ANCHORED_POPOVER_FRAMES) {
    const viewCase = byId.get(id);
    assert.ok(Boolean(viewCase), `${id} is listed as an anchored-popover frame but is not a case`);
    if (!ANCHORED_PANEL_CLAIM.test(viewCase.expectSelector ?? '')) claimless.push(id);
  }
  assert.deepEqual(
    claimless,
    ANCHORED_POPOVER_FRAMES_WITHOUT_A_PANEL_CLAIM,
    'these frames are published for the positioning seam but their own `expectSelector` names no ' +
      'portaled panel, so the capture would pass with the panel closed and the evidence the seam ' +
      'is published for cannot move'
  );
});

for (const seamFile of [
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/util/overlayBounds.js',
]) {
  test(`${seamFile} publishes every frame that rests on an open panel`, () => {
    const selected = mapChangedFilesToCases([seamFile]).map((viewCase) => viewCase.id);

    assert.deepEqual(
      selected.sort((a, b) => a.localeCompare(b)),
      ANCHORED_POPOVER_FRAMES,
      `a change confined to ${seamFile} publishes the wrong set of frames. Every id here is a ` +
        'frame whose walk leaves a panel measured, clamped and portaled, so a regression in that ' +
        'pass is visible in each of them and in no other frame in the registry; the clause above ' +
        'asserts each one says so in its own `expectSelector`, bar the one exception it names. ' +
        'A SHORTER list means a case dropped the seam from its `sourceMatches` ' +
        'and now shows a panel nothing routes to; a LONGER one means the seam was added to a ' +
        'frame that draws its trigger closed, which publishes evidence that cannot move.'
    );
  });
}

test('the player top bar routes to the frame that opens its picker, not only to the one that draws it', () => {
  // Before issue 1475 the bar sat under `src/ui/svelte/components/`, a broad signal, so it
  // published the representative pair and nothing else — and in both of those frames the picker is
  // CLOSED.
  const selected = mapChangedFilesToCases(['src/ui/svelte/apps/ActorSelectTopBar.svelte']).map(
    (viewCase) => viewCase.id
  );

  assert.deepEqual(
    selected.sort((a, b) => a.localeCompare(b)),
    ['fabricate-app-shell', 'player-actor-picker']
  );
});

// The NEW `.js` modules this change adds under the checks tree, and the frames a change confined to
// each of them must still select (issue 1095, C2). STATED AS A POSITIVE PIN, not as a
// `FALLBACK_CASE_ID` probe.
const NEW_CHECKS_MODULES = [
  [
    'src/ui/svelte/apps/manager/checks/modifierPolicyAttrs.js',
    ['manager-checks-crafting-modifiers', 'manager-checks-crafting-modifier-max-picks'],
  ],
  [
    'src/ui/svelte/apps/manager/checks/checksReadiness.js',
    ['manager-checks-crafting-modifiers', 'manager-checks-validation'],
  ],
  // The Checks rail GROUP model (issue 1096). It determines the entire rail and the four route ids,
  // so a change confined to it must select the frames that show them.
  [
    'src/ui/svelte/apps/manager/checks/checksNav.js',
    ['manager-checks-rail-group', 'manager-checks-rail-dirty'],
  ],
  // The outcome simulator and the odds enumerator (issue 1097).
  [
    'src/ui/svelte/apps/manager/checks/checkPreview.js',
    ['manager-checks-crafting-simulator-rolled'],
  ],
  [
    'src/ui/svelte/apps/manager/checks/checkOdds.js',
    [
      'manager-checks-crafting-odds-enumerable',
      'manager-checks-crafting-odds-not-enumerable',
      'manager-checks-crafting-odds-progressive',
    ],
  ],
];

test('a change confined to a new checks module selects the frames it determines', () => {
  const ids = (files) => mapChangedFilesToCases(files).map((viewCase) => viewCase.id);
  for (const [modulePath, determined] of NEW_CHECKS_MODULES) {
    assert.ok(
      sourceFiles.includes(modulePath),
      `${modulePath} names no file under src/ — a renamed module makes this probe inert`
    );
    const selected = ids([modulePath]);
    assert.ok(selected.length > 0, `${modulePath} selects no case at all`);
    const missing = determined.filter((id) => !selected.includes(id));
    assert.deepEqual(
      missing,
      [],
      `${modulePath} determines these frames but does not select them:\n  ${missing.join('\n  ')}`
    );
    assert.ok(
      !selected.includes(FALLBACK_CASE_ID),
      `${modulePath} fell through to the fallback, so the frames it determines go unpublished`
    );
  }
});

test('the new-module pin is capable of failing, on a path outside every pattern', () => {
  // The capability proof the pin above needs, and the one thing it cannot demonstrate about
  // itself: a path that matches NO `sourceMatches` pattern falls through to the fallback, so
  // "never the fallback" is a real constraint rather than an unreachable one.
  const ids = (files) => mapChangedFilesToCases(files).map((viewCase) => viewCase.id);
  assert.deepEqual(
    ids(['src/ui/svelte/apps/manager/checks/notARealModule.js']).includes(FALLBACK_CASE_ID),
    false,
    'the checks DIRECTORY prefix already admits any .js under it, matched or not — which is ' +
      'exactly why the fallback premise was withdrawn'
  );
  assert.deepEqual(
    ids(['src/ui/svelte/apps/SomeBrandNewRoot.svelte']),
    [FALLBACK_CASE_ID],
    'a render file outside every pattern DOES reach the fallback, so the assertion above is ' +
      'testing a reachable state rather than an impossible one'
  );
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
  // The smoke does not use one manager size.
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
  for (const viewCase of VIEW_LAB_CASES) {
    assert.ok(
      ['exact', 'window', 'beyond'].includes(viewCase.reaches),
      `case "${viewCase.id}" must declare reaches: 'exact' | 'window' | 'beyond'`
    );
  }
});

test('every case records the smoke labels it corresponds to', () => {
  // The pairing is what makes a side-by-side possible, and what makes "which smoke frame does this
  // replace?" answerable without reading the capture walk.
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

/** The smoke script, read once, so the label cross-check below answers against the live harness. */
const smokeHarnessSource = SMOKE_SOURCE;

/** A capture label's SHAPE: lowercase kebab with at least one hyphen. */
const SMOKE_LABEL_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/**
 * The text between a balanced pair of delimiters, starting at the opener.
 *
 * @param {string} source The file text.
 * @param {number} openIndex Index of the opening delimiter.
 * @param {string} open The opening delimiter.
 * @param {string} close The closing delimiter.
 * @returns {string} The enclosed text, or '' when it never closes.
 */
function balancedSlice(source, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return '';
}

/**
 * The helpers that FORWARD their own `label` binding into `screenshot(page, label)`.
 *
 * @returns {string[]} Function names.
 */
function labelForwardingHelpers() {
  const names = [];
  for (const match of smokeHarnessSource.matchAll(
    /(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g
  )) {
    const parenIndex = smokeHarnessSource.indexOf('(', match.index);
    if (parenIndex === -1) continue;
    const params = balancedSlice(smokeHarnessSource, parenIndex, '(', ')');
    if (!/\blabel\b/.test(params)) continue;
    const braceIndex = smokeHarnessSource.indexOf('{', parenIndex + params.length + 1);
    if (braceIndex === -1) continue;
    const body = balancedSlice(smokeHarnessSource, braceIndex, '{', '}');
    if (/screenshot\(\s*page\s*,\s*label\b/.test(body)) names.push(match[1]);
  }
  return names;
}

/**
 * Every label the smoke harness can actually write a PNG under.
 *
 * @returns {Set<string>} Emitted labels.
 */
function smokeEmittedLabels() {
  const emitted = new Set();
  const admit = (value) => {
    if (SMOKE_LABEL_SHAPE.test(value)) emitted.add(value);
  };
  for (const match of smokeHarnessSource.matchAll(/screenshot\(\s*page\s*,\s*'([^']+)'/g)) {
    emitted.add(match[1]);
  }
  for (const match of smokeHarnessSource.matchAll(/\blabel:\s*'([^']+)'/g)) admit(match[1]);
  for (const match of smokeHarnessSource.matchAll(/\[\s*'[^']+'\s*,\s*'([^']+)'\s*\]/g)) {
    admit(match[1]);
  }
  for (const name of labelForwardingHelpers()) {
    for (const call of smokeHarnessSource.matchAll(new RegExp(String.raw`\b${name}\s*\(`, 'g'))) {
      const parenIndex = smokeHarnessSource.indexOf('(', call.index + name.length);
      if (parenIndex === -1) continue;
      for (const literal of balancedSlice(smokeHarnessSource, parenIndex, '(', ')').matchAll(
        /'([^']+)'/g
      )) {
        admit(literal[1]);
      }
    }
  }
  return emitted;
}

test('every declared smoke label is one the harness can actually emit', () => {
  // THE GAP THIS CLOSES, AND WHY IT MATTERS (issue 1520).
  const emitted = smokeEmittedLabels();

  // NON-VACUITY FIRST, because every clause below quantifies over this set: an extraction that
  // silently matched nothing would report zero unknown labels and read as a clean bill of health.
  assert.ok(
    emitted.size >= 150,
    `only ${emitted.size} capture labels were extracted from the smoke harness; the extraction is ` +
      'probably broken, which would make every assertion below vacuous'
  );
  // And a NEGATIVE control, named rather than generic: the exact string the wrong revision used.
  assert.ok(
    !emitted.has('interactable-config'),
    '"interactable-config" is a step id, not a capture label. If it is being extracted as one, ' +
      'this check can no longer tell a label from a step and would have passed the error it exists ' +
      'to catch'
  );

  const unknown = publishableCases()
    .flatMap((viewCase) =>
      (viewCase.smokeLabels ?? [])
        .filter((label) => !emitted.has(label))
        .map((label) => `${viewCase.id}: ${label}`)
    )
    .sort();

  assert.deepEqual(
    unknown,
    [],
    'these cases claim a smoke counterpart the harness never captures, so "which smoke frame does ' +
      'this replace?" has no answer. Either the label is wrong, or the case reaches BEYOND the ' +
      "smoke and must say so with `reaches: 'beyond'` and an empty array:\n  " +
      unknown.join('\n  ')
  );
});

// What a change to the lab's OWN inputs costs (issue 1000).

const REGISTRY_PATH = 'scripts/lib/viewLabCases.js';
const LAB_ACTORS_PATH = 'tests/view-lab/world/labActors.js';
const LAB_MOUNT_PATH = 'tests/view-lab/mount.js';
// The Manager application, read for ONE claim: that the stores the lab's settle pass waits on
// are names its service bag does not declare, which is what makes that pass player-only.
/** The manager shell's collaborators, stubbed: nothing below calls one. */
const STUB_MANAGER_IO = Object.freeze({
  adminStore: () => null,
  knowledgeSnapshot: () => null,
  expendRecipeItemUse: () => null,
  deleteOwnedRecipeItem: () => null,
  eraseLearnedRecipe: () => null,
  resetActorKnowledge: () => null,
});
const RUNNER_PATH = 'scripts/view-lab-screenshots.mjs';
const sourceOf = (path) => readFileSync(resolve(ROOT, path), 'utf8').split('\n');
const caseFileSources = new Map(VIEW_LAB_CASE_FILES.map(({ path }) => [path, sourceOf(path)]));
const labActorsSource = sourceOf(LAB_ACTORS_PATH);
const labMountSource = sourceOf(LAB_MOUNT_PATH);

/** @returns {string[]} The ids a changed set selects, in registry order. */
const selectedIds = (files, options) =>
  mapChangedFilesToCases(files, options).map((viewCase) => viewCase.id);

/** The 1-based line holding an exact piece of text, asserted so a rename fails loudly, not as line 0. */
function lineOf(source, text, where) {
  const index = source.indexOf(text);
  assert.notEqual(index, -1, `${where} no longer contains the line: ${text}`);
  return index + 1;
}

const labActorsLineOf = (text) => lineOf(labActorsSource, text, LAB_ACTORS_PATH);

/**
 * A unified diff claiming those 1-based lines of a file were just ADDED, with the three lines of
 * context either side that `git` emits, and contiguous lines grouped into one hunk as it groups
 * them.
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

/**
 * Text for a `-` line: content the checkout does NOT have, which is what every removed line in a
 * `pulls/{n}/files` patch is. Deliberately not a comment and not blank.
 *
 * @param {number} index Which removed line this is.
 * @returns {string} A non-inert source line this repo does not contain.
 */
const removedText = (index) =>
  `      { selector: '.a-line-this-checkout-does-not-have-${index}' },`;

/**
 * A unified diff for an EDIT — a hunk carrying `-` lines — rather than for a pure addition.
 *
 * @param {string[]} source The file the patch describes, by line.
 * @param {object} edit The edit to describe.
 * @param {number} edit.line The 1-based line of `source` the hunk is centred on.
 * @param {number} [edit.removed] How many `-` lines to emit immediately before it.
 * @param {boolean} [edit.replaced] True to emit `source[line - 1]` as `+` (a replace run), false to
 * emit it as context (a deletion-only hunk, which adds nothing at all).
 * @returns {string} The patch.
 */
function patchEditing(source, { line, removed = 1, replaced = true }) {
  const from = Math.max(1, line - 3);
  const to = Math.min(source.length, line + 3);
  const body = [];
  for (let number = from; number <= to; number += 1) {
    if (number === line) {
      for (let index = 0; index < removed; index += 1) body.push(`-${removedText(index)}`);
    }
    body.push(`${number === line && replaced ? '+' : ' '}${source[number - 1]}`);
  }

  const counted = (marker) => body.filter((text) => text.startsWith(marker)).length;
  const context = counted(' ');
  return [
    `@@ -${from},${context + counted('-')} +${from},${context + counted('+')} @@`,
    ...body,
  ].join('\n');
}

/** @returns {object} The `patches` option carrying one patch for one path. */
const patchesFor = (path, patch) => ({ patches: { [path]: patch } });

/** One file, with the helpers that name a line of it and build a patch adding those lines. */
function fileAt(path) {
  const source = caseFileSources.get(path) ?? sourceOf(path);
  return {
    path,
    source,
    lineOf: (text) => lineOf(source, text, path),
    patches: (lineNumbers) => patchesFor(path, patchAdding(source, lineNumbers)),
  };
}

/** The case file declaring a case's literal, asserted so a generated case fails rather than drifts. */
function caseFile(id) {
  const found = [...caseFileSources].find(([, source]) => source.includes(`    id: '${id}',`));
  assert.ok(found, `no case file declares a literal for "${id}"`);
  return fileAt(found[0]);
}

/** The 1-based line of a case's own `id:` line, in its own file. */
const caseIdLine = (id) => caseFile(id).lineOf(`    id: '${id}',`);

/** The ids a patch at those lines of a case's own file selects. */
function selectedForCase(id, lineNumbers) {
  const file = caseFile(id);
  return selectedIds([file.path], file.patches(lineNumbers));
}

/** True when some case file declares this case as a literal. */
const isInlineCase = (id) =>
  [...caseFileSources.values()].some((source) => source.includes(`    id: '${id}',`));

/** @returns {object} The `patches` option carrying one patch for the lab's actor fixture. */
const labActorsPatches = (lineNumbers) =>
  patchesFor(LAB_ACTORS_PATH, patchAdding(labActorsSource, lineNumbers));

/** Every line of a case's literal, from the factory call that opens it to the line that closes it. */
function caseLiteralLines(id) {
  const { source } = caseFile(id);
  const idLine = caseIdLine(id);
  let start = idLine;
  while (start > 1 && !/^ {2}[A-Za-z]\w*\(\{$/.test(source[start - 1])) start -= 1;
  let end = idLine;
  while (end < source.length && source[end - 1] !== '  }),') end += 1;
  assert.ok(start < idLine && end > idLine, `could not bound the case literal for "${id}"`);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

test('a labRunStates change selects the player windows that render runs — not none, not all', () => {
  // Its whole output is the three actor run containers and the `gatheringBlindRuns` world setting,
  // and only the player window reads either: the Journal in its entirety, the Crafting tab's run
  // summary, the Gathering tab's in-flight rows.
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

test('every lab input the registry cannot attribute selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

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
    assert.deepEqual(
      selectedIds([file]),
      [...LAB_SURFACE_CASE_IDS],
      `${file} must select one frame of every surface`
    );
  }

  // The regression the whole rule exists to prevent, asserted as itself.
  assert.notDeepEqual(mapChangedFilesToCases(['tests/view-lab/world/labContent.js']), []);
  // …and the other direction, which is the point of coverage: it is a real narrowing, not the
  // corpus wearing a new name.
  assert.ok(coverage < publishableCases().length / 3, 'coverage must be a fraction of the corpus');
});

// Surface coverage.

/**
 * The coverage set as `selectedIds` returns it: registry order, so a `deepEqual` against it pins
 * MEMBERSHIP and not merely a count.
 */
const coverageIds = () => [...LAB_SURFACE_CASE_IDS];

/** Each app's cases, by the surface key the registry derives for them. */
function casesBySurface() {
  const groups = new Map();
  for (const viewCase of publishableCases()) {
    const key = labSurfaceKey(viewCase);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(viewCase);
  }
  return groups;
}

test('surface coverage holds exactly one publishable case per surface, and misses none', () => {
  const groups = casesBySurface();

  // A PARTITION, asserted in both directions: one representative per surface, and no surface
  // without one.
  assert.deepEqual(
    [...new Set(LAB_SURFACE_CASES.map((viewCase) => labSurfaceKey(viewCase)))].sort(),
    [...groups.keys()].sort(),
    'coverage must contain every surface, exactly once'
  );
  assert.equal(LAB_SURFACE_CASES.length, groups.size);
  for (const viewCase of LAB_SURFACE_CASES) {
    assert.ok(viewCase.publish, `${viewCase.id} is in coverage but does not publish`);
    assert.ok(getCaseById(viewCase.id), `${viewCase.id} is not a registry case`);
  }

  // The partition above derives BOTH sides from `labSurfaceKey`, so it is satisfied by any key at
  // all — including one that returns each case's own id, under which every case becomes its own
  // surface and coverage narrows nothing.
  assert.ok(
    [...groups.values()].some((group) => group.length > 1),
    'labSurfaceKey must fold a surface’s variants together — a key that consolidates nothing ' +
      'satisfies every assertion here while leaving coverage the size of the corpus'
  );

  // Both windows, and both of them by the app's own account rather than by counting ids.
  assert.deepEqual(
    [...new Set(LAB_SURFACE_CASES.map((viewCase) => viewCase.app))].sort(),
    [...new Set(publishableCases().map((viewCase) => viewCase.app))].sort(),
    'coverage must photograph every application the registry renders'
  );
  // Every manager route, every player tab, and every application theme — derived from the cases
  // rather than listed.
  for (const [axis, read] of [
    ['expectView', (viewCase) => viewCase.expectView],
    ['query.tab', (viewCase) => viewCase.query?.tab],
    ['query.colorScheme', (viewCase) => viewCase.query?.colorScheme],
  ]) {
    const values = (cases) => [...new Set(cases.map(read).filter(Boolean))].sort();
    assert.deepEqual(
      values([...LAB_SURFACE_CASES]),
      values(publishableCases()),
      `coverage must reach every ${axis} the registry declares`
    );
  }
  // …and the light pair by name, because the axis check above passes as long as ONE light frame
  // survives, while the pair exists precisely because the two windows are built differently.
  for (const id of ['coverage-theme-light-player', 'coverage-theme-light-manager']) {
    assert.ok(LAB_SURFACE_CASE_IDS.includes(id), `${id} is the only frame of its cascade`);
  }
});

test('the surface key falls back to the case id when a case declares neither route nor tab', () => {
  // Unreachable from the registry today — every manager case declares `expectView` and every player
  // case a `query.tab`, both separately gated above — so the fallback is asserted against synthetic
  // cases rather than left to a future one to discover.
  const app = VIEW_LAB_CASES[0].app;
  const first = labSurfaceKey({ app, id: 'lab-surface-probe-one' });
  const second = labSurfaceKey({ app, id: 'lab-surface-probe-two' });

  assert.notEqual(first, second, 'two unclassifiable cases must not share one surface');
  assert.match(first, /lab-surface-probe-one/, 'the fallback keys on the case id');
  // And it does not silently key on `undefined`, which is the shape the collapse would take.
  assert.doesNotMatch(first, /undefined/);
});

test('a surface is represented by a frame that shows it, not by a variant of it', () => {
  // Derive default geometry from the app's exact smoke counterparts, not from the number of
  // prototype variants. Adding Journal states cannot redefine another screen's smoke geometry.
  const modalPosition = (app) => {
    const counts = new Map();
    const exact = publishableCases().filter(
      (entry) => entry.app === app && entry.reaches === 'exact'
    );
    for (const viewCase of exact.length ? exact : publishableCases()) {
      if (viewCase.app !== app) continue;
      const size = `${viewCase.position.width}x${viewCase.position.height}`;
      counts.set(size, (counts.get(size) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  };
  const defaults = new Map(
    [...new Set(publishableCases().map((viewCase) => viewCase.app))].map((app) => [
      app,
      modalPosition(app),
    ])
  );
  const sizeOf = (viewCase) => `${viewCase.position.width}x${viewCase.position.height}`;

  for (const [key, group] of casesBySurface()) {
    const chosen = LAB_SURFACE_CASES.find((viewCase) => labSurfaceKey(viewCase) === key);
    assert.ok(chosen, `${key} has no representative`);

    // Only where the surface HAS such a frame. A surface photographed exclusively at 680px, or
    // exclusively behind a dialog, has no better frame to offer and must still be covered.
    if (group.some((viewCase) => sizeOf(viewCase) === defaults.get(viewCase.app))) {
      assert.equal(
        sizeOf(chosen),
        defaults.get(chosen.app),
        `${key} is represented by ${chosen.id}, a ${sizeOf(chosen)} variant, while the surface ` +
          'has a default-geometry frame'
      );
    }
    if (group.some((viewCase) => !viewCase.query?.dialog)) {
      assert.ok(
        !chosen.query?.dialog,
        `${key} is represented by ${chosen.id}, which has a dialog open over the screen it is ` +
          'supposed to show'
      );
    }

    // The third criterion, and the one that actually decides most surfaces: among the cases that
    // TIE on the two above, the representative is the least-driven.
    const tied = group.filter(
      (viewCase) =>
        (sizeOf(viewCase) === defaults.get(viewCase.app)) ===
          (sizeOf(chosen) === defaults.get(chosen.app)) &&
        Boolean(viewCase.query?.dialog) === Boolean(chosen.query?.dialog)
    );
    const fewest = Math.min(...tied.map((viewCase) => viewCase.steps?.length ?? 0));
    assert.equal(
      chosen.steps?.length ?? 0,
      fewest,
      `${key} is represented by ${chosen.id} (${chosen.steps?.length ?? 0} steps) while an ` +
        `equally-eligible frame of it needs only ${fewest}`
    );
  }
});

test('an unattributable lab input does not swallow the frames its co-changed render files select', () => {
  // The union `mapChangedFilesToCases` performs is load-bearing now in a way it was not when the
  // lab-input answer was the whole corpus: coverage does NOT contain the detailed states a render
  // file selects, so a PR touching the mount page and a component must get BOTH.
  const renderFile = 'src/ui/svelte/apps/manager/recipe/RecipeToolsTab.svelte';
  const detailed = selectedIds([renderFile]);
  const together = selectedIds(['tests/view-lab/mount.js', renderFile]);

  assert.ok(detailed.length > 0, 'the render file must select something on its own');
  for (const id of [...detailed, ...LAB_SURFACE_CASE_IDS]) {
    assert.ok(together.includes(id), `the union dropped "${id}"`);
  }
  // And it is still a union rather than a capitulation: the detailed frames of every OTHER screen
  // stay out of it.
  assert.ok(
    together.length < publishableCases().length,
    'a lab input plus one component must not select the whole corpus'
  );
});

test('widening unions with what was already attributed, at every level it can happen', () => {
  // The defect this pins shipped in the first revision of surface coverage and was caught in
  // review.
  const INSIDE_A_CASE_LITERAL = 'manager-recipe-edit-tools';
  assert.ok(
    !LAB_SURFACE_CASE_IDS.includes(INSIDE_A_CASE_LITERAL),
    'the fixture case must be outside coverage, or this test cannot see the difference'
  );

  const file = caseFile(INSIDE_A_CASE_LITERAL);
  const inside = caseIdLine(INSIDE_A_CASE_LITERAL);
  const outside = file.lineOf(ARRAY_OPEN_LINE);
  const expected = [...new Set([...LAB_SURFACE_CASE_IDS, INSIDE_A_CASE_LITERAL])];
  const inRegistryOrder = (ids) => caseIds.filter((id) => ids.includes(id));

  // Two hunks of ONE patch: one attributable, one not. (`touchedRegionKeys`.)
  assert.deepEqual(
    selectedIds([file.path], file.patches([inside, outside])),
    inRegistryOrder(expected),
    'a patch that is part attributable must keep the part it attributed'
  );

  // Two lab inputs in one change: one attributable, one not. (`selectAllLabInputCases`.)
  for (const order of [
    [file.path, 'tests/view-lab/world/labContent.js'],
    ['tests/view-lab/world/labContent.js', file.path],
  ]) {
    assert.deepEqual(
      selectedIds(order, file.patches([inside])),
      inRegistryOrder(expected),
      `an unattributable input must not discard an attributed one (${order.join(' + ')})`
    );
  }

  // The control: the attributable half ALONE still narrows to one frame, so the assertions above
  // are about the union rather than about a narrowing that quietly stopped working.
  assert.deepEqual(selectedForCase(INSIDE_A_CASE_LITERAL, [inside]), [INSIDE_A_CASE_LITERAL]);
});

test('a region-attributed input widens by union too, and so does a straddling hunk', () => {
  // The two widening call sites the union test above does not reach.
  const playerIds = publishableCases()
    .filter((viewCase) => viewCase.app === 'fabricate-app')
    .map((viewCase) => viewCase.id);
  const inRegistryOrder = (ids) => caseIds.filter((id) => ids.includes(id));

  // Two hunks of one labActors patch: one inside a stock fixture table, one in a shared builder.
  const inTable = labActorsLineOf("    'sm-iron-ore': 12,");
  const inBuilder = labActorsLineOf('export function buildLabActors(content) {');
  assert.deepEqual(
    selectedIds([LAB_ACTORS_PATH], labActorsPatches([inTable, inBuilder])),
    inRegistryOrder([...new Set([...playerIds, ...LAB_SURFACE_CASE_IDS])]),
    'a part-attributable fixture patch must keep the player frames its table feeds'
  );
  // The control: the table hunk alone still narrows to the player frames and nothing else, so the
  // assertion above is about the union rather than about a narrowing that stopped working.
  assert.deepEqual(
    selectedIds([LAB_ACTORS_PATH], labActorsPatches([inTable])),
    inRegistryOrder(playerIds)
  );

  // ONE hunk that STRADDLES a boundary: two adjacent changed lines, the first the closing line of a
  // case literal and the second the array's spread of `journalBlindRunCases()` — which is a call to
  // shared code and therefore inside no region at all.
  const journal = fileAt(fileDeclaring('  ...journalBlindRunCases(),'));
  const spread = journal.lineOf('  ...journalBlindRunCases(),');
  assert.equal(
    journal.source[spread - 2],
    '  }),',
    'the line above the spread must close a case'
  );
  const closedCase = caseIdByLineIn(journal.path).get(spread - 1);
  assert.ok(closedCase, 'the line above the spread must be inside a parsed case region');

  const straddling = selectedIds([journal.path], journal.patches([spread - 1, spread]));
  assert.ok(
    straddling.includes(closedCase),
    `a hunk straddling a case boundary dropped "${closedCase}", the half it could attribute`
  );
  for (const id of LAB_SURFACE_CASE_IDS) {
    assert.ok(straddling.includes(id), `the straddling hunk dropped coverage frame "${id}"`);
  }
});

test('the two Access roster frames are pinned to the crowded roster the shim seeds', () => {
  // A MIRROR GUARD ACROSS FOUR FILES THAT KNOW NOTHING ABOUT EACH OTHER (issue 1515): the two case
  // literals here, `mount.js`'s query layer, `installFoundryShim.js`'s roster table and
  // `GrantAccessInspector.svelte`'s own page size.
  const shimSource = readFileSync(
    resolve(ROOT, 'tests/view-lab/foundry/installFoundryShim.js'),
    'utf8'
  );
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  const inspectorSource = readFileSync(
    resolve(ROOT, 'src/ui/svelte/apps/manager/GrantAccessInspector.svelte'),
    'utf8'
  );

  // The seeded roster, read off the table rather than off a count the table does not state.
  const table = /const LAB_EXTRA_PLAYER_USERS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(shimSource);
  assert.ok(table, 'the shim no longer declares the opt-in extra player roster this pin reads');
  const seededNames = [...table[1].matchAll(/name: '([^']+)'/gu)].map((found) => found[1]);
  assert.ok(seededNames.length > 0, 'the roster table parsed to no users, so nothing below binds');
  // Plus the resting world's own single non-GM user, which the seeder keeps at the head.
  const rosterSize = seededNames.length + 1;

  const pageSize = Number(/const ROSTER_PAGE_SIZE = (\d+);/.exec(inspectorSource)?.[1]);
  assert.ok(Number.isInteger(pageSize) && pageSize > 0, 'the inspector states no roster page size');

  // The two claims the paged frame rests on, in the order they fail: a FULL first page, and a
  // SECOND page to put a bar under it.
  assert.ok(
    rosterSize >= pageSize,
    `the seeded roster is ${rosterSize} and the page size ${pageSize}, so page one is not full ` +
      'and the selector the paged frame declares cannot resolve'
  );
  assert.ok(
    rosterSize > pageSize,
    `the seeded roster is ${rosterSize} at a page size of ${pageSize}, which is ONE page — so ` +
      'the pager the frame is named for does not render at all'
  );

  const paged = getCaseById('manager-access-recipe-roster-paged');
  const noMatch = getCaseById('manager-access-recipe-roster-no-match');
  for (const viewCase of [paged, noMatch]) {
    assert.equal(
      viewCase.query?.manyPlayers,
      '1',
      `${viewCase.id} must ask for the crowded roster`
    );
    assert.equal(viewCase.query?.system, 'lab-alchemy', `${viewCase.id} needs a restricted system`);
    assert.deepEqual(viewCase.smokeLabels, [], `${viewCase.id} has no smoke counterpart`);
    assert.equal(viewCase.reaches, 'beyond', `${viewCase.id} is beyond the smoke walk`);
  }

  // The flag, end to end. Both halves, because reading the param without acting on it and acting
  // on a param nothing parses fail in opposite directions and both render the resting roster.
  assert.match(mountSource, /manyPlayers: params\.get\('manyPlayers'\) === '1'/);
  assert.match(mountSource, /if \(params\.manyPlayers\) world\.shim\.seedPlayerRoster\(\);/);
  assert.match(shimSource, /seedPlayerRoster\(\) \{/);

  // The paged frame's selector names the page size it was derived from, so a page size that
  // changed without this case changing with it fails here rather than in a capture.
  assert.ok(
    paged.expectSelector.includes(`[data-access-player-row]:nth-child(${pageSize})`),
    `the paged case must name the roster's own page size (${pageSize}) as the row it proves`
  );

  // And the miss term misses. `matches()` in the inspector is a case-insensitive substring test
  // over the user's name, so this is the same predicate the screen runs.
  const needle = ACCESS_ROSTER_SEARCH_MISS_TERM.trim().toLowerCase();
  assert.ok(needle.length > 0, 'an empty term matches everything and the no-match frame is a lie');
  const hits = ['Lab Player', ...seededNames].filter((name) => name.toLowerCase().includes(needle));
  assert.deepEqual(
    hits,
    [],
    `${ACCESS_ROSTER_SEARCH_MISS_TERM} matches ${hits.join(', ')}, so the no-match frame would ` +
      'publish a roster row under a case named for the line that stands in for one'
  );
  assert.equal(noMatch.steps.at(-1).fill, ACCESS_ROSTER_SEARCH_MISS_TERM);
  assert.equal(noMatch.steps.at(-1).selector, '[data-access-roster-search="players"]');
});

// The registry totals used to be hand-copied into four documents, and they drifted three separate
// times: `AGENTS.md` once claimed 155 cases, `CONTRIBUTING.md` 181 and `scripts/README.md` 219 —
// three different wrong answers, none of which anything failed on. They are generated now, and
// these two tests are the gate: the region must say what the registry says, and no carrier may
// quote a count again.

/** The documents that carried a hand-copied count, plus the one that carries the generated region. */
const TOTALS_CARRIERS = Object.freeze([
  'AGENTS.md',
  'CONTRIBUTING.md',
  TOTALS_DOCUMENT,
  '.agents/skills/fabricate-orchestrator/SKILL.md',
]);

/** The six sentence shapes the generated region retired, as each document used to state it. */
const RETIRED_COUNT_PATTERNS = Object.freeze([
  /the registry holds (\d+) cases: (\d+) `exact`, (\d+) `window`, (\d+) `beyond`/,
  /which is (\d+) of the (\d+) publishable cases/,
  /There are (\d+) `exact` cases, (\d+) `window`, and (\d+) `beyond`, out of (\d+) total/,
  /the normal case, at (\d+) cases across five windows/,
  /one frame of every route and tab the lab renders, (\d+) cases/,
  /one frame of every route and tab the lab renders, (\d+) of (\d+) cases/,
]);

/** A carrier with the generated region cut out, so the guard cannot read the writer's own output. */
function outsideGeneratedRegion(markdown) {
  const lines = totalsRegion().split('\n');
  const [start] = lines;
  const end = lines.at(-1);
  const from = markdown.indexOf(start);
  if (from === -1) return markdown;
  const to = markdown.indexOf(end, from);
  assert.ok(to !== -1, `a totals region opened by ${start} has no ${end}`);
  return markdown.slice(0, from) + markdown.slice(to + end.length);
}

test('the generated totals region says what the registry says, exactly once', () => {
  const carrier = readFileSync(resolve(ROOT, TOTALS_DOCUMENT), 'utf8');
  const expected = totalsRegion();
  assert.equal(
    carrier.split(expected).length,
    2,
    `${TOTALS_DOCUMENT}'s totals region is stale or duplicated — run \`npm run viewlab:totals\`. ` +
      `It should read once:\n${expected}`
  );
});

test('the totals writer replaces one region and refuses a missing or duplicated one', () => {
  const region = totalsRegion();
  const document = `intro\n\n${region}\n\nouter\n`;
  assert.equal(withTotalsRegion(document, region), document, 'a current region is a no-op');
  const stale = document.replace(region, `${region.split('\n')[0]}\nstale\n${region.split('\n').at(-1)}`);
  assert.equal(withTotalsRegion(stale, region), document, 'a stale region is replaced in place');
  assert.throws(() => withTotalsRegion('no region here\n', region), /has no/u);
  assert.throws(() => withTotalsRegion(`${document}${region}\n`, region), /more than one/u);
});

test('no carrier quotes a registry count outside the generated region', () => {
  for (const carrier of TOTALS_CARRIERS) {
    const prose = outsideGeneratedRegion(readFileSync(resolve(ROOT, carrier), 'utf8'));
    for (const pattern of RETIRED_COUNT_PATTERNS) {
      assert.ok(
        !pattern.test(prose),
        `${carrier} states a registry count in prose again (${pattern}). The numbers are ` +
          `generated into ${TOTALS_DOCUMENT}; point at that region instead of copying it.`
      );
    }
  }
});

test('a lab-input-only change selects frames while leaving the evidence gate unarmed', () => {
  // The two answers are deliberately different, and the asymmetry looks like a bug in isolation —
  // which is why it is pinned.
  const fixtureOnly = ['tests/view-lab/world/labContent.js'];

  assert.equal(hasUiChanges(fixtureOnly), false, 'a fixture-only change must not arm the gate');
  assert.deepEqual(
    selectedIds(fixtureOnly),
    coverageIds(),
    'and it must still select the frames the capture job verifies'
  );
});

test('no single changed file selects more than one window, and every lab input reaches coverage', () => {
  // The invariant this narrowing exists for, asserted over the real tree rather than over a handful
  // of sampled paths: no ONE file — no component, no stylesheet, no lab input — can demand a
  // capture of every state of every screen. The ceiling is DERIVED, not a ratio.
  const total = publishableCases().length;
  const perApp = new Map();
  for (const viewCase of publishableCases()) {
    perApp.set(viewCase.app, (perApp.get(viewCase.app) ?? 0) + 1);
  }
  const ceiling = Math.max(...perApp.values());
  const labInputs = [
    'tests/view-lab/world/labContent.js',
    'tests/view-lab/world/labActors.js',
    'tests/view-lab/world/labRunStates.js',
    'tests/view-lab/mount.js',
    'scripts/lib/viewLabCases.js',
    ...VIEW_LAB_CASE_FILES.map(({ path }) => path),
    'scripts/lib/viewLabLayoutAssertion.js',
    'scripts/lib/foundryChromeSpec.js',
    'scripts/view-lab-screenshots.mjs',
  ];

  const worst = [...sourceFiles, ...labInputs]
    .map((file) => [file, mapChangedFilesToCases([file]).length])
    .sort((a, b) => b[1] - a[1]);

  assert.ok(
    worst[0][1] <= ceiling,
    `"${worst[0][0]}" alone selects ${worst[0][1]} of ${total} frames, over the ${ceiling} in the ` +
      'largest single window — some pattern has widened past the window it belongs to'
  );
  assert.ok(ceiling < total, 'one window must be less than both windows, or this measures nothing');

  // The lower bound, which is what proves the sweep exercised the widening path at all rather than
  // reporting a suspiciously tidy number because every file resolved to one or two frames.
  assert.ok(
    worst[0][1] >= LAB_SURFACE_CASE_IDS.length,
    'the swept set includes unattributable lab inputs, so the worst entry cannot be below coverage'
  );
});

/** The modules under the case directory that declare no cases: everything else is a manifest entry. */
const SHARED_CASE_MODULES = Object.freeze([
  'broadSignals.js',
  'caseConstants.js',
  'caseFactories.js',
  'journalBlindRunCases.js',
  'journalHistoryCases.js',
  'journalLifecycleCases.js',
]);

const CASE_FILE_DIRECTORY = 'scripts/lib/view-lab-cases';

test('the manifest names every case file under the directory, and only case files', () => {
  const declared = VIEW_LAB_CASE_FILES.map(({ path }) => path);
  assert.deepEqual(
    declared.filter((path, index) => declared.indexOf(path) !== index),
    [],
    'a case file is listed twice in the manifest, so its cases would be captured twice'
  );

  const onDisk = readdirSync(resolve(ROOT, CASE_FILE_DIRECTORY)).filter((name) =>
    name.endsWith('.js')
  );
  const unaccounted = onDisk.filter(
    (name) =>
      !declared.includes(`${CASE_FILE_DIRECTORY}/${name}`) && !SHARED_CASE_MODULES.includes(name)
  );
  assert.deepEqual(
    unaccounted,
    [],
    `these files sit under ${CASE_FILE_DIRECTORY}/ and are in neither the manifest nor the ` +
      'shared-module list, so whatever they declare is captured by nothing:\n  ' +
      unaccounted.join('\n  ')
  );

  // And the allowlist cannot carry a name that has gone, or one the manifest also claims.
  for (const name of SHARED_CASE_MODULES) {
    assert.ok(onDisk.includes(name), `${name} is allowlisted but no longer exists`);
    assert.ok(
      !declared.includes(`${CASE_FILE_DIRECTORY}/${name}`),
      `${name} is both allowlisted as a shared module and named by the manifest`
    );
  }
  assert.deepEqual(
    declared.filter((path) => !onDisk.includes(path.slice(CASE_FILE_DIRECTORY.length + 1))),
    [],
    'the manifest names a case file that is not on disk'
  );
});

test('every case file opens its array exactly once, on the line the selector parses it by', () => {
  for (const { path, cases } of VIEW_LAB_CASE_FILES) {
    const opens = caseFileSources.get(path).filter((line) => line.startsWith(ARRAY_OPEN_LINE));
    assert.deepEqual(
      opens.length,
      1,
      `${path} carries ${opens.length} lines starting "${ARRAY_OPEN_LINE}" — the selector reads ` +
        'the first and stops, so any other count attributes part of the file to nothing'
    );
    assert.ok(cases.length > 0, `${path} declares no cases, so it earns no manifest entry`);
  }
});

test('a patch inside any case file attributes to that file\'s own case, and nothing else', () => {
  const attributed = new Set();
  for (const { path, cases } of VIEW_LAB_CASE_FILES) {
    const file = fileAt(path);
    const inline = cases.map((viewCase) => viewCase.id).filter((id) => isInlineCase(id));
    assert.ok(inline.length > 0, `${path} declares no case literal, so no patch can be attributed`);

    for (const id of [inline[0], inline[Math.floor(inline.length / 2)], inline.at(-1)]) {
      assert.deepEqual(
        selectedIds([path], file.patches([caseIdLine(id)])),
        [id],
        `a one-line patch at "${id}" in ${path} must select that case alone`
      );
      attributed.add(id);
    }

    assert.deepEqual(
      selectedIds([path], file.patches([file.lineOf(ARRAY_OPEN_LINE)])),
      coverageIds(),
      `a patch outside every literal of ${path} must widen to surface coverage`
    );
  }

  assert.ok(attributed.size >= VIEW_LAB_CASE_FILES.length, 'every case file must be exercised');

  for (const name of SHARED_CASE_MODULES) {
    const path = `${CASE_FILE_DIRECTORY}/${name}`;
    const shared = fileAt(path);
    assert.deepEqual(
      selectedIds([path], shared.patches([shared.source.length - 2])),
      coverageIds(),
      `a patch on the shared module ${path} must select one frame of every surface`
    );
  }
});

test('every case literal parses as its own attributable region', () => {
  for (const { path, cases } of VIEW_LAB_CASE_FILES) {
    const file = fileAt(path);
    const inline = cases.map((viewCase) => viewCase.id).filter((id) => isInlineCase(id));
    assert.deepEqual(
      inline.filter((id) => {
        const selected = selectedIds([path], file.patches([caseIdLine(id)]));
        return selected.length !== 1 || selected[0] !== id;
      }),
      [],
      `${path}: a patch confined to these case literals widens past them, so \`CASE_OPEN_PATTERN\` ` +
        'no longer matches the line that opens them'
    );
  }
});

// Registry order is guarded by one golden per case file rather than one for the whole registry, so
// a PR adding a case to one surface changes one small file. Three assertions carry what the single
// 505-line golden used to: cross-file order, within-file order, and no golden left behind.

const CASE_ID_GOLDENS = 'tests/fixtures/view-lab/case-ids';
const CASE_FILE_ORDER_GOLDEN = 'tests/fixtures/view-lab/caseFileOrder.golden.txt';

/** A golden's lines, blank lines dropped so the trailing newline is not read as an entry. */
const goldenLines = (relativePath) =>
  readFileSync(resolve(ROOT, relativePath), 'utf8')
    .split('\n')
    .filter((line) => line !== '');

/** The golden that holds one case file's ids. The frozen entry carries `path` and `cases` only. */
const caseIdGolden = (casePath) => `${CASE_ID_GOLDENS}/${basename(casePath, '.js')}.golden.txt`;

test('the case files stay in their committed order', () => {
  assert.deepEqual(
    VIEW_LAB_CASE_FILES.map(({ path }) => path),
    goldenLines(CASE_FILE_ORDER_GOLDEN),
    'the case-file order changed. `VIEW_LAB_CASES` is this list flat-mapped and ' +
      '`chooseSurfaceRepresentatives` breaks ties first-in-order, so a reordered manifest ' +
      'silently changes which frame represents a surface'
  );
});

test('each case file holds its own case ids in its own order', () => {
  for (const { path, cases } of VIEW_LAB_CASE_FILES) {
    assert.deepEqual(
      cases.map((viewCase) => viewCase.id),
      goldenLines(caseIdGolden(path)),
      `${path} changed which cases it declares, or the order it declares them in; if that is ` +
        `intended, rewrite ${caseIdGolden(path)} with the ids in declaration order`
    );
  }
});

test('no case-id golden is orphaned by a renamed case file', () => {
  const names = VIEW_LAB_CASE_FILES.map(({ path }) => basename(path, '.js'));
  assert.equal(
    new Set(names).size,
    names.length,
    'two case files share a basename, so they would share one golden; rename one of them'
  );
  assert.deepEqual(
    readdirSync(resolve(ROOT, CASE_ID_GOLDENS)).sort(),
    VIEW_LAB_CASE_FILES.map(({ path }) => basename(caseIdGolden(path))).sort(),
    `a golden under ${CASE_ID_GOLDENS} names no case file, or a case file has no golden — a ` +
      'rename that leaves the old golden behind guards a file that no longer exists'
  );
});

test('the sharded goldens compose into the whole registry order', () => {
  // The migration proof (issue #1937): concatenated in case-file order these reproduce the
  // 505-line golden they replaced, so nothing outside the case files reaches the flat registry.
  assert.deepEqual(
    [...caseIds],
    goldenLines(CASE_FILE_ORDER_GOLDEN).flatMap((path) => goldenLines(caseIdGolden(path))),
    'the flat registry is no longer the case files concatenated in manifest order, so the ' +
      'per-file goldens no longer guard what one whole-registry golden used to'
  );
});

test('surface coverage matches its committed golden file', () => {
  assert.deepEqual(
    [...LAB_SURFACE_CASE_IDS],
    goldenLines('tests/fixtures/view-lab/labSurfaceCaseIds.golden.txt'),
    'surface coverage changed — the frame set every unattributable change publishes'
  );
});

test('a registry change with no usable patch selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

  // No patch at all — including the one-argument call every other caller makes.
  assert.deepEqual(
    mapChangedFilesToCases([REGISTRY_PATH]).map((viewCase) => viewCase.id),
    coverageIds()
  );
  assert.deepEqual(selectedIds([REGISTRY_PATH], {}), coverageIds());
  assert.deepEqual(selectedIds([REGISTRY_PATH], { patches: {} }), coverageIds());

  const fallback = caseFile(FALLBACK_CASE_ID);
  const idLine = caseIdLine(FALLBACK_CASE_ID);
  const fallbackPatch = patchAdding(fallback.source, [idLine]);
  const wrongRevision = fallbackPatch.replace(
    fallback.source[idLine - 1],
    "    id: 'a-line-this-file-does-not-have',"
  );

  // A malformed header over a body that WOULD anchor.
  const [, ...anchorableBody] = fallbackPatch.split('\n');
  const malformedHeader = ['@@ this is not a hunk header @@', ...anchorableBody].join('\n');
  assert.deepEqual(
    selectedForCase(FALLBACK_CASE_ID, [idLine]),
    [FALLBACK_CASE_ID],
    'the same body under a WELL-FORMED header must narrow to one case, or the fixture below ' +
      'proves nothing about the header check'
  );

  for (const [patch, why] of [
    ['', 'an empty patch'],
    ['   ', 'a blank patch'],
    ['not a diff at all', 'a patch with no hunk header'],
    ['@@ this is not a hunk header @@\n+x', 'an unparseable hunk header'],
    [malformedHeader, 'an unparseable hunk header over a body that would otherwise anchor'],
    ['@@ -1,1 +1,1 @@\n?x', 'an unknown line marker'],
    [wrongRevision, 'a patch whose lines do not match this checkout'],
  ]) {
    assert.deepEqual(
      selectedIds([fallback.path], { patches: { [fallback.path]: patch } }),
      coverageIds(),
      `${why} must select one frame of every surface`
    );
  }
});

test('a registry change confined to case literals selects only those cases', () => {
  const inline = caseIds.filter((id) => isInlineCase(id));
  assert.ok(inline.length > 100, 'expected most cases to be declared inline in the array');

  // One case, sampled across the registry so this is not an assertion about its first entry.
  for (const id of [inline[0], inline[Math.floor(inline.length / 2)], inline.at(-1)]) {
    const idLine = caseIdLine(id);
    assert.deepEqual(selectedForCase(id, [idLine]), [id]);
    // A line elsewhere in the same literal — the label, not the id — attributes the same way.
    assert.deepEqual(selectedForCase(id, [idLine + 1]), [id]);
  }

  // Two cases of one file, two hunks: the honest answer is two frames, where it used to be 157.
  const siblings = caseFileSources.get(caseFile(inline[3]).path);
  const [first, second] = inline.filter((id) => siblings.includes(`    id: '${id}',`)).slice(0, 2);
  const file = caseFile(first);
  assert.deepEqual(
    selectedIds([file.path], file.patches([caseIdLine(first), caseIdLine(second)])),
    [first, second]
  );
});

test('ADDING a case to the registry selects that one case', () => {
  // The shape a diff has when a case is added: every line of the literal arrives as a `+`.
  const id = 'coverage-experimental-off-player';
  assert.deepEqual(selectedForCase(id, caseLiteralLines(id)), [id]);
});

test('a registry change OUTSIDE a case literal selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

  // A shared factory, a pattern constant, a generator spread, and the mapping function itself.
  for (const [path, line] of [
    ['scripts/lib/view-lab-cases/caseFactories.js', 'export function managerCase(entry) {'],
    // Was ` 'RadioCardGroup',`, one element of the hand-written `MANAGER_PRIMITIVES` array (issue
    // 1378).
    [
      'scripts/lib/view-lab-cases/broadSignals.js',
      "export const MANAGER_PRIMITIVES = managerPrimitiveNamesByEvidence('broad');",
    ],
    [fileDeclaring('  ...journalBlindRunCases(),'), '  ...journalBlindRunCases(),'],
    [REGISTRY_PATH, 'export function mapChangedFilesToCases(files = [], { patches } = {}) {'],
  ]) {
    const file = fileAt(path);
    assert.deepEqual(
      selectedIds([path], file.patches([file.lineOf(line)])),
      coverageIds(),
      `a change to \`${line.trim()}\` in ${path} must select one frame of every surface`
    );
  }
});

test('a comment-only registry change selects one frame — not 157, and not none', () => {
  // A comment cannot change a pixel, so widening to a twenty-minute capture for a typo fix is the
  // cost this narrowing exists to remove.
  const COMMENT = "    // Reached the way the smoke reaches it, by clicking the system row's identity.";
  const file = fileAt(fileDeclaring(COMMENT));
  assert.deepEqual(selectedIds([file.path], file.patches([file.lineOf(COMMENT)])), [
    FALLBACK_CASE_ID,
  ]);
});

test('a lab input no longer swallows the render files it ships with', () => {
  // The old blanket branch answered for the whole changed set and returned before the render files
  // were consulted.
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
  // the `patch` field through.
  const workflow = readFileSync(resolve(ROOT, '.github/workflows/pr-screenshots.yml'), 'utf8');
  assert.match(
    workflow,
    /pulls\/\$PR_NUMBER\/files/,
    'the files endpoint is where the patch comes from'
  );
  assert.match(workflow, /patch: \(\.patch \/\/ ""\)/, 'the patch field must be requested');
  assert.match(
    workflow,
    /mapChangedFilesToCases\(files, \{ patches \}\)/,
    'the patches must reach the selector'
  );
});

// Content-anchored attribution (issue 1049). The first narrowing seeded a cursor from the header
// and compared each line against `sourceLines[cursor - 1]`, so that PR silently paid the
// twenty-minute whole-corpus capture.

/**
 * The same patch with every hunk header's line numbers moved and its BODY untouched — what a
 * merge-commit checkout effectively does to a head-generated diff.
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
  assert.notEqual(
    shifted,
    patch,
    `shifting by ${delta} matched no hunk header, so it changed nothing`
  );
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
  return [3, 17, 400, 4000, 1 - Math.min(...starts)].filter((delta) => delta !== 0);
}

/** Line number -> case id for one case file, read from the factory call down to the closing line. */
function caseIdByLineIn(path) {
  const source = caseFileSources.get(path);
  const byLine = new Map();
  for (const id of caseIds) {
    if (!source.includes(`    id: '${id}',`)) continue;
    for (const line of caseLiteralLines(id)) byLine.set(line, id);
  }
  return byLine;
}

/** The array-open line every case file carries, and the registry parses each file by. */
const ARRAY_OPEN_LINE = 'export const CASES = Object.freeze([';

/** The one case file holding an exact line, asserted unique so a spread fixture line fails here. */
function fileDeclaring(text) {
  const holders = [...caseFileSources]
    .filter(([, source]) => source.includes(text))
    .map(([path]) => path);
  assert.deepEqual(holders.length, 1, `exactly one case file must contain the line: ${text}`);
  return holders[0];
}

/**
 * The four per-actor fixture tables the selector keys on, named once for every check below that has
 * to say them out loud.
 */
const FIXTURE_TABLE_NAMES = [
  'INVENTORIES',
  'BROKEN_STACKS',
  'RECIPE_ITEM_COPIES',
  'LEARNED_RECIPES',
];

/**
 * The fixture table each `labActors.js` line sits in, derived the way the selector derives it —
 * from a column-zero `const NAME = ` to the next column-zero `};` or `});`.
 *
 * @returns {Map<number, string>} Line number -> table name, for lines inside a fixture table.
 */
function tableNameByLine() {
  const byLine = new Map();
  for (const name of FIXTURE_TABLE_NAMES) {
    const start = labActorsSource.findIndex((line) => line.startsWith(`const ${name} = `));
    assert.notEqual(start, -1, `${LAB_ACTORS_PATH} no longer declares ${name} at column zero`);
    const end = labActorsSource.findIndex((line, at) => at > start && /^\}\)?;$/.test(line));
    assert.notEqual(end, -1, `${name} has no column-zero close`);
    for (let line = start + 1; line <= end + 1; line += 1) byLine.set(line, name);
  }
  return byLine;
}

/**
 * The marked region each `mount.js` line sits in, derived the way the selector derives it — by
 * calling the selector's own parser rather than re-walking the markers here.
 *
 * @returns {Map<number, string>} Line number -> region key, for lines inside a marked region.
 */
function mountRegionNameByLine() {
  const regions = parseMountRegions(labMountSource);
  assert.ok(regions, `${LAB_MOUNT_PATH} no longer parses into its marked regions`);
  const byLine = new Map();
  for (const { key, start, end } of regions) {
    for (let line = start; line <= end; line += 1) byLine.set(line, key);
  }
  return byLine;
}

/** One `size`-line window index per file, so a five-thousand-line scan happens once, not per query. */
const windowIndexes = new Map();

/**
 * Every window of `size` consecutive lines of a file, mapped to the 1-based lines it starts at.
 *
 * @param {string[]} source The file, by line.
 * @param {number} size Window length in lines; 7 is what one changed line plus git's three lines of
 * context either side produces.
 * @returns {Map<string, number[]>} Window content -> the starts at which it occurs.
 */
function windowIndex(source, size) {
  const cacheKey = `${size}`;
  const perSize = windowIndexes.get(source) ?? new Map();
  windowIndexes.set(source, perSize);
  if (perSize.has(cacheKey)) return perSize.get(cacheKey);

  const byContent = new Map();
  for (let start = 1; start + size - 1 <= source.length; start += 1) {
    const key = source.slice(start - 1, start - 1 + size).join('\n');
    byContent.set(key, [...(byContent.get(key) ?? []), start]);
  }
  perSize.set(cacheKey, byContent);
  return byContent;
}

/**
 * Every window of `size` consecutive lines of a file that occurs more than once, with the region
 * each occurrence's middle line belongs to.
 *
 * @param {string[]} source The file, by line.
 * @param {Map<number, string>} owner Line number -> region key, for lines inside a region.
 * @param {number} size Window length in lines.
 * @returns {{starts: number[], ids: Array<string|undefined>}[]} The recurring windows.
 */
function recurringWindows(source, owner, size) {
  return [...windowIndex(source, size).values()]
    .filter((starts) => starts.length > 1)
    .map((starts) => ({
      starts,
      ids: starts.map((start) => owner.get(start + Math.floor(size / 2))),
    }));
}

test('a patch whose hunk headers do not land still selects exactly what its content names', () => {
  // The regression this replaces: the same patch with its headers moved down three lines selected
  // all 181 frames.
  const inline = caseIds.filter((id) => isInlineCase(id));
  for (const id of [inline[0], inline[Math.floor(inline.length / 2)], inline.at(-1)]) {
    const file = caseFile(id);
    const patch = patchAdding(file.source, [caseIdLine(id)]);
    assert.deepEqual(
      selectedIds([file.path], patchesFor(file.path, patch)),
      [id],
      'an aligned patch whose content is unique must still narrow to its own case'
    );
    for (const delta of survivableShifts(patch)) {
      assert.deepEqual(
        selectedIds([file.path], patchesFor(file.path, shiftHunkHeaders(patch, delta))),
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
  const file = caseFile(id);
  const patch = patchAdding(file.source, caseLiteralLines(id));
  assert.deepEqual(selectedIds([file.path], patchesFor(file.path, patch)), [id]);
  for (const delta of survivableShifts(patch)) {
    assert.deepEqual(
      selectedIds([file.path], patchesFor(file.path, shiftHunkHeaders(patch, delta))),
      [id],
      `a header shifted by ${delta} lines must still select the added case alone`
    );
  }
});

test('a hunk whose content recurs in two different cases selects THOSE cases, not the corpus', () => {
  const everything = publishableCases().length;
  const windows = VIEW_LAB_CASE_FILES.flatMap(({ path }) =>
    recurringWindows(caseFileSources.get(path), caseIdByLineIn(path), 7).map((window) => ({
      ...window,
      path,
    }))
  );
  assert.ok(
    windows.length > 0,
    'this registry is supposed to contain seven-line windows that recur; if it no longer does, ' +
      'this test is measuring nothing and the union rule has lost its fixture'
  );

  const crossCase = windows.filter(
    (window) => window.ids.every(Boolean) && new Set(window.ids).size > 1
  );
  assert.ok(
    crossCase.length > 0,
    'no recurring window spans two different case literals any more, so nothing here can prove ' +
      'what an ambiguous hunk selects'
  );

  // The middle line of the window, patched with its OWN correct line numbers: the patch is aligned,
  // it verifies, and it is still ambiguous — the identical window elsewhere would attribute it to a
  // different case (issue 1127).
  for (const window of crossCase.slice(0, 3)) {
    const line = window.starts[0] + 3;
    const expected = [...new Set(window.ids)];
    const file = fileAt(window.path);
    const selected = selectedIds([file.path], file.patches([line]));
    assert.deepEqual(
      [...selected].sort(),
      [...expected].sort(),
      `line ${line} sits in a window that also occurs at ${window.starts.slice(1).join(', ')}, ` +
        `so an aligned patch there must select exactly ${expected.join(' / ')}`
    );
    assert.ok(
      selected.length < everything,
      'the union must be a narrowing; selecting the whole corpus for an ambiguous hunk is the ' +
        'regression issue 1127 removed'
    );
  }
});

test('the SAME edit applied to sibling cases selects exactly those siblings (issue 1125 shape)', () => {
  // The shape that made this worth fixing (issue 1125).
  const window = VIEW_LAB_CASE_FILES.flatMap(({ path }) =>
    recurringWindows(caseFileSources.get(path), caseIdByLineIn(path), 7).map((entry) => ({
      ...entry,
      path,
    }))
  )
    .filter((entry) => entry.ids.every(Boolean) && new Set(entry.ids).size > 2)
    .at(0);
  assert.ok(
    window,
    'no seven-line window recurs across three or more case literals of one file, so this registry ' +
      'can no longer produce the multi-sibling edit issue 1125 hit'
  );

  const siblings = [...new Set(window.ids)];
  const file = fileAt(window.path);
  const selected = selectedIds([file.path], file.patches(window.starts.map((start) => start + 3)));
  assert.deepEqual(
    [...selected].sort(),
    [...siblings].sort(),
    `editing the same line in ${siblings.length} sibling cases must select exactly those ${siblings.length}`
  );
});

test('no recurring window mixes inside-a-region with outside-every-region, so no real diff needs that path', () => {
  // The measurement, kept for what it still measures, with its original justification retired.
  for (const [where, source, owner] of [
    ...VIEW_LAB_CASE_FILES.map(({ path }) => [
      path,
      caseFileSources.get(path),
      caseIdByLineIn(path),
    ]),
    [LAB_ACTORS_PATH, labActorsSource, tableNameByLine()],
    [LAB_MOUNT_PATH, labMountSource, mountRegionNameByLine()],
  ]) {
    const mixed = recurringWindows(source, owner, 7).filter(
      (window) => window.ids.some(Boolean) && window.ids.some((id) => !id)
    );
    assert.deepEqual(
      mixed.map((window) => `at ${window.starts.join(', ')}`),
      [],
      `a seven-line window of ${where} now occurs both inside a region and outside every region, ` +
        "which is the fixture `regionsTouchedByHunk`'s widening short-circuit has never had"
    );
  }
});

test('a hunk the selector cannot anchor selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;
  const anchorFile = caseFile(FALLBACK_CASE_ID).path;

  // Every way a hunk can fail to name a unique place in the file that will render.
  for (const [patch, why] of [
    ['@@ -100,0 +100,0 @@', 'a zero-context (`-U0`) hunk anchors nowhere'],
    ['@@ -1,2 +1,0 @@\n-one\n-two', 'a removal-only hunk has no new-file content to find'],
    [
      '@@ -1,2 +1,3 @@\n a line this case file does not contain\n+nor this one',
      'content this checkout does not have',
    ],
  ]) {
    assert.deepEqual(
      selectedIds([anchorFile], patchesFor(anchorFile, patch)),
      coverageIds(),
      `${why} — that must select one frame of every surface`
    );
  }
});

/**
 * How many times the seven-line window centred on a line occurs in its own file.
 *
 * @param {string[]} source The file, by line.
 * @param {number} line The 1-based line the window is centred on.
 * @returns {number} Occurrences of that window in the file.
 */
function windowOccurrences(source, line) {
  const from = line - 3;
  assert.ok(
    from >= 1 && line + 3 <= source.length,
    `line ${line} is within three lines of a file boundary, so it has no full anchor window`
  );
  return (windowIndex(source, 7).get(source.slice(from - 1, from + 6).join('\n')) ?? []).length;
}

/** Cases whose id line and last content line both anchor uniquely, so a fixture at either is exact. */
function uniquelyAnchoredCases(howMany) {
  const qualifying = caseIds
    .filter((id) => id !== FALLBACK_CASE_ID && isInlineCase(id))
    .map((id) => {
      const lines = caseLiteralLines(id);
      // `.at(-1)` is the `  }),` that closes the literal, so `.at(-2)` is its last content line —
      // the boundary a replace run has to be attributed on the correct side of.
      return {
        id,
        file: caseFile(id),
        idLine: caseIdLine(id),
        lastContentLine: lines.at(-2),
      };
    })
    .filter(
      ({ file, idLine, lastContentLine }) =>
        windowOccurrences(file.source, idLine) === 1 &&
        windowOccurrences(file.source, lastContentLine) === 1
    );

  assert.ok(
    qualifying.length >= howMany,
    `only ${qualifying.length} case literals anchor uniquely at both their id line and their last ` +
      'content line, which is too few to build the removal fixtures on'
  );
  const stride = Math.floor(qualifying.length / howMany);
  return Array.from({ length: howMany }, (_, index) => qualifying[index * stride]);
}

// The REMOVAL path (issue 1049 review). Every fixture above this point is addition-only, and
// `patchAdding` cannot emit a `-` line — so the shape GitHub's `pulls/{n}/files` `patch` field has
// for every EDITED line was pinned by nothing.

test('a one-line EDIT inside a case literal selects the same case its addition does', () => {
  // The commonest diff shape there is, and the one no fixture had: one `-` for the old text, one
  // `+` for the new, three lines of context either side.
  for (const { id, file, idLine } of uniquelyAnchoredCases(3)) {
    const patch = patchEditing(file.source, { line: idLine });
    assert.deepEqual(
      selectedIds([file.path], patchesFor(file.path, patch)),
      selectedForCase(id, [idLine]),
      `editing line ${idLine} must select what adding it selects`
    );
    assert.deepEqual(selectedIds([file.path], patchesFor(file.path, patch)), [id]);

    // And under the merge-commit shift, which is the state this whole section exists for: an edit
    // is no more anchored by its header's numbers than an addition is.
    for (const delta of survivableShifts(patch)) {
      assert.deepEqual(
        selectedIds([file.path], patchesFor(file.path, shiftHunkHeaders(patch, delta))),
        [id],
        `an edit whose header is shifted by ${delta} lines must still select "${id}" alone`
      );
    }
  }
});

test("a replace run at a case literal's last line is not attributed to its neighbour", () => {
  // N removals followed by one addition, on the LAST content line of a literal — the shape a PR has
  // when it replaces a block of steps with one.
  for (const { id, file, lastContentLine } of uniquelyAnchoredCases(3)) {
    for (const removed of [1, 3, 8]) {
      const patch = patchEditing(file.source, { line: lastContentLine, removed });
      assert.deepEqual(
        selectedIds([file.path], patchesFor(file.path, patch)),
        [id],
        `a ${removed}-line replace run at line ${lastContentLine} must stay inside "${id}" — ` +
          'a removed line occupies no line of the file that will render'
      );
    }
  }
});

test('a deletion-only hunk inside a case literal selects that case, not the fallback', () => {
  // A hunk with `-` lines and no `+` at all still CHANGES the case it sits in, so it must select
  // that case.
  for (const { id, file, idLine } of uniquelyAnchoredCases(3)) {
    for (const removed of [1, 3]) {
      const patch = patchEditing(file.source, { line: idLine, removed, replaced: false });
      assert.deepEqual(
        selectedIds([file.path], patchesFor(file.path, patch)),
        [id],
        `deleting ${removed} line(s) inside "${id}" must select it, not the fallback frame`
      );
    }
  }
});

// `labActors.js`, attributed by fixture table (issue 1049).

const playerCaseIds = () =>
  publishableCases()
    .filter((viewCase) => viewCase.app === 'fabricate-app')
    .map((viewCase) => viewCase.id);

/** The three canvas windows' cases, derived rather than listed. */
const canvasCaseIds = () =>
  publishableCases()
    .filter(
      (viewCase) =>
        viewCase.app !== 'fabricate-app' && viewCase.app !== 'fabricate-crafting-system-manager'
    )
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
  // (`collectKnowledgeOwnedCopies` in `src/systems/knowledgeSnapshot.js`) keeps just the items
  // matching a recipe-item definition, so a component stack or a `toolBroken` flag reaches no
  // manager frame.
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

test('a labActors EDIT inside a stock table selects the same frames its addition does', () => {
  // The region path has its own copy of nothing — it shares `regionsTouchedByHunk` with the
  // registry — but it is the input a real PR is most likely to EDIT rather than append to, since
  // restocking an actor rewrites a quantity in place.
  const line = labActorsLineOf("    'sm-iron-ore': 12,");
  assert.equal(
    windowOccurrences(labActorsSource, line),
    1,
    'this fixture line no longer anchors uniquely, so it cannot assert a single selection'
  );

  const players = playerCaseIds();
  for (const [shape, patch] of [
    ['a one-line edit', patchEditing(labActorsSource, { line })],
    ['a replace run', patchEditing(labActorsSource, { line, removed: 4 })],
    ['a deletion-only hunk', patchEditing(labActorsSource, { line, removed: 3, replaced: false })],
  ]) {
    assert.deepEqual(
      selectedIds([LAB_ACTORS_PATH], patchesFor(LAB_ACTORS_PATH, patch)),
      players,
      `${shape} in INVENTORIES must select every player frame and only those`
    );
    assert.deepEqual(
      selectedIds([LAB_ACTORS_PATH], patchesFor(LAB_ACTORS_PATH, shiftHunkHeaders(patch, 200))),
      players,
      `${shape} must select the same frames when its header does not land`
    );
  }
});

test('every knowledge render file the predicate probes is a real source file', () => {
  // These four paths are STRINGS tested against each case's `sourceMatches` regexes, so a rename
  // makes a probe match nothing — and nothing else notices.
  const missing = ACTOR_KNOWLEDGE_RENDER_FILES.filter((file) => !sourceFiles.includes(file));
  assert.deepEqual(
    missing,
    [],
    `these knowledge-surface probes name no file under ${CORPUS_ROOTS.map((root) => `${root}/`).join(', ')}, ` +
      'so `rendersOwnedKnowledge` silently stops admitting the frames that render them:\n  ' +
      missing.join('\n  ')
  );
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
  assert.ok(
    expected.length > playerCaseIds().length,
    'the knowledge tables added no manager frame'
  );
});

test('every knowledge or books-scrolls case is inside the sourceMatches-derived set', () => {
  // The predicate is keyed on `sourceMatches` rather than on `kinds`, because `sourceMatches`
  // already declares which render files a case is evidence about and is ALREADY gated for
  // completeness by `tests/view-lab-source-coverage.test.js`.
  const derived = new Set(knowledgeSurfaceCaseIds());
  const missing = publishableCases()
    .filter((viewCase) =>
      (viewCase.kinds ?? []).some((kind) => ['knowledge', 'books-scrolls'].includes(kind))
    )
    .map((viewCase) => viewCase.id)
    .filter((id) => !derived.has(id));

  assert.deepEqual(
    missing,
    [],
    'these cases are tagged as Knowledge or Books & Scrolls frames but claim none of ' +
      `${ACTOR_KNOWLEDGE_RENDER_FILES.join(', ')} in sourceMatches, so a change to an owned copy ` +
      `or a learned recipe would not select them:\n  ${missing.join('\n  ')}`
  );
  assert.ok(
    derived.size > 0,
    'nothing claims the knowledge render files, so the predicate is dead'
  );
});

// An oracle for `ACTOR_KNOWLEDGE_RENDER_FILES` itself (issue 1052).

/**
 * @param {string[]} list Render-file paths, tested against each case's own `sourceMatches`.
 * @returns {string[]} ids of publishable cases admitted by at least one path in `list`.
 */
const admittedCaseIds = (list) =>
  publishableCases()
    .filter((viewCase) =>
      viewCase.sourceMatches.some((pattern) => list.some((file) => pattern.test(file)))
    )
    .map((viewCase) => viewCase.id);

/**
 * Entries in `ACTOR_KNOWLEDGE_RENDER_FILES` that admit no case on their own — because every case
 * their own path could admit is already admitted by another entry declared in that SAME case's
 * `sourceMatches`.
 */
const REDUNDANT_BY_DESIGN = Object.freeze([
  {
    path: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
    reason:
      'every case whose sourceMatches admits it also admits BooksScrollsView.svelte directly, so ' +
      'removing this entry alone changes no admitted set',
  },
]);

test('every entry in ACTOR_KNOWLEDGE_RENDER_FILES is necessary, or recorded as redundant', () => {
  // For each entry NOT covered by REDUNDANT_BY_DESIGN: removing it from the list must strictly
  // shrink the admitted set.
  const redundantPaths = new Set(REDUNDANT_BY_DESIGN.map((entry) => entry.path));
  const full = admittedCaseIds(ACTOR_KNOWLEDGE_RENDER_FILES);
  const notNecessary = [];
  for (const entry of ACTOR_KNOWLEDGE_RENDER_FILES) {
    if (redundantPaths.has(entry)) continue;
    const without = admittedCaseIds(ACTOR_KNOWLEDGE_RENDER_FILES.filter((file) => file !== entry));
    if (without.length >= full.length) notNecessary.push(entry);
  }
  assert.deepEqual(
    notNecessary,
    [],
    'these entries admit no case that another entry does not already admit, so removing them from ' +
      'the list changes nothing — record them in REDUNDANT_BY_DESIGN with a reason, or delete them:\n  ' +
      notNecessary.join('\n  ')
  );
});

test('REDUNDANT_BY_DESIGN entries are still list members, still redundant, and still explained', () => {
  const full = admittedCaseIds(ACTOR_KNOWLEDGE_RENDER_FILES);
  for (const entry of REDUNDANT_BY_DESIGN) {
    // Direction one: a key that is no longer a list member. Renaming the file this entry names
    // (without updating the exemption) must fail here rather than silently exempting nothing.
    assert.ok(
      ACTOR_KNOWLEDGE_RENDER_FILES.includes(entry.path),
      `REDUNDANT_BY_DESIGN entry "${entry.path}" no longer names a member of ` +
        'ACTOR_KNOWLEDGE_RENDER_FILES — delete the exemption or fix the rename'
    );
    // Direction two: a key that has become necessary.
    const without = admittedCaseIds(
      ACTOR_KNOWLEDGE_RENDER_FILES.filter((file) => file !== entry.path)
    );
    assert.equal(
      without.length,
      full.length,
      `REDUNDANT_BY_DESIGN entry "${entry.path}" has become necessary — it now admits a case no ` +
        'other list member admits. Remove the exemption and let the necessity check police it directly.'
    );
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.trim().length > 20,
      `REDUNDANT_BY_DESIGN entry "${entry.path}" needs a real reason, not a placeholder`
    );
  }
  assert.ok(REDUNDANT_BY_DESIGN.length > 0, 'expected at least one redundant-by-design entry');
});

/**
 * Publishable cases the `knowledge`/`books-scrolls` tag vocabulary cannot reach, but which
 * genuinely render an owned-knowledge surface — proven by declaring one of
 * `ACTOR_KNOWLEDGE_RENDER_FILES` in their OWN `sourceMatches`, not asserted from outside it.
 */
const KNOWLEDGE_EXTRAS_BY_DESIGN = Object.freeze([
  {
    id: 'manager-system-edit-normal',
    reason:
      "declares ItemPageInspector.svelte in its own sourceMatches (the System Edit view's " +
      "learned-by stat) but is tagged ['manager','system-edit'], neither of which is 'knowledge' " +
      "or 'books-scrolls'",
  },
]);

test('the admitted set equals the tagged cases plus the gated extras — nothing wider, nothing narrower', () => {
  // This is the widening pin. Unlike the necessity check above, this one does not iterate the
  // list's surviving members — it compares the WHOLE admitted set against an expectation the list
  // does not control, so deleting a necessary entry (`KnowledgeView.svelte`,
  // `ItemPageInspector.svelte`) shrinks one side without moving the other, and this fails.
  const tagged = publishableCases()
    .filter((viewCase) =>
      (viewCase.kinds ?? []).some((kind) => ['knowledge', 'books-scrolls'].includes(kind))
    )
    .map((viewCase) => viewCase.id);
  const extraIds = KNOWLEDGE_EXTRAS_BY_DESIGN.map((entry) => entry.id);
  const expected = new Set([...tagged, ...extraIds]);
  const admitted = new Set(admittedCaseIds(ACTOR_KNOWLEDGE_RENDER_FILES));

  assert.deepEqual(
    [...admitted].filter((id) => !expected.has(id)).sort(),
    [],
    'the admitted set now includes a case the tag vocabulary and the gated extras do not account ' +
      'for — either tag it knowledge/books-scrolls, or add a justified KNOWLEDGE_EXTRAS_BY_DESIGN entry'
  );
  assert.deepEqual(
    [...expected].filter((id) => !admitted.has(id)).sort(),
    [],
    'the admitted set has shrunk below the tagged cases plus the gated extras — a render file was ' +
      'deleted from ACTOR_KNOWLEDGE_RENDER_FILES (or a case stopped declaring it) and evidence was ' +
      'dropped silently'
  );
});

test('KNOWLEDGE_EXTRAS_BY_DESIGN entries are still publishable, still untagged, and still justified', () => {
  for (const entry of KNOWLEDGE_EXTRAS_BY_DESIGN) {
    const viewCase = getCaseById(entry.id);
    assert.ok(viewCase, `KNOWLEDGE_EXTRAS_BY_DESIGN entry "${entry.id}" names no case`);
    assert.ok(
      viewCase.publish,
      `KNOWLEDGE_EXTRAS_BY_DESIGN entry "${entry.id}" is no longer publishable`
    );
    assert.ok(
      !(viewCase.kinds ?? []).some((kind) => ['knowledge', 'books-scrolls'].includes(kind)),
      `KNOWLEDGE_EXTRAS_BY_DESIGN entry "${entry.id}" is now tagged knowledge/books-scrolls — drop ` +
        'the exemption, the tag vocabulary already covers it'
    );
    assert.ok(
      viewCase.sourceMatches.some((pattern) =>
        ACTOR_KNOWLEDGE_RENDER_FILES.some((file) => pattern.test(file))
      ),
      `KNOWLEDGE_EXTRAS_BY_DESIGN entry "${entry.id}" no longer declares any of ` +
        `${ACTOR_KNOWLEDGE_RENDER_FILES.join(', ')} in its own sourceMatches`
    );
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.trim().length > 20,
      `KNOWLEDGE_EXTRAS_BY_DESIGN entry "${entry.id}" needs a real reason, not a placeholder`
    );
  }
});

test('a labActors change outside its fixture tables selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

  // `ACTOR_DEFINITIONS` is deliberately on this side.
  for (const line of [
    "    name: 'Brenna Karrunsdottir',",
    'function ownedItem(componentId, component, quantity, index) {',
    'function recipeItemCopy({ id, uuid, name, icon, usage = null }) {',
    'export function buildLabActors(content) {',
    'export function buildDocumentIndex(content, actors) {',
  ]) {
    assert.deepEqual(
      selectedIds([LAB_ACTORS_PATH], labActorsPatches([labActorsLineOf(line)])),
      coverageIds(),
      `a change to \`${line.trim()}\` must select one frame of every surface`
    );
  }

  // And with no patch at all, which is how every caller but the capture workflow asks.
  assert.deepEqual(selectedIds([LAB_ACTORS_PATH]), coverageIds());
  assert.deepEqual(selectedIds([LAB_ACTORS_PATH], { patches: {} }), coverageIds());
});

test('the four labActors fixture tables the selector keys on still exist under those names', () => {
  // The selector finds each table by a column-zero `const NAME = ` line whose statement that line
  // OPENS.
  const declared = FIXTURE_TABLE_NAMES.filter(
    (name) => !labActorsSource.some((line) => line.startsWith(`const ${name} = `))
  );
  assert.deepEqual(
    declared,
    [],
    'these fixture tables are no longer declared at column zero under these names, so ' +
      '`parseLabActorTableRegions` finds nothing and every labActors change captures all 181 ' +
      `frames again:\n  ${declared.join('\n  ')}`
  );

  // The second invisible shape, which the probe above cannot see: a table collapsed onto ONE line
  // still `startsWith` its own declaration.
  const selfClosing = FIXTURE_TABLE_NAMES.filter(
    (name) => !labActorsSource.find((line) => line.startsWith(`const ${name} = `)).endsWith('{')
  );
  assert.deepEqual(
    selfClosing,
    [],
    'these fixture tables close their own opening line instead of opening a block, so ' +
      '`parseLabActorTableRegions` refuses the file and every labActors change captures all 181 ' +
      `frames again:\n  ${selfClosing.join('\n  ')}`
  );
});

// `parseLabActorTableRegions`, driven directly (issue 1049 review).

/**
 * One top-level fixture table, authored the way Prettier authors them.
 *
 * @param {string} name The constant's name.
 * @param {object} [shape] How to author it.
 * @param {boolean} [shape.oneLine] True to close the whole statement on the opening line.
 * @returns {string[]} Its lines, followed by the blank line that separates declarations.
 */
function tableBlock(name, { oneLine = false } = {}) {
  const entry = "'lab-actor-brenna': ['sm-longsword']";
  if (oneLine) return [`const ${name} = Object.freeze({ ${entry} });`, ''];
  return [`const ${name} = {`, `  ${entry},`, '};', ''];
}

test('parseLabActorTableRegions maps each fixture table to its own span, in file order', () => {
  // Declared in an order the parser's own loop does not walk: it iterates
  // `LAB_ACTOR_FIXTURE_TABLES`' keys, which state which frames read each table and say nothing
  // about where the fixture declares them. The spans must be the FILE's, not the key list's.
  const declared = ['LEARNED_RECIPES', 'INVENTORIES', 'RECIPE_ITEM_COPIES', 'BROKEN_STACKS'];
  const regions = parseLabActorTableRegions(declared.flatMap((name) => tableBlock(name)));

  assert.ok(regions, 'a well-formed fixture must parse');
  assert.deepEqual(
    [...regions].sort((left, right) => left.start - right.start),
    declared.map((key, index) => ({ key, start: index * 4 + 1, end: index * 4 + 3 })),
    'each table must span exactly its own three lines, so the four spans are disjoint and every ' +
      "line inside one belongs to no other — which is what makes `regionsTouchedAt`'s first-match " +
      'lookup an attribution rather than a guess'
  );
});

test('parseLabActorTableRegions refuses a table whose opening line closes its own statement', () => {
  // The direct check on the assumption, and NOT reachable through the overlap check: the one-lined
  // table here swallows a plain const rather than another table, so no two table spans overlap and
  // the consequence check passes.
  const swallowed = ['const TOOL_DURABILITY = {', "  'sm-hammer': 3,", '};', ''];
  const source = [
    ...tableBlock('INVENTORIES'),
    ...tableBlock('BROKEN_STACKS', { oneLine: true }),
    ...swallowed,
    ...tableBlock('RECIPE_ITEM_COPIES'),
    ...tableBlock('LEARNED_RECIPES'),
  ];
  assert.equal(
    parseLabActorTableRegions(source),
    null,
    'a one-lined table runs to the next column-zero `};`, so it answers for a const it does not ' +
      'feed — a wrong narrowing, and the one outcome this parse is built to make unreachable'
  );

  // The same file with that table opened properly parses, so the refusal is about the shape of
  // that one line and nothing else about the fixture.
  const opened = [...source];
  opened.splice(4, 2, ...tableBlock('BROKEN_STACKS'));
  assert.ok(parseLabActorTableRegions(opened), 'the control fixture must parse');
});

test('parseLabActorTableRegions refuses tables whose spans overlap', () => {
  // The consequence check, on the shape the direct check above cannot see: a legitimate opener — it
  // ends in `{` — whose close the column-zero search cannot find, because a second call wraps it.
  const wrapped = [
    'const INVENTORIES = Object.freeze(withDefaults({',
    "  'lab-actor-brenna': { 'sm-iron-ore': 12 },",
    '}));',
    '',
  ];
  const tail = [
    ...tableBlock('BROKEN_STACKS'),
    ...tableBlock('RECIPE_ITEM_COPIES'),
    ...tableBlock('LEARNED_RECIPES'),
  ];
  assert.equal(
    parseLabActorTableRegions([...wrapped, ...tail]),
    null,
    'a table whose close the parser cannot see swallows the next one, and the swallowed table ' +
      "then answers under the swallower's key"
  );

  // Same tables, same order, a close the parser can see: the refusal is the overlap, not the wrap.
  assert.ok(
    parseLabActorTableRegions([...tableBlock('INVENTORIES'), ...tail]),
    'the control fixture must parse'
  );
});

// `mount.js`, attributed by MARKED region (issue 1198).

const labMountLineOf = (text) => lineOf(labMountSource, text, LAB_MOUNT_PATH);

/** @returns {object} The `patches` option carrying one patch for the lab's mount page. */
const labMountPatches = (lineNumbers) =>
  patchesFor(LAB_MOUNT_PATH, patchAdding(labMountSource, lineNumbers));

/** One anchor line inside each declared region, so every key is pinned rather than sampled. */
const MOUNT_REGION_ANCHORS = [
  ['player-extension-params', "    playerProvider: params.get('playerProvider') === '1',"],
  [
    'lab-player-provider',
    "      tab('board', 'Board', 'Downtime board and pending decisions', 'fas fa-chart-simple'),",
  ],
  ['mount-player-app', '    extensionSurfaces: deriveExtensionSurfaces(playerExtensions, {'],
  ['player-settle-stores', '      if (pending.length === 0) break;'],
];

/** The same, for the two regions only the three CANVAS windows can render (issue 1520). */
const CANVAS_MOUNT_REGION_ANCHORS = [
  ['canvas-mount-params', "    interactable: params.get('interactable') ?? null,"],
  ['mount-canvas-app', "    exportName: 'InteractableBrowserApp',"],
];

/** Every marked region in the mount page, whatever its readership. */
const ALL_MOUNT_REGION_ANCHORS = [...MOUNT_REGION_ANCHORS, ...CANVAS_MOUNT_REGION_ANCHORS];

test('a mount.js patch confined to a player region selects every player frame and only those', () => {
  const players = playerCaseIds();
  for (const [region, text] of MOUNT_REGION_ANCHORS) {
    const patches = labMountPatches([labMountLineOf(text)]);
    assert.deepEqual(
      selectedIds([LAB_MOUNT_PATH], patches),
      players,
      `a change inside the "${region}" region must select every player frame and no manager frame`
    );
    // Derived, not listed, and shift-proof for the same reason every other input is: a merge
    // commit moves the header's numbers and moves nothing the hunk is anchored by.
    assert.deepEqual(
      selectedIds(
        [LAB_MOUNT_PATH],
        patchesFor(LAB_MOUNT_PATH, shiftHunkHeaders(patches.patches[LAB_MOUNT_PATH], 200))
      ),
      players,
      `a shifted "${region}" patch must select the same frames`
    );
  }

  // The removal shape too, on the region a real PR is most likely to EDIT rather than append to: a
  // param default is rewritten in place, not added beside itself.
  const line = labMountLineOf(MOUNT_REGION_ANCHORS[0][1]);
  assert.equal(
    windowOccurrences(labMountSource, line),
    1,
    'this line no longer anchors uniquely, so it cannot assert a single selection'
  );
  for (const [shape, patch] of [
    ['a one-line edit', patchEditing(labMountSource, { line })],
    ['a deletion-only hunk', patchEditing(labMountSource, { line, removed: 3, replaced: false })],
  ]) {
    assert.deepEqual(
      selectedIds([LAB_MOUNT_PATH], patchesFor(LAB_MOUNT_PATH, patch)),
      players,
      `${shape} in the query-param region must select every player frame and only those`
    );
  }
});

test('a mount.js change outside its player regions selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

  // The first line is the proof that the marking is doing the work rather than the function name:
  // it is a query param inside the SAME `readParams()` the player block sits in, three lines away
  // from it and outside the markers, and it must widen.
  for (const line of [
    "    colorScheme: params.get('colorScheme') === 'light' ? 'light' : 'dark',",
    '  const determinismStyle = installDeterminismStyles();',
    'function borrowInstance(AppClass, fields) {',
    '  const services = props.services;',
  ]) {
    assert.deepEqual(
      selectedIds([LAB_MOUNT_PATH], labMountPatches([labMountLineOf(line)])),
      [...LAB_SURFACE_CASE_IDS],
      `a change to \`${line.trim()}\` must select one frame of every surface`
    );
  }

  // And with no patch at all, which is how every caller but the capture workflow asks — the
  // shipped "every lab input the registry cannot attribute selects surface coverage" list keeps
  // this path, and this is the same claim stated where the narrowing is explained.
  assert.deepEqual(selectedIds([LAB_MOUNT_PATH]), coverageIds());
  assert.deepEqual(selectedIds([LAB_MOUNT_PATH], { patches: {} }), coverageIds());
});

test('a mount.js patch confined to a canvas region selects every canvas frame and only those', () => {
  // The canvas half of the claim above, and it is the one that is newly load-bearing: the mount
  // page now draws FIVE windows, so a region marked here but attributed to the wrong predicate
  // would publish player or manager frames as evidence of a canvas change.
  const canvas = canvasCaseIds();
  assert.ok(canvas.length > 0, 'the registry must hold canvas cases for this to measure anything');
  for (const [region, text] of CANVAS_MOUNT_REGION_ANCHORS) {
    const patches = labMountPatches([labMountLineOf(text)]);
    assert.deepEqual(
      selectedIds([LAB_MOUNT_PATH], patches),
      canvas,
      `a change inside the "${region}" region must select every canvas frame and no other`
    );
    // Derived and shift-proof for the same reason the player loop's is: a merge commit moves the
    // hunk header's numbers and moves nothing the hunk is anchored by.
    assert.deepEqual(
      selectedIds(
        [LAB_MOUNT_PATH],
        patchesFor(LAB_MOUNT_PATH, shiftHunkHeaders(patches.patches[LAB_MOUNT_PATH], 200))
      ),
      canvas,
      `a shifted "${region}" patch must select the same frames`
    );
  }
});

test('the six mount.js regions the selector keys on are still marked in the file', () => {
  // A missing or re-worded marker fails SAFE — the parse returns null and the whole corpus is
  // selected — which is correct and invisible: the only symptom would be a capture job quietly
  // back at twenty minutes. So it has to fail LOUDLY here too.
  const missing = ALL_MOUNT_REGION_ANCHORS.map(([region]) => region).filter(
    (region) => !labMountSource.some((line) => line.trim() === `// view-lab-region:${region}`)
  );
  assert.deepEqual(
    missing,
    [],
    'these regions are no longer marked in the mount page, so `parseMountRegions` refuses ' +
      `the file and every mount.js change captures the whole corpus again:\n  ${missing.join('\n  ')}`
  );

  const opens = labMountSource.filter(
    (line) =>
      line.trim().startsWith('// view-lab-region:') && line.trim() !== '// view-lab-region:end'
  ).length;
  const closes = labMountSource.filter((line) => line.trim() === '// view-lab-region:end').length;
  assert.equal(opens, ALL_MOUNT_REGION_ANCHORS.length, 'every marked region is a declared region');
  assert.equal(closes, opens, 'every marked region is closed');
});

test('the player-only readership of the settle-stores region is still a fact about the Manager', () => {
  // Three of the four regions are player-only STRUCTURALLY — they are the player mount path, the
  // player provider and the player query params, and no manager frame reaches them.
  const region = parseMountRegions(labMountSource)?.find(
    (candidate) => candidate.key === 'player-settle-stores'
  );
  assert.ok(region, 'the settle-stores region must still parse for this claim to be about it');

  const watchedList = /const watched = \[([^\]]*)\]/.exec(
    labMountSource.slice(region.start - 1, region.end).join('\n')
  );
  assert.ok(
    watchedList,
    `${LAB_MOUNT_PATH} no longer declares a \`const watched = [...]\` inside its settle-stores ` +
      'region, so this test would be asserting about an empty list — re-derive the readership'
  );
  const watched = [...watchedList[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(watched.length > 0, 'the watch list must be non-empty or the claim is vacuous');

  // The bag itself, built with stub collaborators, rather than a slice of the shell's source
  // (issue 1674). The services' import graph is `.svelte`-free, so this runs in a plain Node
  // suite, and the answer is the real key set rather than whatever an indent regex could see.
  const serviceKeys = Object.keys(createManagerServices(STUB_MANAGER_IO));
  assert.ok(
    serviceKeys.length > 20,
    `only ${serviceKeys.length} manager service keys came back, which is too few to be the real ` +
      'bag — read that as a broken build, not a shrunken Manager'
  );

  assert.deepEqual(
    watched.filter((name) => serviceKeys.includes(name)),
    [],
    'the Manager now declares one of the stores the settle-stores region waits on, so that ' +
      'region is no longer player-only: an edit inside its markers would narrow the capture to ' +
      'player frames and publish nothing for the manager frames it moved. Either move the block ' +
      'outside the markers or drop it from MOUNT_REGIONS — do not just update this test.'
  );
});

// `parseMountRegions`, driven directly.

/** The marked regions, authored the way the mount page authors them. */
const mountRegionBlock = (key, { close = true } = {}) => [
  `  // view-lab-region:${key}`,
  `  ${key}: params.get('${key}') === '1',`,
  ...(close ? ['  // view-lab-region:end'] : []),
];

/** Every declared key, in the order the file marks them. */
const DECLARED_MOUNT_REGIONS = ALL_MOUNT_REGION_ANCHORS.map(([region]) => region);

const wellFormedMountSource = () => DECLARED_MOUNT_REGIONS.flatMap((key) => mountRegionBlock(key));

test('parseMountRegions maps each marked region to its own span', () => {
  const regions = parseMountRegions(wellFormedMountSource());
  assert.ok(regions, 'a well-formed file must parse');
  assert.deepEqual(
    regions,
    DECLARED_MOUNT_REGIONS.map((key, index) => ({
      key,
      start: index * 3 + 1,
      end: index * 3 + 3,
    })),
    'each region must span exactly its own marked block, so the spans are disjoint and every ' +
      "line inside one belongs to no other — which is what makes `regionsTouchedAt`'s first-match " +
      'lookup an attribution rather than a guess'
  );
});

test('parseMountRegions refuses every shape whose spans would be a guess', () => {
  const wellFormed = wellFormedMountSource();
  for (const [why, source] of [
    [
      'a marker naming a region the selector has no predicate for',
      [...wellFormed, ...mountRegionBlock('player-nothing-declares-this')],
    ],
    [
      'a region left open',
      [...wellFormed, ...mountRegionBlock('mount-player-app', { close: false })],
    ],
    [
      'a nested opener, which would attribute one block under two keys',
      [
        '  // view-lab-region:mount-player-app',
        '  // view-lab-region:lab-player-provider',
        '  // view-lab-region:end',
        '  // view-lab-region:end',
      ],
    ],
    ['a close with nothing open', ['  // view-lab-region:end', ...wellFormed]],
    ['a declared region nothing marks', wellFormed.slice(3)],
    [
      'the same region marked twice, whose two spans cannot both be it',
      [...wellFormed, ...mountRegionBlock(DECLARED_MOUNT_REGIONS[0])],
    ],
  ]) {
    assert.equal(
      parseMountRegions(source),
      null,
      `${why} must refuse the file, so the selection widens to the corpus rather than narrowing wrongly`
    );
  }

  // The control, so the six refusals above are about the shapes and not about the fixture.
  assert.ok(parseMountRegions(wellFormed), 'the control fixture must parse');
});

test('the player companion cases photograph the seam through the production registry', () => {
  const surface = getCaseById('player-test-companion-surface');
  const narrow = getCaseById('player-test-companion-surface-narrow');
  const fault = getCaseById('player-test-companion-fault');
  const mountSource = readFileSync(resolve(ROOT, LAB_MOUNT_PATH), 'utf8');
  const lang = JSON.parse(readFileSync(resolve(ROOT, 'lang/en.json'), 'utf8'));

  for (const viewCase of [surface, narrow, fault]) {
    assert.equal(viewCase.app, 'fabricate-app');
    assert.equal(viewCase.reaches, 'beyond');
    // An empty ARRAY, never an omitted field: `beyond` and a claimed smoke label are the pair the
    // honesty contract forbids, and an omission would read as an unanswered question.
    assert.deepEqual(viewCase.smokeLabels, []);
    assert.equal(viewCase.query.tab, 'ext:downtime:projects');
    assert.equal(viewCase.query.playerProvider, '1');
    // Every one of the five files a Core frame of this seam can show, so a change to any of them
    // selects these frames rather than an unrelated one.
    for (const file of [
      'src/ui/svelte/apps/PlayerExtensionHost.svelte',
      'src/ui/svelte/apps/FabricateAppRoot.svelte',
      'src/ui/playerExtensions.js',
      'src/ui/playerNavModel.js',
      'src/ui/extensionRegistry.js',
    ]) {
      assert.ok(
        viewCase.sourceMatches.some((pattern) => pattern.test(file)),
        `${viewCase.id} must claim ${file}`
      );
    }
  }

  // The narrow frame photographs BOTH gaps: the enforced minimum window size, rendered rather
  // than asserted about a larger frame, and the rail label's worst case.
  assert.deepEqual(narrow.position, { width: 1024, height: 640 });
  assert.ok(narrow.kinds.includes('responsive'));
  assert.equal(narrow.query.longPlayerLabels, '1');
  assert.ok(
    narrow.expectNoHorizontalOverflow.includes('.fabricate-app-nav'),
    'the rail is the point of the long-label frame: an untruncated label spills into its column'
  );
  assert.equal(fault.query.playerProviderFault, '1');

  // The `aria-label` values are hand-copied from the stand-in provider, so the registry is a
  // MIRROR of `mount.js` and mirrors rot silently — a relabelled stand-in would leave the capture
  // asserting an attribute value nothing renders, and that fails the job WHOLE.
  const railLabel = (viewCase) =>
    viewCase.expectAttributes.find((entry) => entry.name === 'aria-label')?.value;
  const [, short, long] =
    /tab\('projects', '([^']+)', '([^']+)'/.exec(mountSource)?.slice(0) ??
    assert.fail('the stand-in provider no longer declares a `projects` tab');
  assert.equal(railLabel(surface), `Open ${short}`);
  assert.equal(railLabel(narrow), `Open ${long}`);

  // And the fault frame's caption is the shipped Core string, not a paraphrase of it.
  assert.ok(
    fault.expectVisible.includes(lang.FABRICATE.App.Extension.FaultTitle),
    'the fault frame expects Core’s own diagnostic copy verbatim'
  );

  // Containment is REPORTED by design, so the one frame whose subject is that report would fail the
  // driver's console gate.
  const host = readFileSync(resolve(ROOT, 'src/ui/svelte/apps/PlayerExtensionHost.svelte'), 'utf8');
  assert.match(
    mountSource,
    /const EXPECTED_PLAYER_FAULT_REPORT = 'Fabricate \| Player extension mount failed:';/,
    'the lab must excuse a message it names in full, never a prefix or a category'
  );
  assert.ok(
    host.includes("'Fabricate | Player extension mount failed:'"),
    'and that message must still be the one the shipped host reports'
  );
  assert.match(
    mountSource,
    /if \(params\.playerProviderFault\) \{[\s\S]{0,400}console\.error = /,
    'the swallow is gated on the fault case, so every other frame still fails on any error'
  );
  // And it stands in for no assertion: the fault frame's own `expectSelector` names Core's fault
  // stamp, which the shell renders only from its faulted-provider branch.
  assert.match(fault.expectSelector, /data-player-extension-fault/);

  // The lab registers through the PRODUCTION page-session registry and derives the snapshot with
  // the same function the application host calls.
  assert.match(mountSource, /playerProvider: params\.get\('playerProvider'\) === '1'/);
  assert.match(
    mountSource,
    /params\.playerProvider[\s\S]{0,400}registerPlayerNavProvider/,
    'the companion frames register through the production registry'
  );
  assert.match(
    mountSource,
    /extensionSurfaces: deriveExtensionSurfaces\(playerExtensions, \{\s*experimentalFeaturesEnabled: params\.experimental,/,
    "and states the experimental gate from the param that seeds the lab world's own setting"
  );
});

test('the capture runner selects surface coverage, and records that decision', () => {
  const runnerSource = sourceOf(RUNNER_PATH);

  assert.deepEqual(selectedIds([RUNNER_PATH]), coverageIds());
  // Supplying a patch must not narrow an input nobody has attributed. The patch path is the one
  // that grew, so this is the assertion that it grew only where it was meant to.
  assert.deepEqual(
    selectedIds(
      [RUNNER_PATH],
      patchesFor(
        RUNNER_PATH,
        patchAdding(runnerSource, [
          lineOf(runnerSource, 'const READY_TIMEOUT_MS = 20_000;', RUNNER_PATH),
        ])
      )
    ),
    coverageIds(),
    'the runner is not an attributed input; a patch for it must not narrow anything'
  );

  // The decision is a decision, not an omission — so it is written down where the next person to
  // wonder "why is this one not narrowed too?" will read it.
  assert.ok(
    runnerSource.some((line) => line.includes('SELECTS SURFACE COVERAGE')),
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
    "the renderer must consume the selection step's own output"
  );
  assert.match(workflow, /view-lab-screenshots\.mjs apps "\$CASE_IDS"/);

  // The publish step names the directory the renderer writes. Derived from the runner rather than
  // trusted twice, so a moved output directory fails here instead of publishing an empty set.
  assert.match(runner, /join\(ARTIFACT_DIR, 'apps'\)/, 'the runner no longer writes `apps/`');
  assert.match(workflow, /--output-dir ui-screenshot-artifact\/apps/);

  // `--clean` wipes that directory.
  assert.ok(
    !/view-lab-screenshots\.mjs apps[^\n]*--clean/.test(workflow),
    'the workflow wipes the frame directory before a scoped render, so unrendered frames are lost'
  );
});

// `expectView` is otherwise unguarded by `npm test` (issue 1096, B10 / BM8).
// `tests/view-lab-cases.test.js` asserted only that a case DECLARING `expectView` is a manager
// case; the VALUE was never matched against any route id.
function buildExpectViewPredicate() {
  // Route literals live in the shell and in the units extracted from it, so the scan reads them all as one.
  const rootSource = [
    'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    'src/ui/svelte/apps/manager/headerModel.svelte.js',
    'src/ui/svelte/apps/manager/ManagerPageHeader.svelte',
    'src/ui/svelte/apps/manager/ManagerHeaderBreadcrumbs.svelte',
    'src/ui/svelte/apps/manager/ManagerHeaderActions.svelte',
    'src/ui/svelte/apps/manager/ManagerHeaderCraftingActions.svelte',
    'src/ui/svelte/apps/manager/ManagerHeaderGatheringActions.svelte',
    'src/ui/svelte/apps/manager/ManagerSystemNav.svelte',
    'src/ui/svelte/apps/manager/ManagerWorldNav.svelte',
    'src/ui/svelte/apps/manager/ManagerWorldDowntimeNavGroup.svelte',
    'src/ui/svelte/apps/manager/checks/checksRouteModel.svelte.js',
    'src/ui/svelte/apps/manager/gatheringRouteModel.svelte.js',
    'src/ui/svelte/apps/manager/gatheringDraftHandlers.svelte.js',
    'src/ui/svelte/apps/manager/gatheringModifierHandlers.svelte.js',
  ]
    .map((file) => readFileSync(resolve(ROOT, file), 'utf8'))
    .join('\n');
  const rendered = new Set(
    [...rootSource.matchAll(/currentView === '([a-z-]+)'/g)].map((match) => match[1])
  );
  return {
    rootSource,
    rendered,
    accepts: (value) =>
      value.startsWith('checks') ? CHECKS_VIEWS.includes(value) : rendered.has(value),
  };
}

test('every expectView value names a route the manager root actually renders', () => {
  const { rootSource, rendered, accepts } = buildExpectViewPredicate();
  assert.ok(rendered.size > 10, 'the scan must find the manager root route literals at all');

  // (2) — and it is the assertion that makes (1) worth anything.
  assert.match(rootSource, /data-manager-view=\{currentView\}/);
  assert.match(rootSource, /setView\(checksItem\.view\)/);
  assert.match(rootSource, /const checksNavItems = \$derived\(buildChecksNavItems\(/);
  assert.deepEqual(
    buildChecksNavItems({ features: { salvage: true, gathering: true } }).map((item) => item.view),
    [...CHECKS_VIEWS],
    'the rail routes to exactly the CHECKS_VIEWS strings, and to nothing else'
  );

  const declared = VIEW_LAB_CASES.filter((viewCase) => viewCase.expectView);
  assert.ok(declared.length > 20, 'the registry declares expectView broadly enough to pin');
  const offenders = [];
  for (const viewCase of declared) {
    const value = viewCase.expectView;
    // (1) and (3), through the ONE predicate the capability proof below also runs.
    if (!accepts(value)) {
      offenders.push(
        value.startsWith('checks')
          ? `${viewCase.id}: "${value}" is not a CHECKS_VIEWS member`
          : `${viewCase.id}: "${value}" is no route literal in the manager root`
      );
    }
  }
  assert.deepEqual(
    offenders,
    [],
    offenders.join(`
`)
  );
});

test('the expectView pin FAILS against the pre-split value, and against a nav id', () => {
  // The capability proof, run against the two mistakes the pin exists to catch rather than against
  // an arbitrary bad string.
  const { accepts } = buildExpectViewPredicate();

  assert.equal(accepts('checks'), false, 'the PRE-SPLIT value must be rejected');
  assert.equal(accepts('crafting'), false, 'a bare nav-item id must be rejected');
  assert.equal(accepts('settings'), false, "craftingNav's `settings` nav id is not a view");
  // …and the pin is not simply rejecting everything.
  assert.equal(accepts('checks-crafting'), true);
  assert.equal(accepts('crafting-settings'), true, 'the VIEW that nav id maps to is accepted');
  assert.equal(accepts('recipe-edit'), true);
});

// the recipe-readiness string-path probe (issue 1098, BH4). `recipeReadiness.js` decides the
// readiness BADGES on the recipe editor's tabs, and issue 1098 makes its routed-check validation
// policy-conditional.
test('a change confined to recipeReadiness.js selects the recipe-editor cases, never the fallback', () => {
  const selected = mapChangedFilesToCases([
    'src/ui/svelte/apps/manager/recipe/recipeReadiness.js',
  ]).map((viewCase) => viewCase.id);

  assert.ok(selected.length > 0, 'it selects something');
  assert.ok(
    !selected.includes(FALLBACK_CASE_ID),
    'it never falls through to the app-shell fallback, which would publish a frame showing nothing'
  );
  // Every selected case is a recipe one: the badges this module determines are drawn
  // nowhere else, so a selection reaching the Checks studio would be over-broad.
  const strays = selected.filter((id) => !getCaseById(id)?.kinds?.includes('recipes'));
  assert.deepEqual(strays, [], `only recipe cases are selected; got ${strays.join(', ')}`);
  // …and the canonical recipe-editor frames ARE among them.
  for (const expected of ['manager-recipe-edit-results', 'manager-recipe-edit-validation']) {
    assert.ok(selected.includes(expected), `${expected} is selected`);
  }

  // The negative control: an unmatched path DOES return the fallback, so the assertion
  // above is discriminating rather than vacuously true.
  assert.deepEqual(
    mapChangedFilesToCases(['src/ui/svelte/apps/manager/no-such-module-for-this-probe.js']).map(
      (viewCase) => viewCase.id
    ),
    [FALLBACK_CASE_ID],
    'an unmatched UI path falls through to the fallback, which is what the probe rules out'
  );
});

// The environment editor's validation tab (issue 1517). THE DEFECT THIS PINS WAS A STALE CLAIM, NOT
// AN ABSENT ONE, and the difference is why it survived a green tree for as long as it did.
const ENVIRONMENT_DIR = 'src/ui/svelte/apps/manager/environment/';

/** The four cases whose `environment/` prefix claimed the validation tab without opening it. */
const ENVIRONMENT_DIRECTORY_CLAIMANTS = Object.freeze([
  'manager-environments-browse-normal',
  'manager-environment-edit-events',
  'manager-environment-edit-blind-weights',
  'manager-environment-edit-automatic-force-add',
]);

test('the environment validation tab selects the frame that opens it, and only that frame', () => {
  const selected = mapChangedFilesToCases([
    `${ENVIRONMENT_DIR}EnvironmentValidationTab.svelte`,
  ]).map((viewCase) => viewCase.id);

  assert.deepEqual(
    selected,
    ['manager-environment-validation'],
    'a change to the environment validation tab must select the one frame that opens that tab, ' +
      'and none of the four frames that merely live in its directory'
  );
});

test('narrowing the environment claim leaves every sibling in that directory claimed', () => {
  // Named files rather than a directory walk, because the assertion has to fail when a pattern
  // stops matching a file that still exists — a walk over whatever is on disk cannot tell that
  // from a file that was deleted.
  for (const sibling of [
    'EnvironmentEventsTab.svelte',
    'EnvironmentTasksTab.svelte',
    'EnvironmentOverviewTab.svelte',
    'CompositionList.svelte',
    'EnvironmentSummaryInspector.svelte',
  ]) {
    const selected = mapChangedFilesToCases([`${ENVIRONMENT_DIR}${sibling}`]).map(
      (viewCase) => viewCase.id
    );
    for (const claimant of ENVIRONMENT_DIRECTORY_CLAIMANTS) {
      assert.ok(
        selected.includes(claimant),
        `${sibling} lost its claim on ${claimant}; the exclusion is too wide and now takes ` +
          `siblings with it. It selected ${JSON.stringify(selected)}`
      );
    }
    assert.ok(
      !selected.includes(FALLBACK_CASE_ID),
      `${sibling} fell through to the app-shell fallback, which publishes a frame of a window ` +
        'that cannot contain it'
    );
  }
});

test('the environment readiness module selects the validation frame AND the badge frames', () => {
  // It is the producer of both: the tab strip's badge counts and the validation tab's own rows and
  // verdict read the same evaluator.
  const selected = mapChangedFilesToCases([`${ENVIRONMENT_DIR}environmentReadiness.js`]).map(
    (viewCase) => viewCase.id
  );
  assert.ok(
    selected.includes('manager-environment-validation'),
    `a readiness change must select the frame that draws its verdict; it selected ${JSON.stringify(selected)}`
  );
  for (const claimant of ENVIRONMENT_DIRECTORY_CLAIMANTS) {
    assert.ok(
      selected.includes(claimant),
      `a readiness change must keep selecting ${claimant}, which draws its badge counts`
    );
  }
});

test('the validation surface is represented by a frame that can draw its View deep link', () => {
  // `EditorValidationSurface`'s representative pair photographs the surface's two rail arities and
  // NEITHER can contain the row's View button: it renders only where a row carries a route, and the
  // two frames the pair names are a Checks tick list and a recipe-item tab whose producer emits
  // none.
  const members =
    BROAD_SIGNAL_CASE_OVERRIDES['src/ui/svelte/components/EditorValidationSurface.svelte'];
  assert.ok(
    members.includes('manager-recipe-edit-validation'),
    `the surface's representative set must include the recipe editor's validation frame; it is ` +
      JSON.stringify(members)
  );

  // The FOURTH member, pinned the same way and for a state neither the pair nor the recipe frame
  // can reach: the IN-GROUP SORT.
  assert.ok(
    members.includes('manager-checks-validation-retired-placeholder'),
    "the surface's representative set must include the one frame whose group holds both a " +
      `critical issue and a tick, or the in-group sort is published by nothing; it is ${JSON.stringify(members)}`
  );

  // And that frame has to prove it drew the BUTTON. A ROW WAS THE FIRST ATTEMPT AND COULD NOT FAIL,
  // which is why the clause is written on the hook instead.
  const recipeFrame = getCaseById('manager-recipe-edit-validation');
  assert.equal(
    typeof recipeFrame.expectSelector,
    'string',
    'manager-recipe-edit-validation must assert the surface it represents is on screen'
  );
  assert.ok(
    recipeFrame.expectSelector.includes('data-recipe-issue-view'),
    'it must name the row action itself, or an all-clear validation tab satisfies it and the ' +
      `member reports SATISFIED for a frame that cannot contain the button: got ` +
      `"${recipeFrame.expectSelector}"`
  );

  // …AND THE FIXTURE HAS TO BE ABLE TO DRAW ONE.
  const routed = content.recipes
    .filter((recipe) => evaluateRecipeReadiness(recipe, {}).issues.some((issue) => issue.target))
    .map((recipe) => recipe.id);
  assert.deepEqual(
    routed,
    ['sm-r-runeplate-draft'],
    'the set of lab recipes whose readiness deep-links an issue changed. This frame is the only ' +
      "representative one that can contain the surface's View button, and it can only do that " +
      'while the recipe its steps open is in this set'
  );
  const opened = recipeFrame.steps
    .map((step) => /^\[data-recipe-edit="([^"]+)"\]$/u.exec(step?.selector ?? '')?.[1])
    .filter(Boolean);
  assert.deepEqual(
    opened,
    routed,
    'the case must open a recipe that draws the button BY ID. Clicking the first Edit button of ' +
      'an A-to-Z list opens whichever recipe happens to sort first, which is how this frame came ' +
      'to photograph five green ticks under a case named for a deep link'
  );

  const environmentFrame = getCaseById('manager-environment-validation');
  assert.equal(
    typeof environmentFrame?.expectSelector,
    'string',
    'manager-environment-validation must assert its own tab panel is on screen'
  );
});

/**
 * The `name=value` pairs a component file writes STATICALLY, from its parsed template.
 *
 * @param {string} source `.svelte` text
 * @param {string} filename for the parser's own error messages
 * @returns {Set<string>} every static pair, as `name=value`
 */
function staticPairsIn(source, filename) {
  const pairs = new Set();
  const literalText = (attribute) => {
    const nodes = Array.isArray(attribute.value) ? attribute.value : [attribute.value];
    return nodes.length === 1 && nodes[0]?.type === 'Text' ? nodes[0].data : null;
  };
  walkTemplate(parse(source, { modern: true, filename }).fragment, (node) => {
    for (const attribute of node.attributes ?? []) {
      if (attribute.type !== 'Attribute') continue;
      const text = literalText(attribute);
      if (text !== null) pairs.add(`${attribute.name}=${text}`);
      if (attribute.name !== 'hookAttrs') continue;
      const bag = Array.isArray(attribute.value) ? attribute.value[0] : attribute.value;
      if (bag?.expression?.type !== 'ObjectExpression') continue;
      for (const region of bag.expression.properties) {
        if ((region.key?.name ?? region.key?.value) !== 'root') continue;
        if (region.value?.type !== 'ObjectExpression') continue;
        for (const hook of region.value.properties) {
          const name = hook.key?.name ?? hook.key?.value;
          if (typeof name === 'string' && hook.value?.type === 'Literal') {
            pairs.add(`${name}=${hook.value.value}`);
          }
        }
      }
    }
  });
  return pairs;
}

/** {@link staticPairsIn} over one repo-relative `.svelte` path. */
function staticAttributePairs(file) {
  const source = SOURCES[file];
  assert.ok(source, `${file} is not in the .svelte corpus this reads`);
  return staticPairsIn(source, file);
}

/** A SYNTHETIC component carrying one probe hook six times over, in six different positions. */
const HOOK_DETECTOR_SOURCE = [
  '<!-- data-probe="commented" -->',
  '<script>',
  "  // data-probe='in-a-js-comment'",
  "  const unspread = { root: { 'data-probe': 'unspread' } };",
  '</script>',
  '',
  '<section data-probe="markup">',
  '  <p>data-probe="prose"</p>',
  "  <EditorValidationSurface hookAttrs={{ root: { 'data-probe': 'bagged' } }}",
  '    viewDataAttr="data-probe-view" />',
  '</section>',
].join('\n');

test('the validation hook reader sees what renders and not what merely appears', () => {
  const pairs = staticPairsIn(HOOK_DETECTOR_SOURCE, 'hook-detector.svelte');
  assert.deepEqual(
    [...pairs].sort(),
    ['data-probe=bagged', 'data-probe=markup', 'viewDataAttr=data-probe-view'],
    'the reader must find the markup attribute, the `hookAttrs.root` property and the literal ' +
      'prop — and NOTHING else. `commented`, `in-a-js-comment` and `prose` are the text-scan ' +
      'haystack this replaced; `unspread` is a bag declared and never passed, which renders no ' +
      'attribute at all and is the precise conversion slip the clause below exists to catch.'
  );
});

test('each validation frame names a hook the component it opens actually writes', () => {
  // THE SUITE-WIDE `expectSelector` CHECK CANNOT DO THIS, and the gap is measured rather than
  // assumed. It is also the contract a later adoption of `EditorValidationSurface` has to keep.
  const pins = [
    [
      // The markup form: the tab writes the hook on its own root element.
      'src/ui/svelte/apps/manager/environment/EnvironmentValidationTab.svelte',
      'data-environment-tab=validation',
      'manager-environment-validation',
    ],
    [
      // The hook-bag form: this tab is converted, so its root hook reaches the DOM only because
      // it is a property of the object it passes as `hookAttrs.root`.
      'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte',
      'data-recipe-tab=validation',
      'manager-recipe-edit-validation',
    ],
    [
      // The row ACTION's hook, which the same frame's selector now names.
      'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte',
      'viewDataAttr=data-recipe-issue-view',
      'manager-recipe-edit-validation',
    ],
  ];

  for (const [file, pair, caseId] of pins) {
    assert.ok(
      staticAttributePairs(file).has(pair),
      `${file} no longer writes \`${pair}\`, which ${caseId}'s expectSelector names. The capture ` +
        'job would fail whole and publish nothing, for every case in the run.'
    );
  }

  // The reader's own discrimination is driven over a synthetic fixture in the test above, which
  // is where non-vacuity for these three membership tests lives: a live file can confirm only
  // that the reader finds what is present.
});

// The world-tool capture cases and the lab fixture that feeds them (issue 1373). A CASE THAT NAMES
// A FIXTURE RECORD IS A HAND-MAINTAINED MIRROR, and this is the guard that stops it rotting
// silently.
/** The one `(case, row)` pair whose row deliberately has NO membership record. */
const MEMBERLESS_ROW_CASES = new Set([
  'world-tool-entry-unlinked|lab-tool-unlinked',
  // The DANGLING SOURCE LINK record (issue 1373).
  'world-tool-entry-source-missing|lab-tool-warped-crucible',
  // The same record on its Validation tab.
  'world-tool-entry-validation|lab-tool-warped-crucible',
]);

test('every world tool id the capture cases click exists in the lab world, projected', async () => {
  const [{ buildLabContent }, { createToolScopeStore }, { projectWorldScopeEntity }] =
    await Promise.all([
      import('./view-lab/world/labContent.js'),
      import('../src/systems/worldScopeStores.js'),
      import('../src/ui/svelte/stores/worldScopeProjection.js'),
    ]);

  const content = buildLabContent();
  const settings = new Map([['toolScope', content.toolScope]]);
  const store = createToolScopeStore({
    getSetting: (key) => settings.get(key),
    setSetting: async () => {},
  });
  store.load();
  const scope = projectWorldScopeEntity({
    entityType: 'tool',
    corpus: store.corpus(),
    systems: content.systems.map((system) => ({ id: system.id, name: system.name })),
  });

  // PAIRED WITH THE CASE THAT CLICKS IT, not flattened to a set of ids (issue 1373, round 2).
  const clicked = [];
  for (const viewCase of VIEW_LAB_CASES) {
    if (!String(viewCase.expectView || '').startsWith('world-tool')) continue;
    for (const step of viewCase.steps || []) {
      for (const [, id] of String(step.selector || '').matchAll(
        /\[data-scoped-list-(?:row|inspect)="([^"]+)"\]/g
      )) {
        clicked.push({ caseId: viewCase.id, id });
      }
    }
  }
  assert.ok(clicked.length > 0, 'the scan found no clicked row ids; it is broken');

  for (const { caseId, id } of clicked) {
    const entry = scope.entries.find((candidate) => candidate.id === id);
    assert.ok(
      Boolean(entry),
      `a capture case clicks the world row "${id}", which the lab world does not hold`
    );
    if (MEMBERLESS_ROW_CASES.has(`${caseId}|${id}`)) continue;
    assert.ok(
      entry.membershipCount > 0,
      `"${id}" has no membership record, so its entry editor shows no per-system row and the ` +
        'frame is evidence of an empty state rather than of the screen'
    );
  }

  // AND THE EXEMPTIONS ARE LIVE. An entry naming a pair no case makes, or one whose record has
  // since gained a membership, is a permission that has stopped describing anything - and it
  // would sit here silently granting the next author a pass they did not ask for.
  for (const key of MEMBERLESS_ROW_CASES) {
    const [caseId, id] = key.split('|');
    assert.ok(
      clicked.some((pair) => pair.caseId === caseId && pair.id === id),
      `${key} exempts a click no case makes; the exemption is stale`
    );
    assert.equal(
      scope.entries.find((candidate) => candidate.id === id)?.membershipCount,
      0,
      `${key} exempts a record that HAS a membership now, so the exemption is stale`
    );
  }

  // NON-VACUITY ON THE FIXTURE, not only on the scan. Both states the catalogue draws have to
  // exist, or the frame shows one badge and proves nothing about the other.
  assert.ok(
    scope.entries.some((entry) => entry.hasSourceLink),
    'the lab world holds a LINKED world tool'
  );
  assert.ok(
    scope.entries.some((entry) => !entry.hasSourceLink),
    'and an UNLINKED one, which is the state a source-item badge alone cannot show'
  );
});

// The world-COMPONENT capture cases and the lab fixture that feeds them (issue 1371). The twin of
// the guard above, and it resolves against a DIFFERENT corpus for a reason that is structural
// rather than incidental: the lab's world component roster is not a seeded literal.
test('every recipe id the capture cases name exists in the lab world', async () => {
  const { buildLabContent } = await import('./view-lab/world/labContent.js');
  const content = buildLabContent();
  const recipeIds = new Set((content.recipes ?? []).map((recipe) => String(recipe?.id ?? '')));
  assert.ok(recipeIds.size > 0, 'the lab world holds recipes; the fixture read is broken');

  const IDENTITY_HOOK = /\[data-(?:recipe-id|recipe-edit|recipe-select|access-row)="([^"]+)"\]/g;
  const named = [];
  for (const viewCase of VIEW_LAB_CASES) {
    // BOTH halves of a case, not only its steps.
    const selectors = [
      ...(viewCase.steps ?? [])
        .filter((step) => typeof step === 'object')
        .map((step) => String(step.selector ?? '')),
      String(viewCase.expectSelector ?? ''),
    ];
    for (const selector of selectors) {
      for (const [, id] of selector.matchAll(IDENTITY_HOOK)) {
        named.push({ caseId: viewCase.id, id });
      }
    }
  }

  // NON-VACUITY, and a floor rather than `> 0`: a regex that stopped matching all but one hook
  // would report a surviving id and read as a healthy guard. The registry names two dozen.
  const distinct = new Set(named.map((entry) => entry.id)).size;
  assert.ok(distinct >= 20, `the scan found only ${distinct} distinct recipe ids; it is broken`);

  for (const { caseId, id } of named) {
    assert.ok(
      recipeIds.has(id),
      `${caseId} names the recipe "${id}", which the lab world does not hold - the capture aborts ` +
        'on this step and the whole run publishes nothing'
    );
  }
});

// THE THREE STATES ISSUE 1515 REGISTERED, DERIVED FROM THE FIXTURE. Each of these three cases
// photographs a state that exists only because the fixture is in a particular condition, and in
// every case the failure mode is a frame that looks fine.
test('the states issue 1515 registered are still reachable from the lab fixture', async () => {
  const { buildLabContent } = await import('./view-lab/world/labContent.js');
  const { evaluateSystemValidation } = await import('../src/systems/systemValidation.js');
  const content = buildLabContent();

  const systemOf = (id) => (content.systems ?? []).find((system) => system.id === id);
  const reportFor = (systemId) => {
    const system = systemOf(systemId);
    assert.ok(system, `the lab world no longer holds the crafting system "${systemId}"`);
    return evaluateSystemValidation(system, {
      recipes: (content.recipes ?? []).filter((recipe) => recipe.craftingSystemId === systemId),
      components: system.components ?? [],
      // The environments the store also feeds in can only ADD issues, so omitting them makes
      // every claim below a LOWER bound - which is the safe direction for a reachability check.
      environments: [],
    });
  };

  // `manager-recipes-blocked-enable-flash` presses a switch whose write the activation gate
  // refuses.
  const flashCase = getCaseById('manager-recipes-blocked-enable-flash');
  const blockedId = /data-recipe-id="([^"]+)"/.exec(
    flashCase.steps.map((step) => step.selector ?? '').join(' ')
  )?.[1];
  assert.ok(blockedId, 'the flash case must click a named recipe row; the read is broken');
  const blocked = (content.recipes ?? []).find((recipe) => recipe.id === blockedId);
  assert.ok(blocked, `the flash case clicks "${blockedId}", which the lab world does not hold`);
  assert.equal(
    blocked.enabled,
    false,
    `${blockedId} is enabled, so the case's click DISABLES it - which is never gated, and the ` +
      'frame would be the plain recipe browser under a case named for the refusal alert'
  );
  assert.ok(
    reportFor(blocked.craftingSystemId).issues.some(
      (issue) => issue.entityId === blockedId && issue.severity === 'critical'
    ),
    `${blockedId} raises no critical readiness issue, so activation would ACCEPT it and no flash ` +
      'would render'
  );

  // `manager-system-edit-validation` photographs the kind-grouped issue list, and its
  // `expectSelector` requires a populated `recipe` group inside the counts row.
  const validationCase = getCaseById('manager-system-edit-validation');
  assert.ok(
    reportFor(validationCase.query.system).issues.some((issue) => issue.kind === 'recipe'),
    `${validationCase.query.system} reports no recipe-kind issue, so the validation tab draws its ` +
      'empty panel and the case cannot reach the group its expectSelector names'
  );

  // `manager-access-recipe-selected` reaches the Access route, which the crafting rail offers
  // only for a `restricted` system, and then selects one of that system's recipes by id.
  const accessCase = getCaseById('manager-access-recipe-selected');
  assert.equal(
    systemOf(accessCase.query.system)?.visibilityMode,
    'restricted',
    `${accessCase.query.system} is no longer restricted, so the Access rail entry the case clicks ` +
      'is not rendered at all'
  );
  const accessRecipeId = /data-access-row="([^"]+)"/.exec(
    accessCase.steps.map((step) => step.selector ?? '').join(' ')
  )?.[1];
  assert.equal(
    (content.recipes ?? []).find((recipe) => recipe.id === accessRecipeId)?.craftingSystemId,
    accessCase.query.system,
    `the Access case selects "${accessRecipeId}", which is not a recipe of the system it opens`
  );
});

test('every world component id the capture cases click exists in the lab world', async () => {
  const { buildLabContent } = await import('./view-lab/world/labContent.js');
  const content = buildLabContent();

  const migrated = new Set(
    (content.systems ?? []).flatMap((system) =>
      (system.components ?? []).map((component) => String(component?.id ?? ''))
    )
  );
  const seeded = new Set(
    (content.componentScope?.entities ?? []).map((entity) => String(entity?.id ?? ''))
  );
  const available = new Set([...migrated, ...seeded]);

  // NON-VACUITY ON BOTH HALVES, because either one empty would make the union assertion below
  // pass on the strength of the other.
  assert.ok(migrated.size > 0, 'the lab systems carry components for the migration to lift');
  assert.ok(seeded.size > 0, 'and the fixture seeds the world-only records the entry cases need');

  const clicked = [];
  for (const viewCase of VIEW_LAB_CASES) {
    if (!String(viewCase.expectView || '').startsWith('world-component')) continue;
    for (const step of viewCase.steps || []) {
      for (const [, id] of String(step.selector || '').matchAll(
        /\[data-scoped-list-(?:row|inspect|select)="([^"]+)"\]/g
      )) {
        clicked.push({ caseId: viewCase.id, id });
      }
    }
  }
  assert.ok(clicked.length > 0, 'the scan found no clicked component row ids; it is broken');

  for (const { caseId, id } of clicked) {
    assert.ok(
      available.has(id),
      `${caseId} clicks the world component row "${id}", which the lab world does not hold`
    );
  }
});

// EXISTENCE IS NOT REACHABILITY (issue 1371, round 2). The guard above proves a clicked id is IN
// THE CORPUS. So a case that clicks a scoped-list row must either land inside the first page under
// the frame's own sort, or NARROW the list first.
test('a capture case that clicks a scoped-list row can actually reach it', async () => {
  const { buildLabContent } = await import('./view-lab/world/labContent.js');
  const content = buildLabContent();

  // THE FRAME'S OWN CONSTANTS, read from its source rather than restated. A hard-coded 10 here
  // would go on passing the day the window changes, which is the drift this file exists to stop.
  const frame = readFileSync(
    resolve(ROOT, 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte'),
    'utf8'
  );
  const pageSize = Number(frame.match(/const DEFAULT_PAGE_SIZE = (\d+);/)?.[1]);
  assert.ok(pageSize > 0, 'the frame declares a default page size; the read is broken');

  // The world component corpus as the catalogue orders it: every in-system component the migration
  // lifts, plus the fixture's world-only records, by NAME ascending. IT MODELS `name-asc`, WHICH IS
  // THE FRAME'S RESTING SORT AND NOT A UNIVERSAL ONE.
  const byName = [
    ...new Map(
      [
        ...(content.systems ?? []).flatMap((system) =>
          (system.components ?? []).map((component) => [
            String(component?.id ?? ''),
            String(component?.name ?? ''),
          ])
        ),
        ...(content.componentScope?.entities ?? []).map((entity) => [
          String(entity?.id ?? ''),
          String(entity?.name ?? ''),
        ]),
      ].filter(([id]) => id)
    ),
  ].sort((left, right) => left[1].localeCompare(right[1]));

  assert.ok(
    byName.length > pageSize,
    `the corpus must be longer than one page or this guard proves nothing; got ${byName.length}`
  );

  let checked = 0;
  for (const viewCase of VIEW_LAB_CASES) {
    if (!String(viewCase.expectView || '').startsWith('world-component')) continue;
    const steps = viewCase.steps || [];
    for (const [index, step] of steps.entries()) {
      const row = String(step.selector || '').match(
        /\[data-scoped-list-(?:row|inspect|select)="([^"]+)"\]/
      );
      if (!row) continue;
      checked += 1;
      const position = byName.findIndex(([id]) => id === row[1]);
      if (position >= 0 && position < pageSize) continue;
      // Not on page one, so SOME earlier step must have narrowed the list.
      const narrowed = steps
        .slice(0, index)
        .some((earlier) => 'fill' in earlier && String(earlier.selector).includes('list-search'));
      assert.ok(
        narrowed,
        `${viewCase.id} clicks "${row[1]}", which sorts at position ${position} of ` +
          `${byName.length} — past the ${pageSize}-row first page — and no earlier step fills the ` +
          'list search. The capture driver throws by name on a selector that matches nothing and ' +
          'aborts the WHOLE run, so this publishes nothing and takes every other case with it.'
      );
    }
  }
  assert.ok(checked > 0, 'the scan found no clicked rows to check; it is broken');

  // THE SEEDED WORLD STATES ARE LIVE, each named by the frame it exists for. An entry that
  // stopped describing anything would be a fixture the cases silently no longer photograph.
  assert.ok(
    content.componentScope.defaults['sm-iron-ingot']?.category,
    'the inheriting frames need an AUTHORED world category; a refused election photographs the ' +
      '"no world category is set" branch and looks like a correct inheriting frame'
  );
  assert.equal(
    content.componentScope.membership['sm-iron-ingot|lab-smithing']?.inherit?.category,
    true,
    'and the membership record that inherits it'
  );
  assert.ok(
    (content.componentScope.defaults['sm-coal']?.tags ?? []).length > 0,
    'the world tag list, its note and the mute grid all need world tags the migration never writes'
  );
  assert.ok(
    (content.componentScope.membership['sm-coal|lab-smithing']?.mutedTags ?? []).length > 0,
    'and one member system muting one of them'
  );
  assert.ok(
    content.componentScope.entities.some((entity) => !entity.originItemUuid),
    'the entry validation frame needs a record with NO source item, which is its one blocking row'
  );
});

// The fixture ids the three issue-1513 cases click, pinned against the lab world (issue 1632).

test('the recipe-item contents cases open a definition the lab world holds, with recipes left to link', async () => {
  const { buildLabContent } = await import('./view-lab/world/labContent.js');
  const content = buildLabContent();

  // The cases and the definition each clicks, read off the registry rather than restated: a case
  // retargeted onto another book must move this check with it or fail here.
  const clicked = [];
  for (const viewCase of VIEW_LAB_CASES) {
    if (!String(viewCase.expectView || '').startsWith('recipe-item')) continue;
    for (const step of viewCase.steps || []) {
      for (const [, id] of String(step.selector || '').matchAll(
        /\[data-books-scrolls-edit="([^"]+)"\]/g
      )) {
        clicked.push({ caseId: viewCase.id, id, system: viewCase.query?.system });
      }
    }
  }
  assert.ok(clicked.length > 0, 'the scan found no clicked recipe-item definition; it is broken');

  for (const { caseId, id, system } of clicked) {
    const definitions =
      (content.systems ?? []).find((entry) => entry.id === system)?.recipeItemDefinitions ?? [];
    assert.ok(
      definitions.some((definition) => String(definition?.id) === id),
      `${caseId} opens the recipe-item definition "${id}", which "${system}" does not hold`
    );
  }

  // AND THE TWO STATES THE CONTENTS PAIR NEEDS, which mere existence gives neither of them.
  const herbalism = (content.systems ?? []).find((entry) => entry.id === 'lab-herbalism');
  const book = (herbalism?.recipeItemDefinitions ?? []).find(
    (definition) => String(definition?.id) === 'hb-book'
  );
  const linked = (book?.recipeIds ?? []).length;
  const systemRecipes = (content.recipes ?? []).filter(
    (entry) => String(entry?.craftingSystemId) === 'lab-herbalism'
  ).length;

  assert.ok(
    linked > 0,
    'manager-recipe-item-contents expects the LINKED list; with no membership `hb-book` draws ' +
      'the `data-recipe-item-contents-empty` line, its expectSelector matches nothing, and the ' +
      'capture fails WHOLE'
  );
  assert.ok(
    systemRecipes > linked,
    'manager-recipe-item-contents-picker expects an OPENABLE trigger over a populated panel. ' +
      '`RecipeItemContentsTab` passes `triggerAriaDisabled={linkable.length === 0}`, and the ' +
      'primitive refuses to open on that flag exactly as it does on `disabled`, so a book ' +
      `linking every recipe in its system (${linked} of ${systemRecipes}) leaves a trigger the ` +
      'driver clicks to no effect and a panel that never opens'
  );
});

// THE PICKER FRAME'S SUBJECT MOVED WITH THE SEARCH FIELD (issue 1513, review r1) ──────── The case
// was registered one phase before the field existed and recorded, beside its own `expectSelector`,
// that it made "no `.manager-travel-popover-search` claim: this call site passes
// `showSearch={false}` today".
test('the recipe-item picker frame claims the search field its call site now renders', () => {
  const callSite = readFileSync(
    resolve(ROOT, 'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte'),
    'utf8'
  );
  assert.ok(
    !/showSearch=\{false\}/u.test(callSite),
    '`RecipeItemContentsTab` suppresses its search field again. Either the phase was reverted — ' +
      'in which case the frame must stop claiming the field — or the search is off by accident'
  );

  const picker = VIEW_LAB_CASES.find(
    (viewCase) => viewCase.id === 'manager-recipe-item-contents-picker'
  );
  assert.ok(Boolean(picker), 'the case is registered');
  assert.match(
    picker.expectSelector,
    /:has\(\.manager-travel-popover-search\)/u,
    'the frame photographs a SEARCHABLE library panel now, so its own assertion has to require ' +
      'the field. Without it the capture passes over the pre-phase presentation and publishes a ' +
      'frame that cannot show the regression it is evidence against'
  );
  assert.match(
    picker.expectSelector,
    /\.manager-travel-popover-options \.manager-travel-option/u,
    'and it still requires a populated option row, because a panel over an empty list is not ' +
      'evidence for the presentation this frame exists to publish'
  );
});

test('the access inspector case clicks a recipe row on the Access list first page', async () => {
  const { buildLabContent } = await import('./view-lab/world/labContent.js');
  const content = buildLabContent();

  // THE SCREEN'S OWN PAGE SIZE, read from its source rather than restated — a hard-coded 10 here
  // would go on passing the day the Access list changes, which is the drift this file exists to
  // stop.
  const view = readFileSync(
    resolve(ROOT, 'src/ui/svelte/apps/manager/AccessTabView.svelte'),
    'utf8'
  );
  const pageSize = Number(view.match(/let pageSize = \$state\((\d+)\);/)?.[1]);
  assert.ok(pageSize > 0, 'the Access list declares a default page size; the read is broken');

  const clicked = [];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps || []) {
      for (const [, id] of String(step.selector || '').matchAll(/\[data-access-row="([^"]+)"\]/g)) {
        clicked.push({ caseId: viewCase.id, id, system: viewCase.query?.system });
      }
    }
  }
  assert.ok(clicked.length > 0, 'the scan found no clicked access row; it is broken');

  for (const { caseId, id, system } of clicked) {
    const recipes = (content.recipes ?? []).filter(
      (entry) => String(entry?.craftingSystemId) === String(system)
    );
    assert.ok(
      recipes.some((entry) => String(entry?.id) === id),
      `${caseId} clicks the access row "${id}", which "${system}" does not hold`
    );
    // REACHABILITY, answered without appealing to the list's sort order: the Access list opens
    // unfiltered, so every row of a system holding no more than one page of recipes is on page one
    // whatever order they arrive in.
    assert.ok(
      recipes.length <= pageSize,
      `${caseId} clicks "${id}" on a system holding ${recipes.length} recipes against a ` +
        `${pageSize}-row first page, so the row may not be rendered at all. The capture driver ` +
        'throws by name on a selector that matches nothing and aborts the WHOLE run.'
    );
  }
});

// `ComponentSourcesBar` publishes the three tabs it draws in, not only the one its directory names
// (issue 1500).
test('the crafting sources bar routes to the inventory and alchemy frames that draw it too', () => {
  const selected = mapChangedFilesToCases([
    'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
  ]).map((viewCase) => viewCase.id);

  for (const id of ['player-inventory', 'player-alchemy-workbench']) {
    assert.ok(
      selected.includes(id),
      `a change confined to the sources bar no longer publishes "${id}", which is a tab the bar ` +
        'renders in and whose own `sourceMatches` is the only thing that can reach it — ' +
        '`CRAFTING_SHARED` covers `apps/crafting/` and stops there'
    );
  }
  // AND THE FRAME THAT OPENS ITS PANEL. Every other frame in this set draws the picker CLOSED, so
  // without this one a change to the panel published twenty-nine photographs of a shut trigger.
  assert.ok(
    selected.includes('player-crafting-sources-picker'),
    'the one frame in the registry that opens the sources picker must be in the set a change to ' +
      'the bar publishes'
  );
  // NON-VACUITY, and it is the half that would rot silently: the two ids above are also reachable
  // through a pattern claiming the whole player tree, which would satisfy every assertion here
  // while making the routing meaningless.
  assert.ok(
    !selected.includes('player-journal-stacked'),
    'the bar must not select a tab it does not render in; the routing has been widened'
  );
});

/**
 * The page header and the nav rail are their own units (issues 1717, 1720), but a change to one
 * of them changes exactly the screens the shell's own change would. The 42 `sourceMatches` rows
 * that name the shell are extended by hand, so this equality is the only thing standing between
 * a forgotten row and a header PR that silently publishes one frame fewer than it changed.
 */
test('every unit the shell extracted selects the shell\u2019s own case set', () => {
  const MANAGER = 'src/ui/svelte/apps/manager';
  const shell = [`${MANAGER}/CraftingSystemManagerRoot.svelte`];
  const extracted = [
    'ManagerPageHeader',
    'ManagerHeaderBreadcrumbs',
    'ManagerHeaderActions',
    'ManagerHeaderCraftingActions',
    'ManagerHeaderGatheringActions',
  ].map((unit) => `${MANAGER}/${unit}.svelte`);
  const ids = (paths) =>
    [...new Set(mapChangedFilesToCases(paths).map((entry) => entry.id ?? entry))].sort();
  const expected = ids(shell);
  // NON-VACUITY: the shell selects a real, large case set, so an empty answer cannot pass.
  assert.ok(expected.length > 40, `the shell selects only ${expected.length} cases`);
  assert.deepEqual(ids(extracted), expected, 'the page header no longer reaches the shell\u2019s views');
  for (const path of extracted) {
    assert.deepEqual(ids([path]), expected, `${path} alone selects a different set`);
  }
});
