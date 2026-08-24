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
  LAB_SURFACE_CASES,
  LAB_SURFACE_CASE_IDS,
  VIEW_LAB_CASES,
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
  parsePlayerMountRegions,
  publishableCases,
  WORLD_PARTIES_SEARCH_TERM,
} from '../scripts/lib/viewLabCases.js';

import { MODIFIER_POLICY_OPTION_ATTR } from '../src/ui/svelte/apps/manager/checks/modifierPolicyAttrs.js';
import { CHECK_SECTION_IDS } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import {
  CHECKS_VIEWS,
  buildChecksNavItems,
} from '../src/ui/svelte/apps/manager/checks/checksNav.js';
import { MODIFIER_POLICIES } from '../src/systems/checkModifierResolver.js';

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
const VERBS = ['select', 'fill', 'scroll', 'upload', 'press'];
const PRESS_KEYS = ['Enter', 'Space'];

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

/** Hooks that belong to Foundry's own chrome, which this repository neither ships nor renames. */
const FOUNDRY_CHROME_HOOKS = new Set(['dialog-content']);

/**
 * Hooks the LAB HARNESS renders rather than `src/`, matched by their reserved `lab-` prefix.
 *
 * The lab's companion stand-in is the one renderer in this corpus that is deliberately NOT
 * Core: it stands in for a premium module, so Core does not own its markup and never will.
 * A case that drives that stand-in — pressing its drill-down to reach the runtime route-chrome
 * state, for instance — therefore names hooks no `src/` file can contain.
 *
 * This is a redirection and not an exemption: the token still has to exist, it is just looked
 * for in the file that actually renders it. Renaming the harness's hook without updating the
 * case still fails here rather than twenty minutes into a capture run.
 */
const LAB_HOOK = /^(?:data-)?lab-/;
const labHarnessSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');

/**
 * A selector with every `:not(…)` group removed, brackets balanced.
 *
 * `String#replaceAll` with a regex cannot do this: a `:not(:has([data-x]))` carries nested
 * parentheses, and a non-greedy pattern stops at the first `)`, leaving a dangling tail that
 * then tokenizes.
 *
 * @param {string} selector
 * @returns {string}
 */
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

/**
 * Assert that every stable hook in ONE selector still exists in the UI corpus.
 *
 * Extracted so `expectSelector` is checked by the SAME code as `steps[].selector` (issue 1118
 * review). It was only ever run over steps, and `expectSelector` is the assertion the capture
 * driver runs BEFORE it photographs: a dead one fails the job WHOLE and publishes nothing,
 * while `npm test` stays green and `check-screenshots` passes on stale frames. A second copy of
 * the extraction would drift, so there is one.
 *
 * `continue` in the original loop becomes `return`: each branch that recognises a selector
 * SHAPE has finished with it.
 */
function collectSelectorHookFailures(viewCase, selector, sources, haystack, missing) {
  const editorTab = /^#([a-z-]+)-tab-([a-z-]+)$/.exec(selector);
  if (editorTab) {
    const [, family, tabId] = editorTab;
    const builders = [...sources].filter(([, text]) => text.includes(`${family}-tab-\${`));
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
  // The Checks section STRIP builds `checks-section-${section.id}` (issue 1096), so the
  // literal never appears in source either — and unlike a rail subitem the ids do not
  // live in a component at all: they are `CHECK_SECTION_IDS`, declared beside the issue
  // registry that buckets into them. Checking membership of the imported constant is
  // stronger than a source scan, because a section renamed in one place and not the
  // other cannot satisfy it.
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
  const navId = /^#manager-(crafting|gathering|checks)-nav-(.+)$/.exec(selector);
  if (navId) {
    const [, group, id] = navId;
    // The scope is the builder PLUS what it imports: the gathering items are declared inline in
    // the root, but the crafting ones live in `crafting/craftingNav.js`, which the root pulls
    // in. Builder-only would reject every crafting nav id; whole-tree would accept anything.
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
  // Everything else is a compound of stable hooks: literal element ids, class names, and
  // `data-*` attribute names. EVERY hook in the selector is checked, not just the first —
  // a compound whose leading class survives a rename of its trailing attribute would
  // otherwise match a broader element and capture the wrong row. Attribute VALUES are not
  // hooks: they are fixture ids, which live in `tests/view-lab/world/`, not in `src/`.
  // Values are stripped BEFORE extraction, not filtered afterwards: a quoted uuid such as
  // `[data-essence-carrier="Item.sm-coal"]` otherwise reads `.sm-coal` as a class name and
  // fails against a tree that was never supposed to contain it.
  // `:not(…)` asserts ABSENCE, so requiring its hooks to exist is backwards: the one case
  // that pins "this editor renders no modifier surface at all" would be failed by the very
  // deletion it exists to photograph. Stripped BEFORE values, so a value inside a `:not`
  // cannot survive its removal.
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
    // Foundry's own chrome is not in this corpus and never will be: a selector that reaches
    // into a core dialog is pinning core markup, which this repository does not own and
    // cannot rename. Named individually rather than pattern-matched, so adding one is a
    // deliberate act.
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
      collectSelectorHookFailures(viewCase, step.selector, sources, haystack, missing);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `these steps reference UI that no longer exists:\n  ${missing.join('\n  ')}`
  );
});

