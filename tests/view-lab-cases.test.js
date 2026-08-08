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
  ACTOR_KNOWLEDGE_RENDER_FILES,
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
  parseLabActorTableRegions,
  publishableCases,
} from '../scripts/lib/viewLabCases.js';

import { collectWorkingTreeSources } from './helpers/sourceScan.js';
import { buildLabContent } from './view-lab/world/labContent.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The fixture world, for checks that must derive a case's truth rather than trust its author. */
const content = buildLabContent();

/** The viewport the capture driver uses; asserted here so the arithmetic is gated, not just run. */
const CAPTURE_VIEWPORT = { width: 1920, height: 1080 };

/**
 * The roots every check below draws its corpus from, and the extensions that make them complete.
 *
 * `.css` and `.json` are not decoration. Without them the corpus is 548 files instead of 550, and
 * the two it drops are `styles/fabricate.css` and `lang/en.json` — which reds the orphan check
 * with two false orphans (both theme cases claim `/^styles\/fabricate\.css$/`) and kills the
 * `lang/en.json` clause in the render-source filter below. They are stated HERE, per caller, rather
 * than added to `SCANNED_EXTENSIONS`: that constant is shared with three literal gates that scan
 * `src/` only, where widening it would be inert today and would silently move their scope the first
 * time a `.json` landed under `src/`.
 */
const CORPUS_ROOTS = ['src', 'styles', 'lang'];
const CORPUS_EXTENSIONS = ['.js', '.mjs', '.svelte', '.css', '.json'];

/**
 * The corpus, read from the WORKING TREE in a single walk.
 *
 * This used to be `git ls-files` followed by a `readFileSync` of each path it named — the index
 * asked what exists and the working tree asked what it contains. That divergence threw ENOENT
 * inside the render-source accessor for real once, six tests failing at once right after a
 * `git merge --ff-only`, and it also answered silently wrong: an unstaged component was invisible
 * and a staged deletion still counted. See `collectWorkingTreeSources` for what the single walk
 * does and does not fix — the window is narrowed to ~55 ms, not closed.
 */
const sourceCorpus = collectWorkingTreeSources(CORPUS_ROOTS, CORPUS_EXTENSIONS);
const sourceFiles = Object.keys(sourceCorpus);

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
 * Every source file that can carry a UI hook, keyed by path so a check can be scoped to the
 * component that actually renders the thing rather than to the whole tree. Scoping is what stops a
 * check passing on a coincidence, which has happened three times in this file.
 *
 * Includes : some nav ids are declared in a plain module rather than a component.
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
 * The files that could legitimately declare a nav item id: whichever component builds the id
 * template, plus the modules it imports by relative path.
 *
 * One hop, not a full closure. A nav list is either inline in the component or in a module beside
 * it, and widening further starts readmitting the coincidences this scoping exists to exclude.
 *
 * @param {Map<string, string>} sources Render sources, keyed by repo-relative path.
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

test('the corpus every check below reads is the whole tree, not a slice of it', () => {
  // Every other check in this file answers against `sourceCorpus`, so a corpus that quietly lost a
  // root or an extension would not fail — it would go VACUOUS, and the orphan check would then
  // report the absence as a stranded pattern in the registry. That is not hypothetical: at
  // `SCANNED_EXTENSIONS` (no `.css`, no `.json`) this corpus is 548 files and the orphan check
  // reds with two false orphans, both `/^styles\/fabricate\.css$/`.
  //
  // The thresholds are deliberately NOT the `> 100` used elsewhere in this repo, which is far too
  // loose to be a pin here: dropping `.svelte` leaves 283 files and dropping `.js` leaves 269, and
  // `> 100` survives both.
  assert.ok(
    sourceFiles.length >= 500,
    `expected the whole ${CORPUS_ROOTS.join('/, ')}/ tree, got ${sourceFiles.length} files`
  );
  // Defence in depth rather than a live guard: 283 non-`.svelte` files mean the `>= 500` above
  // already forces `>= 217` components, so nothing reaches this that did not red first. It stays
  // because it stops being implied the moment either number moves — and it now names its threshold
  // and its roots, like its two neighbours, so a future failure is readable on its own.
  const components = sourceFiles.filter((file) => file.endsWith('.svelte'));
  assert.ok(
    components.length >= 200,
    `expected >= 200 .svelte files under ${CORPUS_ROOTS.join('/, ')}/, got ${components.length}`
  );

  // By KEY, one per root — because a count threshold cannot see a single file go missing, and each
  // of these is a whole root's or a whole extension's worth of coverage standing on one file.
  // `lang/en.json` is the sharpest of the three: dropping `.json` (or the `lang` root) moves the
  // count 550 -> 549, which no threshold can catch, and it is the one omission that leaves a
  // filter clause matching nothing — `file === 'lang/en.json'` in `renderSources` above. The
  // clause still runs; it just stops selecting anything, and no check below asserts on what it
  // selects, so this key is the only thing that would notice.
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

  // `tests/view-lab-chrome-license.test.js` still shells out to `git ls-files`, and must keep
  // doing so. Tracked-ness is that test's SUBJECT, not its input: it proves no harvested
  // proprietary Foundry asset is tracked, which is a question only the index can answer. A tree
  // walk there would find the same harvested files sitting untracked in a working directory and
  // report the repository clean, silently retiring the check. The divergence this file just
  // removed was a bug precisely because tracked-ness was never what it was asking about.
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

test('every interaction step names text that exists in the manager UI', () => {
  // Steps are clicked by accessible name. A renamed rail entry would otherwise click nothing, and
  // the case would capture whichever screen happened to be showing.
  // Includes `src/ui/**/*.js`: the crafting sub-tab ids the selector steps target are declared in
  // `crafting/craftingNav.js`, not in any component file.
  const sources = renderSources();
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
  const haystack = [...renderSources().values()]
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

/**
 * Text for a `-` line: content the checkout does NOT have, which is what every removed line in a
 * `pulls/{n}/files` patch is.
 *
 * Deliberately not a comment and not blank. `isInertSourceLine` skips both, so a removed line
 * shaped like a comment would be dropped before `regionsTouchedAt` ever placed it, and every
 * assertion below would pass against a hunk whose removals were never attributed at all.
 *
 * @param {number} index Which removed line this is.
 * @returns {string} A non-inert source line this repo does not contain.
 */
const removedText = (index) => `      { selector: '.a-line-this-checkout-does-not-have-${index}' },`;

/**
 * A unified diff for an EDIT — a hunk carrying `-` lines — rather than for a pure addition.
 *
 * This is the shape EVERY edited line has in GitHub's `patch` field, and `patchAdding` cannot
 * produce it: the removed text is content the file being rendered no longer holds, surrounded by
 * context that it does. That asymmetry is the whole of the removal path — the anchor sequence must
 * EXCLUDE the removals (they are not in the new file) while the attribution walk must still PLACE
 * them (they are still changed lines), and a removed line must not advance the new-file cursor.
 *
 * The anchor window is identical to `patchAdding([line])`'s — the same seven lines of `source` —
 * so a one-line edit is directly comparable against the equivalent addition.
 *
 * @param {string[]} source The file the patch describes, by line.
 * @param {object} edit The edit to describe.
 * @param {number} edit.line The 1-based line of `source` the hunk is centred on.
 * @param {number} [edit.removed] How many `-` lines to emit immediately before it.
 * @param {boolean} [edit.replaced] True to emit `source[line - 1]` as `+` (a replace run), false to
 *   emit it as context (a deletion-only hunk, which adds nothing at all).
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

  // A malformed header over a body that WOULD anchor. The old fixture (`@@ this is not a hunk
  // header @@\n+x`) stopped discriminating once attribution became content-anchored: `+x` occurs
  // nowhere in the registry, so it widened whether the header was rejected or not, and relaxing
  // `HUNK_HEADER_PATTERN` to `/^@@/` left the suite green. This body is a real seven-line window
  // whose middle line is marked `+`, so the ONLY thing standing between it and a one-frame
  // selection is the header-shape check.
  const [, ...anchorableBody] = registryPatch([idLine]).split('\n');
  const malformedHeader = ['@@ this is not a hunk header @@', ...anchorableBody].join('\n');
  assert.deepEqual(
    selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, registryPatch([idLine]))),
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
 * Zero is filtered out rather than merely unlikely: a patch whose earliest hunk ALREADY starts at
 * line 1 makes that extreme shift a no-op, and `shiftHunkHeaders`' own "this changed nothing"
 * assertion would then fire on a patch that was never perturbable in the first place — a spurious
 * failure that says nothing about the anchoring.
 *
 * @param {string} patch A unified diff.
 * @returns {number[]} Deltas to apply.
 */
function survivableShifts(patch) {
  const starts = [...patch.matchAll(/^@@ -(\d+),/gm)].map(([, start]) => Number(start));
  return [3, 17, 400, 4000, 1 - Math.min(...starts)].filter((delta) => delta !== 0);
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
 * The four per-actor fixture tables the selector keys on, named once for every check below that has
 * to say them out loud. This IS a hand-written mirror of `LAB_ACTOR_FIXTURE_TABLES`' keys — the
 * canary further down is what makes it a guard rather than a second thing to keep in step.
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

/** One `size`-line window index per file, so a five-thousand-line scan happens once, not per query. */
const windowIndexes = new Map();

/**
 * Every window of `size` consecutive lines of a file, mapped to the 1-based lines it starts at.
 *
 * Indexed once per file rather than rescanned per question: the removal fixtures below ask about
 * every candidate case literal, and a fresh scan apiece turns a millisecond test into a minute one.
 *
 * @param {string[]} source The file, by line.
 * @param {number} size Window length in lines; 7 is what one changed line plus git's three lines of
 *   context either side produces.
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
 * Measured from the shipped files rather than invented. The ambiguity the agreement rule refuses is
 * a property of the files this repo actually renders from — a synthetic fixture would prove the
 * rule against a file nobody ships, and would keep passing after the real duplication went away.
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
  const windows = recurringWindows(registrySource, caseIdByLine(), 7);
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

test('no window recurs within one region of either attributed input, so that branch has no fixture', () => {
  // The measurement, recorded rather than replaced by an invented fixture. `regionsTouchedByHunk`
  // ACCEPTS several candidate anchors when they all attribute identically — a window that recurs
  // inside ONE region. NEITHER attributed input contains such a window: not this registry, and not
  // `labActors.js`, whose four fixture tables share the region machinery. So there is nothing real
  // to assert that branch against, and a synthetic file would only prove the test can build one.
  //
  // Both inputs are measured rather than one, because the claim is about the branch and the branch
  // serves both. If this ever fails, that input has grown exactly the fixture the branch is
  // missing: name it here and assert the branch narrows to the single region both occurrences
  // share.
  for (const [where, source, owner] of [
    ['the registry', registrySource, caseIdByLine()],
    [LAB_ACTORS_PATH, labActorsSource, tableNameByLine()],
  ]) {
    const sameRegion = recurringWindows(source, owner, 7).filter(
      (window) => window.ids.every(Boolean) && new Set(window.ids).size === 1
    );
    assert.deepEqual(
      sameRegion.map((window) => `${window.ids[0]} at ${window.starts.join(', ')}`),
      [],
      `a seven-line window now recurs inside a single region of ${where}, which is the fixture ` +
        'the all-candidates-agree branch of `regionsTouchedByHunk` has never had'
    );
  }
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

/**
 * How many times the seven-line window centred on a line occurs in its own file.
 *
 * The removal fixtures below all assert a SINGLE id, so each needs a line whose window anchors
 * uniquely — otherwise the agreement rule widens and the fixture would be measuring the ambiguity
 * rule instead of the removal path, and would pass whatever the removal path did.
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

/**
 * Cases whose id line, and whose LAST content line, both anchor uniquely — so a fixture built at
 * either lands on exactly one place in the file.
 *
 * Derived rather than listed, and drawn at an even stride through the qualifying set rather than
 * from its head, so these cannot quietly become assertions about the registry's first few entries.
 *
 * `FALLBACK_CASE_ID` is excluded: the deletion-only fixture's wrong answer IS the fallback frame,
 * so a fixture built on the fallback case could not tell the right answer from the wrong one.
 *
 * @param {number} howMany How many to return.
 * @returns {{id: string, idLine: number, lastContentLine: number}[]} Qualifying cases.
 */
function uniquelyAnchoredCases(howMany) {
  const qualifying = caseIds
    .filter((id) => id !== FALLBACK_CASE_ID && registrySource.includes(`    id: '${id}',`))
    .map((id) => {
      const lines = caseLiteralLines(id);
      // `.at(-1)` is the `  }),` that closes the literal, so `.at(-2)` is its last content line —
      // the boundary a replace run has to be attributed on the correct side of.
      return { id, idLine: registryLineOf(`    id: '${id}',`), lastContentLine: lines.at(-2) };
    })
    .filter(
      ({ idLine, lastContentLine }) =>
        windowOccurrences(registrySource, idLine) === 1 &&
        windowOccurrences(registrySource, lastContentLine) === 1
    );

  assert.ok(
    qualifying.length >= howMany,
    `only ${qualifying.length} case literals anchor uniquely at both their id line and their last ` +
      'content line, which is too few to build the removal fixtures on'
  );
  const stride = Math.floor(qualifying.length / howMany);
  return Array.from({ length: howMany }, (_, index) => qualifying[index * stride]);
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The REMOVAL path (issue 1049 review).
//
// Every fixture above this point is addition-only, and `patchAdding` cannot emit a `-` line — so
// the shape GitHub's `pulls/{n}/files` `patch` field has for every EDITED line was pinned by
// nothing. Three separate defects survived that gap, each of which is a silent wrong answer rather
// than an over-capture:
//
//   - building the anchor sequence from ALL lines instead of skipping the removals. Removed text is
//     by definition absent from the file that will render, so every modify hunk would anchor
//     nowhere and the whole narrowing would revert to 181 frames without one test going red;
//   - advancing the new-file cursor on a removed line. A removed line occupies no new-file
//     position, so counting it walks the cursor off the end of the case literal and attributes a
//     replace run near a boundary to the NEIGHBOURING case;
//   - attributing only `+` lines. A deletion-only hunk then touches nothing, and "nothing" is not
//     "everything" — it collapses to the single fallback frame, which is a wrong narrowing rather
//     than a safe widening.
// ───────────────────────────────────────────────────────────────────────────────────────────────

test('a one-line EDIT inside a case literal selects the same case its addition does', () => {
  // The commonest diff shape there is, and the one no fixture had: one `-` for the old text, one
  // `+` for the new, three lines of context either side. The anchor window is identical to the
  // equivalent `patchAdding`, so the two must agree — asserted against the addition's own answer
  // rather than against a hard-coded id, so the pair cannot drift apart.
  for (const { id, idLine } of uniquelyAnchoredCases(3)) {
    const patch = patchEditing(registrySource, { line: idLine });
    assert.deepEqual(
      selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)),
      selectedIds([REGISTRY_PATH], registryPatches([idLine])),
      `editing line ${idLine} must select what adding it selects`
    );
    assert.deepEqual(selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)), [id]);

    // And under the merge-commit shift, which is the state this whole section exists for: an edit
    // is no more anchored by its header's numbers than an addition is.
    for (const delta of survivableShifts(patch)) {
      assert.deepEqual(
        selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, shiftHunkHeaders(patch, delta))),
        [id],
        `an edit whose header is shifted by ${delta} lines must still select "${id}" alone`
      );
    }
  }
});