test('every expectSelector names UI that still exists', () => {
  // The step sweep above never looked at `expectSelector`, so a hook named only there — which
  // is the normal shape for a case whose whole job is to assert a state — was guarded by
  // nothing. `data-system-modifier-roll-note` was exactly that: mutated to nonsense, every
  // guard passed and only a 20-minute capture run would have found it.
  const sources = renderSources();
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

/**
 * Every SELECTOR-BEARING field on a case, so a scan cannot silently miss one.
 *
 * `steps[].selector` is the obvious one and the only one the token check above looks at.
 * `expectSelector` is not gated by that check AT ALL — it is the assertion the capture
 * driver runs before it photographs, and a dead one fails the job WHOLE, publishing
 * nothing while `check-screenshots` stays green on stale frames.
 */
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
  return selectors;
}

const RESPONSIVE_LAYOUT_CASE_IDS = [
  'player-inventory-bulk-mixed-narrow',
  'player-gathering-stacked',
  'player-crafting-stacked',
  'player-alchemy-stacked',
  'player-journal-stacked',
];
const LAYOUT_ASSERTION_PATH = 'scripts/lib/viewLabLayoutAssertion.js';

test('exactly the five 1024px player responsive cases declare complete layout expectations', () => {
  const declared = VIEW_LAB_CASES.filter((viewCase) => viewCase.expectLayout);
  assert.deepEqual(
    declared.map((viewCase) => viewCase.id),
    RESPONSIVE_LAYOUT_CASE_IDS
  );
  for (const viewCase of declared) {
    assert.deepEqual(viewCase.position, { width: 1024, height: 860 });
    assert.equal(typeof viewCase.expectLayout.containerSelector, 'string');
    assert.equal(typeof viewCase.expectLayout.gridSelector, 'string');
    assert.equal(viewCase.expectLayout.maxContentBoxInlineSize, 960);
  }
});

test('layout expectation selectors name UI that still exists', () => {
  const sources = renderSources();
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
  assert.deepEqual(selectedIds([LAYOUT_ASSERTION_PATH]), RESPONSIVE_LAYOUT_CASE_IDS);
});

test('the capture runner threads and asserts declared layouts before taking a screenshot', () => {
  const driver = readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8');
  assert.match(driver, /expectLayout: viewCase\.expectLayout \?\? null/);
  const assertion = driver.indexOf('await assertViewLabLayout(page, expectLayout, label)');
  const screenshot = driver.indexOf('frame.screenshot(', assertion);
  assert.ok(assertion >= 0, 'the runner must invoke the generic layout assertion');
  assert.ok(screenshot > assertion, 'the layout assertion must run before frame.screenshot()');
});

test('every combination-rule value the registry targets is a real MODIFIER_POLICIES member', () => {
  // Nine selectors in this registry pin a rule option by its VALUE, and NOTHING else could
  // see them go stale. The token check above strips attribute values before extracting
  // hooks ("Attribute VALUES are not hooks"), so a renamed value passes it; `expectSelector`
  // is not scanned by it at all. Issue 1095 renamed exactly such a value — `byRecipe` to
  // `bySubject` — and the failure mode is total: the capture job fails whole and publishes
  // NOTHING.
  //
  // THE ATTRIBUTE NAME IS IMPORTED, NOT RESTATED — the rule this file already states at the
  // knowledge-probe check below ("The list is IMPORTED, not restated"). A restated literal
  // would go on naming the old attribute after a rename, this scan would extract ZERO
  // values, `[] ⊆ MODIFIER_POLICIES` would hold vacuously, and the guard would pass over
  // seven dead selectors. The literal cannot be imported out of Svelte MARKUP — it is a
  // prop value, the component exports nothing, and this file compiles no Svelte — so it is
  // hoisted into `modifierPolicyAttrs.js`, which the component consumes and this test
  // imports. `MODIFIER_POLICIES` is imported for the same reason.
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

  // NON-EMPTY, and of the EXPECTED CARDINALITY. Either half alone goes vacuous: an empty
  // set satisfies the membership assertion, and a non-empty one satisfies it while eight of
  // the nine selectors have quietly lost the attribute.
  //
  // NINE since issue 1095's review: the two SUBJECT-PICKER cases each click the rule card
  // before routing to their editor, because the picker renders under `bySubject` alone and
  // both lab systems author a non-selecting rule.
  assert.equal(
    found.length,
    9,
    `expected 9 combination-rule selectors in the registry, found ${found.length} — ` +
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
  // The property that keeps the check above honest, asserted rather than assumed. The
  // pre-1095 registry carried one of its seven rule selectors in `expectSelector`
  // (`manager-checks-crafting-modifiers`), which the existing token check never looks at —
  // so a scan restricted to `steps[]` would have graded six of seven and called it a pass.
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
  assert.deepEqual(
    declaredArray('PRESS_KEYS'),
    [...PRESS_KEYS].sort(),
    'the driver accepts a different press-key vocabulary than this file admits'
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

test('the no-selection World Parties case clears selection through the real Manager store', () => {
  const noSelection = getCaseById('manager-world-parties-no-selection');
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');

  assert.equal(noSelection.query?.clearSystem, '1');
  assert.deepEqual(noSelection.smokeLabels, []);
  assert.match(mountSource, /clearSystem: params\.get\('clearSystem'\) === '1'/);
  assert.match(mountSource, /clearSystem: params\.clearSystem/);
  assert.match(mountSource, /if \(params\.clearSystem\) await props\.store\.selectSystem\(''\)/);
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

  // The seeded party list, read out of the fixture rather than restated here — with the
  // three fields legality depends on RESOLVED against those actors, not merely matched.
  // Every claim below is derived from it, so a rename or an extra party fails by name
  // instead of quietly changing what a published frame shows.
  const seedStart = worldSource.indexOf("put(\n    'gatheringParties',");
  assert.ok(seedStart > 0, 'the gatheringParties seed must remain locatable');
  const seedEnd = worldSource.indexOf("put('lastCraftingActor'", seedStart);
  const seed = worldSource.slice(seedStart, seedEnd);

  // Field reads are anchored to the START of a line, so a field NAMED in one of the seed's
  // comments cannot be read as a value.
  const fieldIn = (block, name) => new RegExp(`^\\s*${name}: (.+?),\\s*$`, 'm').exec(block)?.[1];

  // `characterActors`, optionally `.slice(a[, b])`, mapped to uuids.
  // ANCHORED at both ends, and the `.map(...)` is required rather than optional: an
  // unanchored prefix match discards the tail, so `characterActors.map((actor) => actor.id)`
  // — bare ids, the exact defect `labWorld.js:90-94` records as having shipped once and
  // rendered "Disabled · 0 members" — would resolve to uuids and pass, and
  // `characterActors.map(…).concat([uuidOf('lab-actor-wagon')])` would silently drop the
  // wagon from the uniqueness walk. Anything unmodelled returns null and fails loud below.
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

  // Legality under `GatheringPartyStore._validateList`, which the lab does NOT run: it writes
  // the settings map raw and validation lives in `_persist`, so an impossible world would
  // render and publish. The two invariants are computed, not approximated by matching the
  // shapes today's seed happens to use: a shape check passes any NEW illegal shape it did not
  // anticipate — giving `lab-party-long-haul` a member drawn from `characterActors` satisfies
  // every such check while putting Brenna in two enabled parties at once.
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

  // The search term matches exactly two of the five, and it matches them by DIFFERENT routes:
  // one on its own name, one on its travel actor's name. Anything else renamed into range
  // fails here rather than over-matching silently in a frame nobody can count.
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
  assert.deepEqual(filtered.steps.at(-1), {
    selector: '.manager-travel-parties-query',
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
  // The pager itself is gated on the smallest offered size, so a seed below it would
  // photograph a pane with no footer at all — and the last-page case would have no
  // control to reach page two with.
  //
  // The RULE is asserted, not a second literal: the source derives the threshold from the
  // page-size list, so this pins that derivation. Restating `=== 3` here would let the two
  // drift apart with only the `[3, 6, 9]` regex above noticing.
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

  // The empty state reaches its world through the seeded setting, not a post-construction call.
  const mountSource = readFileSync(resolve(ROOT, 'tests/view-lab/mount.js'), 'utf8');
  const empty = getCaseById('manager-world-parties-empty');
  assert.equal(empty.query?.noParties, '1');
  assert.deepEqual(empty.smokeLabels, []);
  assert.match(mountSource, /noParties: params\.get\('noParties'\) === '1'/);
  assert.match(mountSource, /noParties: params\.noParties/);
  assert.match(worldSource, /noParties\s*\n?\s*\? \[\]/);
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
      'manager-world-downtime-premium-installed',
      // The companion driving Core's own route header. It is the only frame in the corpus
      // that can photograph the runtime route-chrome channel: every other Downtime case rests
      // on a list screen, which renders identically whether or not that channel exists.
      'manager-world-downtime-companion-chrome',
      // Issue 1302 — the parent rollup, appended after the four tab cases (never inserted
      // among them): the manifest above is order-sensitive and `cases.slice(0, 4)` below is
      // index-based, so a new case has to land after both without disturbing either.
      'manager-world-downtime-rollup',
    ]
  );
  // The Core-preview frames and the premium-installed frame prove DIFFERENT things and cannot
  // share one assertion loop: Core's `Unlock with Premium` CTA and its scrolling preview pane
  // are Core's own content, and the spec says neither is rendered over a companion's screens
  // — so requiring the CTA of every downtime case would pin exactly the defect it forbids.
  // All THREE provider-mode frames are excluded from the Core-preview loop, and for the one
  // reason: over a companion's screens Core renders no preview pane and no CTA at all, so
  // every assertion below is about markup the spec forbids there. The rollup case joins the
  // premium-installed and companion-chrome frames for the same reason — it is reached on
  // `expectView: 'systems'`, not `'world-downtime'`, and asserts a DOM-removal claim the
  // Core-preview loop below has no vocabulary for.
  const premium = allCases.find((entry) => entry.id.endsWith('-premium-installed'));
  const companionChrome = allCases.find((entry) => entry.id.endsWith('-companion-chrome'));
  const rollup = allCases.find((entry) => entry.id.endsWith('-rollup'));
  assert.ok(Boolean(companionChrome), 'the runtime route-chrome frame is still registered');
  assert.ok(Boolean(rollup), 'the parent rollup frame is still registered');
  const cases = allCases.filter(
    (entry) => entry !== premium && entry !== companionChrome && entry !== rollup
  );
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
  /*
    `expectOverflowY` above is what every downtime case owes: the PANEL owns the vertical
    overflow, not the shell around it. `expectScrollable` is a stronger and different claim —
    that the pane's content actually exceeds its box at that case's window size — and it is
    honest of exactly one of these frames.

    It used to be required of all six, and the preview satisfied it by carrying a 720px
    `min-height` that no content asked for. That floor is what the maintainer saw as a screenful
    of empty surface below the feature cards on an ordinary window, so it is gone; at 1330x900
    the preview simply fits. The narrow frame is the one whose window genuinely cannot hold it —
    960px folds the feature grid to 2x2 and stacks the hero — so the real scrolling proof lives
    there, and pinning it here stops a future change quietly removing the scroller altogether.
  */
  const scrolls = cases.filter((entry) => entry.expectScrollable);
  assert.deepEqual(
    scrolls.map((entry) => entry.id),
    ['manager-world-downtime-narrow'],
    'the narrow frame is the one whose window really overflows, and it proves the pane scrolls'
  );
  assert.equal(getCaseById('manager-world-downtime-narrow').expectScrollable, '.downtime-preview-scroll');
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

  // Issue 1185 — the premium-installed frame. Every other manager case renders the free
  // module, so this is the only frame that can photograph the title bar's gold badge, the
  // muted rail chip and the installed-state rail tooltip. Its assertions are pinned here
  // because the values are hand-copied from `lang/en.json` and rot silently otherwise.
  assert.equal(premium.expectView, 'world-downtime');
  assert.equal(premium.query.downtimeProvider, '1', 'the premium frame registers a companion');
  // Issue 1213 — the rail lock. The frame has to REACH the locked state or it proves nothing:
  // the lab world seeds an expanded rail and cases cannot override a lab setting, so a run that
  // never presses the toggle is pixel-identical with and without the lock. The press must also
  // come BEFORE the route, because on the route the control is disabled and Playwright would
  // refuse to press it.
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
  // WHERE THE TAB FIELDS LAND, read back out of the lab provider that supplies them, because
  // this frame is the only place the two are rendered side by side. `accessibleName` names the
  // rail BUTTON, and the region is named by that button's LABEL element — different values on
  // purpose, because a landmark announced as "Open the downtime ledger, region" is the wrong
  // shape. Hand-copying either into this file would be the mirror the expectation exists to
  // catch, so both come from the fixture's own source.
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

  // Issue 1302 — the parent rollup, on a closed disclosure with zero interaction (AC-19). This
  // is the persona state a fresh Manager open actually lands on: `railGroupUserExpanded.worldDowntime`
  // seeds `false` and nothing locks the group open off the Downtime route, so no GM ever sees the
  // rollup's counterpart today without navigating away from the one place the badge would matter.
  assert.equal(rollup.expectView, 'systems', 'reached with no interaction, on the systems browser');
  assert.equal(rollup.query?.downtimeProvider, '1', 'a provider is registered so the rollup can render');
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

test('the broad SearchablePopover signal captures BOTH of its deliberate picker states', () => {
  const selected = mapChangedFilesToCases([
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  ]).map((viewCase) => viewCase.id);

  // Two overrides, not one, because the primitive has two modes and neither frame shows
  // the other's chrome. `inlineSearchTrigger` (the actor picker) replaces its trigger with
  // the search field and renders NO in-popover search row at all, so the compact search
  // field, its leading glyph and its position below the title/count header are invisible
  // in that frame; the realm-override picker keeps its value-bearing trigger and is the
  // only surface that renders them.
  assert.deepEqual(
    selected.sort((a, b) => a.localeCompare(b)),
    [
      'fabricate-app-shell',
      'manager-components-normal',
      'manager-world-parties-actor-picker',
      'manager-world-parties-realm-override-picker',
    ]
  );
});

// The NEW `.js` modules this change adds under the checks tree, and the frames a change
// confined to each of them must still select (issue 1095, C2).
//
// STATED AS A POSITIVE PIN, not as a `FALLBACK_CASE_ID` probe. The premise that a `.js`
// module reaches the fallback is FALSE here: nine cases already claim the directory prefix
// `/^src\/ui\/svelte\/apps\/manager\/checks\//`, and `UI_PATH_PATTERN` admits any
// `src/ui/**/*.js` as a render file — so a change confined to a new module under that
// directory selects those cases and can NEVER reach the fallback. "Proven to fail before
// the entry exists" would therefore be vacuous, and "selects exactly those ids" would be
// false in the other direction.
//
// What CAN fail, and is what matters, is the direction below: each module selects a
// non-empty set that INCLUDES the frames it determines, and never the fallback.
const NEW_CHECKS_MODULES = [
  [
    'src/ui/svelte/apps/manager/checks/modifierPolicyAttrs.js',
    ['manager-checks-crafting-modifiers', 'manager-checks-crafting-modifier-max-picks'],
  ],
  [
    'src/ui/svelte/apps/manager/checks/checksReadiness.js',
    ['manager-checks-crafting-modifiers', 'manager-checks-validation'],
  ],
  // The Checks rail GROUP model (issue 1096). It determines the entire rail and the four
  // route ids, so a change confined to it must select the frames that show them.
  //
  // Stated as the same POSITIVE pin its two siblings are, and for the reason recorded
  // above rather than a new one: the `/^src\/ui\/svelte\/apps\/manager\/checks\//`
  // directory prefix nine cases already claim admits any `.js` under that directory, so a
  // change confined to this module can never reach `FALLBACK_CASE_ID` and a
  // "proven to fail before the entry exists" clause would be vacuous here too.
  [
    'src/ui/svelte/apps/manager/checks/checksNav.js',
    ['manager-checks-rail-group', 'manager-checks-rail-dirty'],
  ],
  // The outcome simulator and the odds enumerator (issue 1097). BH4 asked for these two to
  // select "exactly" their own cases and never the fallback; they are stated as the same
  // POSITIVE pin their three siblings are, for the reason recorded above and now proven
  // twice — the directory prefix nine cases already claim admits ANY `.js` under
  // `apps/manager/checks/`, so "exactly these ids" is false for every module in this
  // directory and "never the fallback" is unreachable rather than guarded. What is real,
  // and what these entries hold, is that each module selects the frames it DETERMINES.
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
const LAB_MOUNT_PATH = 'tests/view-lab/mount.js';
// The Manager application, read for ONE claim: that the stores the lab's settle pass waits on
// are names its service bag does not declare, which is what makes that pass player-only.
const MANAGER_APP_PATH = 'src/ui/SvelteCraftingSystemManagerApp.svelte.js';
const RUNNER_PATH = 'scripts/view-lab-screenshots.mjs';
const sourceOf = (path) => readFileSync(resolve(ROOT, path), 'utf8').split('\n');
const registrySource = sourceOf(REGISTRY_PATH);
const labActorsSource = sourceOf(LAB_ACTORS_PATH);
const labMountSource = sourceOf(LAB_MOUNT_PATH);

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
const removedText = (index) =>
  `      { selector: '.a-line-this-checkout-does-not-have-${index}' },`;

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

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Surface coverage.
//
// The set an unattributable change resolves to, and the reason the answer is no longer "all 243".
// What these guard is the pair of properties that make the narrowing safe rather than merely
// cheap: EVERY screen is still photographed (so no lab-input change can leave a window, a route or
// a tab unproven), and each screen is photographed by a frame that actually shows it (not its
// 680px variant, not a modal covering it).
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The coverage set as `selectedIds` returns it: registry order, so a `deepEqual` against it pins
 * MEMBERSHIP and not merely a count.
 *
 * A count was enough while the widened answer was the whole corpus — there is exactly one
 * 246-element subset of a 246-element set, so `length === 246` implied membership. Coverage is a
 * proper subset, so the same assertion now passes for any 34 cases at all, including 34 wrong
 * ones. Every widening assertion below therefore compares ids.
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
  // without one. The second half is the one that matters — a screen missing from coverage is a
  // screen a fixture change can break with nothing red, and it would arrive silently the day
  // someone adds a route.
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
  // surface and coverage narrows nothing. Asserting that the key CONSOLIDATES is what makes the
  // pair non-circular; it is the one property the partition cannot see.
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
  // rather than listed. `query.colorScheme` is the axis with the least margin for error: exactly
  // two cases declare it, both `coverage-theme-light-*`, and they are the only frames the lab
  // renders under Foundry's light chrome. Drop the theme term from `labSurfaceKey` and they fold
  // into their dark twins and leave coverage — which every OTHER assertion in this file survives.
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
  // Unreachable from the registry today — every manager case declares `expectView` and every
  // player case a `query.tab`, both separately gated above — so the fallback is asserted against
  // synthetic cases rather than left to a future one to discover. Its whole job is to fail SAFE:
  // an unclassifiable case must become its OWN surface and always be captured, never collapse
  // into a shared `app|undefined` bucket and be represented by a frame of a different screen.
  const app = VIEW_LAB_CASES[0].app;
  const first = labSurfaceKey({ app, id: 'lab-surface-probe-one' });
  const second = labSurfaceKey({ app, id: 'lab-surface-probe-two' });

  assert.notEqual(first, second, 'two unclassifiable cases must not share one surface');
  assert.match(first, /lab-surface-probe-one/, 'the fallback keys on the case id');
  // And it does not silently key on `undefined`, which is the shape the collapse would take.
  assert.doesNotMatch(first, /undefined/);
});

test('a surface is represented by a frame that shows it, not by a variant of it', () => {
  // The app default geometry, derived here rather than imported: the modal position across an
  // app's own cases. An independent derivation is the point — importing the constant the chooser
  // uses would make this a restatement of the implementation instead of a check on it.
  const modalPosition = (app) => {
    const counts = new Map();
    for (const viewCase of publishableCases()) {
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
    // TIE on the two above, the representative is the least-driven. Restricting to the tied pool
    // is what makes this checkable — comparing against the whole group would fail wherever a
    // stacked variant has fewer steps than the default-geometry frame that correctly beats it.
    //
    // Unpinned, reversing this comparison swaps a resting screen for an elaborately-configured one
    // across most of the coverage set with nothing else in the suite going red.
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
  // review. Three code paths widened by REPLACING an accumulated selection rather than adding to
  // it — each safe only while the widened answer was the whole corpus, which contained whatever it
  // discarded. Coverage contains no detailed state, so each one silently dropped the frame of the
  // very case the patch edited: a capture showing everything except the change.
  //
  // Both fixtures below are ordinary registry PRs, not corner cases. The first is "edit a case and
  // touch the shared factory above it"; the second is "edit a case and also touch the fixture
  // world". Each is asserted as coverage PLUS the edited case, so a regression to replacement reds
  // on the missing id rather than on a count.
  // A case deliberately NOT in coverage — the recipe editor's Tools tab folds into the
  // `recipe-edit` route, whose representative is `manager-recipe-edit-normal`. If it were a
  // coverage member the union would be indistinguishable from replacement and this would pass
  // against the defect.
  const INSIDE_A_CASE_LITERAL = 'manager-recipe-edit-tools';
  assert.ok(
    !LAB_SURFACE_CASE_IDS.includes(INSIDE_A_CASE_LITERAL),
    'the fixture case must be outside coverage, or this test cannot see the difference'
  );

  const inside = registryLineOf(`    id: '${INSIDE_A_CASE_LITERAL}',`);
  const outside = registryLineOf('function managerCase(entry) {');
  const expected = [...new Set([...LAB_SURFACE_CASE_IDS, INSIDE_A_CASE_LITERAL])];
  const inRegistryOrder = (ids) => caseIds.filter((id) => ids.includes(id));

  // Two hunks of ONE patch: one attributable, one not. (`touchedRegionKeys`.)
  assert.deepEqual(
    selectedIds([REGISTRY_PATH], registryPatches([inside, outside])),
    inRegistryOrder(expected),
    'a patch that is part attributable must keep the part it attributed'
  );

  // Two lab inputs in one change: one attributable, one not. (`selectAllLabInputCases`.)
  for (const order of [
    [REGISTRY_PATH, 'tests/view-lab/world/labContent.js'],
    ['tests/view-lab/world/labContent.js', REGISTRY_PATH],
  ]) {
    assert.deepEqual(
      selectedIds(order, registryPatches([inside])),
      inRegistryOrder(expected),
      `an unattributable input must not discard an attributed one (${order.join(' + ')})`
    );
  }

  // The control: the attributable half ALONE still narrows to one frame, so the assertions above
  // are about the union rather than about a narrowing that quietly stopped working.
  assert.deepEqual(selectedIds([REGISTRY_PATH], registryPatches([inside])), [
    INSIDE_A_CASE_LITERAL,
  ]);
});

test('a region-attributed input widens by union too, and so does a straddling hunk', () => {
  // The two widening call sites the union test above does not reach. `casesFromRegionPatch` is
  // structurally distinct — it maps region keys through `selectsRegion` BEFORE widening — and
  // `regionsTouchedAt` is the innermost level of all, where one hunk's changed lines fall partly
  // inside a region and partly outside it. Both dropped the attributed half before review.
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

  // ONE hunk that STRADDLES a boundary: two adjacent changed lines, the first the closing line of
  // a case literal and the second the array's spread of `journalBlindRunCases()` — which is a call
  // to shared code and therefore inside no region at all. `patchAdding` merges adjacent lines into
  // a single run, so this really is one hunk with one anchor, which is the level `regionsTouchedAt`
  // owns. The pair is picked from the registry's own text rather than invented: the spread is the
  // only non-inert line between two case literals.
  const spread = registryLineOf('  ...journalBlindRunCases(),');
  assert.equal(registrySource[spread - 2], '  }),', 'the line above the spread must close a case');
  const closedCase = caseIdByLine().get(spread - 1);
  assert.ok(closedCase, 'the line above the spread must be inside a parsed case region');

  const straddling = selectedIds([REGISTRY_PATH], registryPatches([spread - 1, spread]));
  assert.ok(
    straddling.includes(closedCase),
    `a hunk straddling a case boundary dropped "${closedCase}", the half it could attribute`
  );
  for (const id of LAB_SURFACE_CASE_IDS) {
    assert.ok(straddling.includes(id), `the straddling hunk dropped coverage frame "${id}"`);
  }
});

test('the registry counts quoted in prose match the registry', () => {
  // These four numbers are hand-copied registry facts, and they have drifted three separate times:
  // this change found `AGENTS.md` claiming 155 cases, `CONTRIBUTING.md` claiming 181, and
  // `scripts/README.md` claiming 219 with a `reaches` split to match — three different wrong
  // answers, none of which anything failed on. A contributor reads these to decide whether a
  // capture is worth waiting for, so a stale one is not cosmetic.
  //
  // Matched by REGEX against the prose rather than by templating the docs, because the docs are
  // written for humans and must stay readable; the regex is deliberately narrow enough that a
  // rewrite of the surrounding sentence fails loudly here rather than silently skipping.
  const reaches = (value) =>
    publishableCases().filter((viewCase) => viewCase.reaches === value).length;
  const total = publishableCases().length;
  const coverage = LAB_SURFACE_CASE_IDS.length;

  for (const [file, pattern, expected] of [
    [
      'CONTRIBUTING.md',
      /the registry holds (\d+) cases: (\d+) `exact`, (\d+) `window`, (\d+) `beyond`/,
      [total, reaches('exact'), reaches('window'), reaches('beyond')],
    ],
    ['CONTRIBUTING.md', /which is (\d+) of the (\d+) publishable cases/, [coverage, total]],
    [
      'scripts/README.md',
      /There are (\d+) `exact` cases, (\d+) `window`, and (\d+) `beyond`, out of (\d+) total/,
      [reaches('exact'), reaches('window'), reaches('beyond'), total],
    ],
    ['AGENTS.md', /the normal case, at (\d+) cases across both windows/, [total]],
    ['AGENTS.md', /one frame of every route and tab the lab renders, (\d+) cases/, [coverage]],
    [
      '.agents/skills/fabricate-orchestrator/SKILL.md',
      /one frame of every route and tab the lab renders, (\d+) of (\d+) cases/,
      [coverage, total],
    ],
  ]) {
    const found = readFileSync(resolve(ROOT, file), 'utf8').match(pattern);
    assert.ok(found, `${file} no longer contains the sentence this guards: ${pattern}`);
    assert.deepEqual(
      found.slice(1).map(Number),
      expected,
      `${file} quotes stale registry counts in "${found[0]}"`
    );
  }
});

test('a lab-input-only change selects frames while leaving the evidence gate unarmed', () => {
  // The two answers are deliberately different, and the asymmetry looks like a bug in isolation —
  // which is why it is pinned. `hasUiChanges` decides whether `check-screenshots` ARMS, and a
  // fixture-only PR changes no render file, so it must not demand evidence of its author. The
  // selector still answers with coverage, because `pr-screenshots.yml` renders those frames to
  // verify the lab survived the change even though it publishes nothing for a gate that is not
  // armed. "Fixing" `hasUiChanges` to include lab inputs would force screenshot evidence onto
  // every fixture-only PR, and nothing else in this suite would notice.
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
  // of sampled paths: no ONE file — no component, no stylesheet, no lab input — can demand a capture
  // of every state of every screen.
  //
  // The ceiling is DERIVED, not a ratio. One window's worth of cases is the widest selection a
  // single file legitimately makes today: `labRunStates.js` produces every actor run container and
  // the blind-run setting, which only the player window reads, so it selects all of that window's
  // cases and is separately pinned as doing exactly that. Anything above one window means a pattern
  // widened past the window it belongs to — the failure this guards. A ratio of the corpus would
  // instead drift: the margin shrinks as the player corpus grows relative to the whole, so a
  // healthy registry would eventually red it for no defect at all.
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

test('a registry change with no usable patch selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

  // No patch at all — including the one-argument call every other caller makes.
  assert.deepEqual(
    mapChangedFilesToCases([REGISTRY_PATH]).map((viewCase) => viewCase.id),
    coverageIds()
  );
  assert.deepEqual(selectedIds([REGISTRY_PATH], {}), coverageIds());
  assert.deepEqual(selectedIds([REGISTRY_PATH], { patches: {} }), coverageIds());

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
    assert.deepEqual(
      selectedIds([REGISTRY_PATH], { patches: { [REGISTRY_PATH]: patch } }),
      coverageIds(),
      `${why} must select one frame of every surface`
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

test('a registry change OUTSIDE a case literal selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

  // A shared helper, a pattern constant, the array's own spread of a case factory, and the mapping
  // function itself. Each can move any frame, and none is inside a case literal — so none can be
  // attributed to a case, and each answers with one frame of every surface.
  for (const line of [
    'function managerCase(entry) {',
    "  'RadioCardGroup',",
    '  ...journalBlindRunCases(),',
    'export function mapChangedFilesToCases(files = [], { patches } = {}) {',
  ]) {
    assert.deepEqual(
      selectedIds([REGISTRY_PATH], registryPatches([registryLineOf(line)])),
      coverageIds(),
      `a change to \`${line.trim()}\` must select one frame of every surface`
    );
  }
});

test('a comment-only registry change selects one frame — not 157, and not none', () => {
  // A comment cannot change a pixel, so widening to a twenty-minute capture for a typo fix is the
  // cost this narrowing exists to remove. It still yields the fallback frame rather than nothing,
  // so no changed set silently produces no evidence.
  const commentLine = registryLineOf(
    "    // Reached the way the smoke reaches it: by CLICKING the system row's identity, which is what"
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

/**
 * The marked region each `mount.js` line sits in, derived the way the selector derives it — by
 * calling the selector's own parser rather than re-walking the markers here.
 *
 * @returns {Map<number, string>} Line number -> region key, for lines inside a marked region.
 */
function mountRegionNameByLine() {
  const regions = parsePlayerMountRegions(labMountSource);
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

test('a hunk whose content recurs in two different cases selects THOSE cases, not the corpus', () => {
  const everything = publishableCases().length;
  const windows = recurringWindows(registrySource, caseIdByLine(), 7);
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
  // different case. The honest answer is the UNION of the places it could be (issue 1127). That set
  // always CONTAINS the true one, because the anchor sequence is content the rendered file holds at
  // every candidate, so the edit landed at one of them.
  for (const window of crossCase.slice(0, 3)) {
    const line = window.starts[0] + 3;
    const expected = [...new Set(window.ids)];
    const selected = selectedIds([REGISTRY_PATH], registryPatches([line]));
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
  // The shape that made this worth fixing. PR #1125 added four identical lines to three sibling
  // case literals; each hunk anchored at more than one of them, the candidates disagreed, and the
  // capture widened to 209 frames and 28 minutes for want of three.
  //
  // Built from the registry's own duplication rather than invented: one window that recurs across
  // several case literals, patched at its middle line in EVERY case it occurs in — which is what
  // "the same edit, applied to each sibling" produces.
  const window = recurringWindows(registrySource, caseIdByLine(), 7)
    .filter((entry) => entry.ids.every(Boolean) && new Set(entry.ids).size > 2)
    .at(0);
  assert.ok(
    window,
    'no seven-line window recurs across three or more case literals, so this registry can no ' +
      'longer produce the multi-sibling edit issue 1125 hit'
  );

  const siblings = [...new Set(window.ids)];
  const selected = selectedIds(
    [REGISTRY_PATH],
    registryPatches(window.starts.map((start) => start + 3))
  );
  assert.deepEqual(
    [...selected].sort(),
    [...siblings].sort(),
    `editing the same line in ${siblings.length} sibling cases must select exactly those ${siblings.length}`
  );
});

test('no recurring window mixes inside-a-region with outside-every-region, so no real diff needs that path', () => {
  // The measurement, kept for what it still measures, with its original justification retired. It
  // used to guard an UNFIXTURED BRANCH: a multi-candidate hunk with one candidate outside every
  // region short-circuited and threw away the regions its other candidates had landed in, and no
  // real input could produce that shape to assert against.
  //
  // There is no such branch now. A widening candidate contributes surface coverage and its
  // siblings contribute their regions, and the answer is both (`regionsTouchedByHunk`), so the
  // shape is defined rather than unfixtured — and `widening unions with what was already
  // attributed` asserts the same rule at the levels a real diff CAN reach.
  //
  // What the measurement is still worth: none of the three region-attributed inputs contains a
  // window that recurs both inside a region and outside every region, so no real diff exercises
  // candidate-level widening at all. If this ever fails, that input has grown one — which is not a
  // defect, just a shape worth an explicit assertion: its answer is that hunk's regions UNIONED
  // with surface coverage.
  for (const [where, source, owner] of [
    ['the registry', registrySource, caseIdByLine()],
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
    assert.deepEqual(
      selectedIds([REGISTRY_PATH], patchesFor(REGISTRY_PATH, patch)),
      coverageIds(),
      `${why} — that must select one frame of every surface`
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
// cases render actor-owned data at all — and NOT per actor. Only three cases in the whole registry
// name an actor id; every player frame draws the whole roster through `ComponentSourcesBar` and computes its
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
  assert.ok(
    expected.length > playerCaseIds().length,
    'the knowledge tables added no manager frame'
  );
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

test('a labActors change outside its fixture tables selects surface coverage', () => {
  const coverage = LAB_SURFACE_CASE_IDS.length;

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

// ───────────────────────────────────────────────────────────────────────────────────────────────
// `mount.js`, attributed by MARKED region (issue 1198).
//
// The page that mounts every frame was an unattributed lab input, so any edit to it selected the
// whole corpus — which is what the PR introducing the player companion seam would have done to
// itself. Four of its blocks only the PLAYER window can render, and each is marked in the file
// rather than found by column, because two of them sit inside functions the Manager window runs
// too (`readParams` and `settle`). Keying on those FUNCTIONS would claim a readership the file
// does not have: a later edit to a manager query param would then select the player frames and
// publish no evidence for the manager frames it moved — a silent wrong narrowing, which is the
// one outcome this whole table exists to make unreachable.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const labMountLineOf = (text) => lineOf(labMountSource, text, LAB_MOUNT_PATH);

/** @returns {object} The `patches` option carrying one patch for the lab's mount page. */
const labMountPatches = (lineNumbers) =>
  patchesFor(LAB_MOUNT_PATH, patchAdding(labMountSource, lineNumbers));

/**
 * One anchor line inside each declared region, so every key is pinned rather than sampled.
 *
 * A multi-key region entry requires ALL its keys to parse or it widens, so a region left
 * unpinned here is a region whose spelling can drift back to a twenty-minute capture unnoticed.
 */
const MOUNT_REGION_ANCHORS = [
  ['player-extension-params', "    playerProvider: params.get('playerProvider') === '1',"],
  [
    'lab-player-provider',
    "      tab('board', 'Board', 'Downtime board and pending decisions', 'fas fa-chart-simple'),",
  ],
  ['mount-player-app', '    extensionSurfaces: deriveExtensionSurfaces(playerExtensions, {'],
  ['player-settle-stores', '      if (pending.length === 0) break;'],
];

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

  // The removal shape too, on the region a real PR is most likely to EDIT rather than append to:
  // a param default is rewritten in place, not added beside itself. Asserted against the
  // addition's own answer so the two cannot drift apart.
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

  // The first line is the proof that the marking is doing the work rather than the function
  // name: it is a query param inside the SAME `readParams()` the player block sits in, three
  // lines away from it and outside the markers, and it must widen. The rest are the shared
  // machinery every frame of both windows renders through.
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

test('the four mount.js regions the selector keys on are still marked in the file', () => {
  // A missing or re-worded marker fails SAFE — the parse returns null and the whole corpus is
  // selected — which is correct and invisible: the only symptom would be a capture job quietly
  // back at twenty minutes. So it has to fail LOUDLY here too.
  const missing = MOUNT_REGION_ANCHORS.map(([region]) => region).filter(
    (region) => !labMountSource.some((line) => line.trim() === `// view-lab-region:${region}`)
  );
  assert.deepEqual(
    missing,
    [],
    'these regions are no longer marked in the mount page, so `parsePlayerMountRegions` refuses ' +
      `the file and every mount.js change captures the whole corpus again:\n  ${missing.join('\n  ')}`
  );

  const opens = labMountSource.filter(
    (line) =>
      line.trim().startsWith('// view-lab-region:') && line.trim() !== '// view-lab-region:end'
  ).length;
  const closes = labMountSource.filter((line) => line.trim() === '// view-lab-region:end').length;
  assert.equal(opens, MOUNT_REGION_ANCHORS.length, 'every marked region is a declared region');
  assert.equal(closes, opens, 'every marked region is closed');
});

test('the player-only readership of the settle-stores region is still a fact about the Manager', () => {
  // Three of the four regions are player-only STRUCTURALLY — they are the player mount path, the
  // player provider and the player query params, and no manager frame reaches them. The fourth
  // is not: `settle()` runs for BOTH windows, and this block's player-only readership rests
  // entirely on a claim about a different file — that the six store names it waits on are names
  // the Manager's `_buildServices()` does not declare, so `watched` is empty on every manager
  // frame and an edit here cannot move one.
  //
  // Every other refusal in `parsePlayerMountRegions` fails SAFE: it widens to the whole corpus.
  // This one fails UNSAFE. The day the Manager gains a `journal` or an `inventory` seam, an edit
  // inside these markers narrows to player frames only and publishes NO evidence for the manager
  // frames it moved — the silent wrong narrowing the whole table exists to make unreachable, and
  // nothing else in the repo would notice. Asserted in prose in two files before this; asserted
  // here.
  //
  // Both halves are DERIVED rather than restated: the names come out of the region itself, and
  // the keys out of the manager's own services literal, so neither can drift from what it
  // describes without failing.
  const region = parsePlayerMountRegions(labMountSource)?.find(
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

  // Column-anchored on the ONE services literal, exactly as `parseCaseLineRegions` anchors its
  // own spans: `_buildServices()` returns a single object and its own keys sit at one indent.
  const managerSource = sourceOf(MANAGER_APP_PATH);
  const open = managerSource.indexOf('    return {', managerSource.indexOf('  _buildServices() {'));
  const close = managerSource.indexOf('    };', open);
  assert.ok(
    open > 0 && close > open,
    `${MANAGER_APP_PATH} no longer shapes _buildServices this way`
  );
  const serviceKeys = managerSource
    .slice(open + 1, close)
    .map((line) => /^ {6}([A-Za-z_$][\w$]*):/.exec(line)?.[1])
    .filter(Boolean);
  assert.ok(
    serviceKeys.length > 20,
    `only ${serviceKeys.length} manager service keys parsed, which is too few to be the real bag ` +
      '— read that as a broken slice, not a shrunken Manager'
  );

  assert.deepEqual(
    watched.filter((name) => serviceKeys.includes(name)),
    [],
    'the Manager now declares one of the stores the settle-stores region waits on, so that ' +
      'region is no longer player-only: an edit inside its markers would narrow the capture to ' +
      'player frames and publish nothing for the manager frames it moved. Either move the block ' +
      'outside the markers or drop it from PLAYER_MOUNT_REGIONS — do not just update this test.'
  );
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// `parsePlayerMountRegions`, driven directly.
//
// The tests above reach it only through `mapChangedFilesToCases`, over the file this repo ships —
// which is well-formed, so every one of its refusals is unreachable from there. It is a pure
// function of an injected `string[]`, so a synthetic fixture needs no file and no path injection.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** The marked regions, authored the way the mount page authors them. */
const mountRegionBlock = (key, { close = true } = {}) => [
  `  // view-lab-region:${key}`,
  `  ${key}: params.get('${key}') === '1',`,
  ...(close ? ['  // view-lab-region:end'] : []),
];

/** Every declared key, in the order the file marks them. */
const DECLARED_MOUNT_REGIONS = MOUNT_REGION_ANCHORS.map(([region]) => region);

const wellFormedMountSource = () => DECLARED_MOUNT_REGIONS.flatMap((key) => mountRegionBlock(key));

test('parsePlayerMountRegions maps each marked region to its own span', () => {
  const regions = parsePlayerMountRegions(wellFormedMountSource());
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

test('parsePlayerMountRegions refuses every shape whose spans would be a guess', () => {
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
      parsePlayerMountRegions(source),
      null,
      `${why} must refuse the file, so the selection widens to the corpus rather than narrowing wrongly`
    );
  }

  // The control, so the six refusals above are about the shapes and not about the fixture.
  assert.ok(parsePlayerMountRegions(wellFormed), 'the control fixture must parse');
});

test('the player companion cases photograph the seam through the production registry', () => {
  const surface = getCaseById('player-extension-surface');
  const narrow = getCaseById('player-extension-surface-narrow');
  const fault = getCaseById('player-extension-fault');
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

  // Containment is REPORTED by design, so the one frame whose subject is that report would fail
  // the driver's console gate. The lab swallows exactly that message, only for a case that asked
  // for a fault — pinned here because a widened prefix would start hiding real errors, and
  // because the message it excuses is the shipped host's, so it is a mirror like any other.
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
  // the same function the application host calls. Passing the registry alone would render an
  // empty rail: the shell subscribes to nothing by design, and this file never runs
  // `_registerHooks()`, so nothing else would compute `extensionSurfaces`.
  assert.match(mountSource, /playerProvider: params\.get\('playerProvider'\) === '1'/);
  assert.match(
    mountSource,
    /params\.playerProvider[\s\S]{0,400}registerPlayerNavProvider/,
    'the companion frames register through the production registry'
  );
  assert.match(
    mountSource,
    /extensionSurfaces: deriveExtensionSurfaces\(playerExtensions, \{\s*experimentalFeaturesEnabled: params\.experimental,/,
    'and states the experimental gate from the param that seeds the lab world\'s own setting'
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

  // `--clean` wipes that directory. The workflow must not pass it: a scoped render followed by a
  // wiping publish would drop every frame the PR did not re-select, which is exactly the failure a
  // narrowing makes reachable.
  assert.ok(
    !/view-lab-screenshots\.mjs apps[^\n]*--clean/.test(workflow),
    'the workflow wipes the frame directory before a scoped render, so unrendered frames are lost'
  );
});

// ── `expectView` is otherwise unguarded by `npm test` (issue 1096, B10 / BM8) ──────────
//
// `tests/view-lab-cases.test.js` asserted only that a case DECLARING `expectView` is a
// manager case; the VALUE was never matched against any route id. Splitting `checks` into
// four routes left eight cases comparing `'checks'` against `'checks-crafting'`, and that
// failure surfaces at CAPTURE time — where it fails the job whole and publishes nothing.
//
// The pin states its scope and its vocabulary, because an unscoped one is unimplementable:
// the registry carries 21 distinct `expectView` values, `expectView` is compared against
// `data-manager-view`, and that attribute is bound from a free-form `currentView` string
// with no declared registry. `craftingNav.js` is the worked counter-example — it declares a
// nav item `settings` whose VIEW is `crafting-settings`, so a pin written against nav ids
// would compare the wrong vocabulary entirely.
//
//   1. every value beginning `checks` is a member of `CHECKS_VIEWS`;
//   2. `CHECKS_VIEWS` values ARE the `data-manager-view` strings the root renders — asserted
//      as `currentView === '<id>'` literals, not as nav-item ids;
//   3. every remaining value is one of those same literals.
//
// (3) closes the set rather than sampling it: the root declares exactly the literals the
// registry uses, so the pin covers the whole registry instead of the checks subset.
// THE RULE ITSELF, hoisted out of the two tests below so the capability proof cannot drift
// from the enforcement. It was hand-copied into the proof, which meant a change to the
// enforcing predicate left the proof asserting the OLD rule still rejected the old mistakes —
// a proof of nothing, and green either way. One `accepts` is what makes the proof load-bearing.
function buildExpectViewPredicate() {
  const rootSource = readFileSync(
    resolve(ROOT, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
    'utf8'
  );
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

  // (2) — and it is the assertion that makes (1) worth anything. `CHECKS_VIEWS` is the set
  // the checks half is pinned against, so if those strings were nav-item IDS rather than
  // VIEW ids the pin would be checking a vocabulary nothing renders.
  //
  // The four values appear in no `currentView === '…'` literal, deliberately: the root
  // routes the whole group through the `isChecksRoute` predicate rather than four branches.
  // So the chain is asserted where it actually runs — `data-manager-view` is bound from
  // `currentView`; the rail routes with `setView(checksItem.view)` over `checksNavItems`;
  // and `buildChecksNavItems` puts exactly the `CHECKS_VIEWS` strings on `item.view`. Every
  // link is checked, because breaking any one of them is what would make the checks half
  // vacuous.
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
  // The capability proof, run against the two mistakes the pin exists to catch rather than
  // against an arbitrary bad string. Both are what the registry ACTUALLY contained before
  // this change, or what a plausible edit would put back.
  // The SAME predicate the test above enforces with — not a restatement of it.
  const { accepts } = buildExpectViewPredicate();

  assert.equal(accepts('checks'), false, 'the PRE-SPLIT value must be rejected');
  assert.equal(accepts('crafting'), false, 'a bare nav-item id must be rejected');
  assert.equal(accepts('settings'), false, "craftingNav's `settings` nav id is not a view");
  // …and the pin is not simply rejecting everything.
  assert.equal(accepts('checks-crafting'), true);
  assert.equal(accepts('crafting-settings'), true, 'the VIEW that nav id maps to is accepted');
  assert.equal(accepts('recipe-edit'), true);
});

// ── the recipe-readiness string-path probe (issue 1098, BH4) ─────────────────────────────
//
// `recipeReadiness.js` decides the readiness BADGES on the recipe editor's tabs, and issue
// 1098 makes its routed-check validation policy-conditional. A change confined to it must
// therefore select the recipe-editor frames — and it must NOT fall through to
// `FALLBACK_CASE_ID`, which is what `mapChangedFilesToCases` returns when nothing matched
// and is the silent failure this whole file exists to catch: the capture job would publish
// the app shell and `check-screenshots` would go green on a frame showing nothing.
//
// PROVEN CAPABLE OF FAILING: pointing it at a path no `sourceMatches` covers (asserted
// below against a deliberately unmatched file) returns exactly the fallback, so a
// regression that stopped `recipeReadiness.js` matching would red the first assertion
// rather than quietly widening the second.
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