test("a replace run at a case literal's last line is not attributed to its neighbour", () => {
  // N removals followed by one addition, on the LAST content line of a literal — the shape a PR has
  // when it replaces a block of steps with one. A removed line holds no new-file position, so
  // counting it walks the cursor past the `  }),` that closes the case and into the literal that
  // follows: the deeper the run, the further into the neighbour it lands. Eight is enough to clear
  // the close line, the blank between elements and the next factory call.
  for (const { id, lastContentLine } of uniquelyAnchoredCases(3)) {
    for (const removed of [1, 3, 8]) {
      const patch = patchEditing(registrySource, { line: lastContentLine, removed });
      assert.deepEqual(
        selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)),
        [id],
        `a ${removed}-line replace run at line ${lastContentLine} must stay inside "${id}" — ` +
          'a removed line occupies no line of the file that will render'
      );
    }
  }
});

test('a deletion-only hunk inside a case literal selects that case, not the fallback', () => {
  // A hunk with `-` lines and no `+` at all still CHANGES the case it sits in, so it must select
  // that case. Attributing only additions would make it select nothing — and nothing is not the
  // safe answer here, it is the single fallback frame, published under a case the PR never touched.
  // Asserted against `FALLBACK_CASE_ID` explicitly, because that is the wrong answer's shape.
  for (const { id, idLine } of uniquelyAnchoredCases(3)) {
    for (const removed of [1, 3]) {
      const patch = patchEditing(registrySource, { line: idLine, removed, replaced: false });
      assert.deepEqual(
        selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)),
        [id],
        `deleting ${removed} line(s) inside "${id}" must select it, not the fallback frame`
      );
    }
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

test('a labActors EDIT inside a stock table selects the same frames its addition does', () => {
  // The region path has its own copy of nothing — it shares `regionsTouchedByHunk` with the
  // registry — but it is the input a real PR is most likely to EDIT rather than append to, since
  // restocking an actor rewrites a quantity in place. So the removal shape is pinned here too, and
  // against the addition's own answer rather than a hard-coded list.
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
  // makes a probe match nothing — and nothing else notices. `every sourceMatches pattern resolves
  // to at least one source file` does not: the pattern claiming `ItemPageInspector.svelte` is an
  // alternation whose other branches still resolve, so it stays green while the probe goes dead and
  // `manager-system-edit-normal` silently drops out of the knowledge selection.
  //
  // The list is IMPORTED, not restated. A copy here would go on naming the renamed file, so this
  // test and `knowledgeSurfaceCaseIds` below would both stay green against a live probe that had
  // stopped matching anything — the test claiming to check what the predicate probes while
  // checking a second list nothing consults.
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

// ───────────────────────────────────────────────────────────────────────────────────────────────
// An oracle for `ACTOR_KNOWLEDGE_RENDER_FILES` itself (issue 1052).
//
// Every check above trusts the list's CONTENT to derive the expectation it then checks itself
// against, which is tautological for a change to the list: deleting an entry moves both sides of
// an assertion together, so `every knowledge or books-scrolls case is inside the sourceMatches-
// derived set` cannot see the deletion at all. These three checks derive their expectation from
// something the list does NOT control — the live registry's own admission arithmetic, and the
// `kinds` tag vocabulary independently of any render-file probe — so a deleted entry actually
// changes one side without moving the other.
// ───────────────────────────────────────────────────────────────────────────────────────────────

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
 * `sourceMatches`. Follows `UNCLAIMED_BY_DESIGN` in `tests/view-lab-source-coverage.test.js`: a
 * frozen list of path plus reason, gated below in both directions so a stale exemption cannot
 * outlive the thing it exempted.
 *
 * `RecipeItemEditorTabs.svelte` is redundant for a second reason worth recording but not acting
 * on here: it is a pure tab strip taking `activeTab`, `badges` and `onSelect` — it reads no owned
 * copy or learned-recipe data itself, which contradicts this file's own docblock ("the render
 * files that read an actor's owned recipe-item copies or learned recipes"). Fixing that would mean
 * editing `scripts/lib/viewLabCases.js`, which this file does not own.
 */
const REDUNDANT_BY_DESIGN = Object.freeze([
  {
    path: 'src/ui/svelte/apps/manager/BooksScrollsView.svelte',
    reason:
      'every case whose sourceMatches admits it also admits recipe-item/RecipeItemEditorTabs.svelte ' +
      "through that case's own recipe-item/ pattern, so removing this entry alone changes no " +
      'admitted set',
  },
  {
    path: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
    reason:
      'every case whose sourceMatches admits it also admits BooksScrollsView.svelte directly, so ' +
      'removing this entry alone changes no admitted set',
  },
]);

test('every entry in ACTOR_KNOWLEDGE_RENDER_FILES is necessary, or recorded as redundant', () => {
  // For each entry NOT covered by REDUNDANT_BY_DESIGN: removing it from the list must strictly
  // shrink the admitted set. This is the direction a deletion of a NECESSARY entry cannot pass —
  // `KnowledgeView.svelte` and `ItemPageInspector.svelte` both fail it once removed, which is the
  // issue's own defect reproduced as a positive assertion.
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
    // Direction two: a key that has become necessary. If the registry changes so this entry now
    // admits a case nothing else does, the exemption itself would hide exactly the defect Task 1
    // exists to catch.
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
 * `ACTOR_KNOWLEDGE_RENDER_FILES` in their OWN `sourceMatches`, not asserted from outside it. Gated
 * below the same way REDUNDANT_BY_DESIGN is: a member that stops declaring the render file, or
 * that gains a `knowledge`/`books-scrolls` tag and so no longer needs the exemption, fails.
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
  // The selector finds each table by a column-zero `const NAME = ` line whose statement that line
  // OPENS. Either half failing fails SAFE — the parse returns null and the whole corpus is selected
  // — which is correct and invisible: the only symptom would be a job quietly back at twenty
  // minutes. So both have to fail LOUDLY here too.
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
  // still `startsWith` its own declaration. It parses to a span that runs to the NEXT column-zero
  // `};` — so it answers for whatever is declared in between, under the wrong table's key, and
  // that is a wrong NARROWING rather than a safe widening. `parseLabActorTableRegions` refuses it,
  // and this is where the fixture drifting into that shape gets named.
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

// ───────────────────────────────────────────────────────────────────────────────────────────────
// `parseLabActorTableRegions`, driven directly (issue 1049 review).
//
// The tests above reach it only through `mapChangedFilesToCases`, over the file this repo actually
// ships — which is well-formed, so both of its refusals are unreachable from there and were pinned
// by nothing. It is already a pure function of an injected `string[]`, so a synthetic fixture needs
// no file, no path injection and no second copy of the walk: just call it.
// ───────────────────────────────────────────────────────────────────────────────────────────────

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
  // the consequence check passes. Verified by mutation — deleting the opening-line check from
  // `parseLabActorTableRegions` makes this fixture parse, with `BROKEN_STACKS` spanning lines 5-9
  // and answering for every line of `TOOL_DURABILITY`.
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
  // The consequence check, on the shape the direct check above cannot see: a legitimate opener —
  // it ends in `{` — whose close the column-zero search cannot find, because a second call wraps
  // it. `INVENTORIES` then runs to `BROKEN_STACKS`' close and contains it whole.
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
