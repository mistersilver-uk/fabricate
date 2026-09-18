/** A converted manager button must still be reached by its own component's CSS (issue 1118). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

import { classTokensPassedTo } from '../helpers/svelteTagScan.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Every `.svelte` beneath `src/`, as repo-relative POSIX paths. */
function svelteFiles(directory = 'src') {
  return readdirSync(join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return svelteFiles(child);
    return entry.name.endsWith('.svelte') ? [child] : [];
  });
}

/**
 * The compounds of a compiled selector: its parts between combinators.
 *
 * @param {string} selector one compiled selector
 * @returns {Array<string>} its compounds, in source order
 */
function compoundsOf(selector) {
  return selector
    .split(/\s*[\s>+~]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * A component's compiled CSS with comments blanked, plus the selectors the compiler PRUNED.
 *
 * @param {string} file repo-relative component path
 * @param {string} source component source text
 * @returns {{css: string, pruned: string[]}} the emitted CSS with comments blanked, and every
 */
function compiledCss(file, source) {
  const emitted = compile(source, {
    filename: join(repoRoot, file),
    css: 'external',
    generate: 'client',
  });
  return {
    css: (emitted.css?.code ?? '').replaceAll(/\/\*[\s\S]*?\*\//g, ' '),
    pruned: (emitted.warnings ?? [])
      .filter((warning) => warning.code === 'css_unused_selector')
      .map((warning) => /Unused CSS selector "(.*)"/.exec(warning.message)?.[1] ?? ''),
  };
}

/** The primitives this guard covers, and the classes each emits UNCONDITIONALLY. */
const PRIMITIVES = Object.freeze([
  Object.freeze({
    tag: 'ManagerButton',
    contractClasses: ['manager-button', 'fab-manager-button'],
    minimumTokens: 20,
  }),
  Object.freeze({ tag: 'IconButton', contractClasses: ['manager-icon-button'], minimumTokens: 10 }),
  // The manager's card shell. Its call sites pass FEWER bespoke tokens than either button's —
  // 13 across 20 components as issue 1427 lands — because a card's modifier is usually the
  // only class it carries, so the floor is lower without being weaker.
  Object.freeze({
    tag: 'InspectorCard',
    contractClasses: ['manager-inspector-card'],
    minimumTokens: 8,
  }),
  // `<Field>` (issue 1428), and the widest sweep this guard has scanned.
  Object.freeze({ tag: 'Field', contractClasses: ['manager-field'], minimumTokens: 20 }),
  // The manager's filter bar and its search field (issue 1039). The bar is the sharpest entry
  // on this table so far, because its dead rule was LOCATED IN ADVANCE and is still the silent
  // kind: `scoped/EntityListInspectorFrame.svelte` states
  // `.manager-scoped-list-toolbar { flex: 0 0 auto }` inside a `display: flex; flex-direction:
  // The bar's floor is 5 rather than the buttons' 20 because a filter bar wears exactly one
  // modifier: eight of the eleven pass one, and the other three pass none at all. The field's
  // is 1, for a stronger version of the same reason — only two of its nineteen sites carry a
  // bespoke class, and both of those rules live in `styles/fabricate.css` rather than in a
  // scoped block.
  Object.freeze({ tag: 'ManagerToolbar', contractClasses: ['manager-toolbar'], minimumTokens: 5 }),
  Object.freeze({
    tag: 'ManagerSearchField',
    contractClasses: ['manager-search'],
    minimumTokens: 1,
  }),
  // THE editor validation surface (issue 1444).
  Object.freeze({
    tag: 'EditorValidationSurface',
    contractClasses: [
      'manager-editor-validation-surface',
      'manager-recipe-validation',
      'manager-recipe-tab',
    ],
    minimumTokens: 1,
  }),
  // The manager's searchable picker (issue 1458).
  Object.freeze({
    tag: 'SearchablePopover',
    classProps: ['triggerClass', 'popoverClass', 'valueClass', 'pickerClass'],
    contractClasses: [
      'manager-travel-picker',
      'manager-travel-popover',
      'manager-travel-popover-options',
      'manager-travel-option',
      'manager-travel-option-name',
      'manager-travel-portrait',
    ],
    minimumTokens: 40,
  }),
  // THE overflow action menu (issue 1477).
  Object.freeze({
    tag: 'ActionMenu',
    classProps: ['class', 'triggerClass', 'menuClass'],
    contractClasses: [
      'fabricate-action-menu',
      'fabricate-action-menu-panel',
      'manager-action-menu',
      'manager-action-menu-panel',
      'manager-action-menu-item',
    ],
    minimumRenderSites: 1,
  }),
]);

test('no component scopes a rule onto a class it hands to a shared primitive', () => {
  const violations = [];
  const sitesScanned = new Map(PRIMITIVES.map((p) => [p.tag, 0]));
  // The second census, for a row whose non-vacuity is its RENDER sites rather than the classes
  // its callers pass. See the `ActionMenu` row: a primitive no caller hands a bespoke class can
  // still be reached by the contract half of this guard, and only a render count can say so.
  const renderSitesScanned = new Map(PRIMITIVES.map((p) => [p.tag, 0]));
  let componentsWithScopedCss = 0;
  let contractRulesScanned = 0;

  for (const file of svelteFiles()) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const active = PRIMITIVES.map((primitive) => ({
      primitive,
      tokens: classTokensPassedTo(source, primitive.tag, primitive.classProps),
      // `String.raw` is load-bearing and is NOT a style choice. A plain template literal
      // resolves \s to a bare `s` before `RegExp` ever sees it, so this character
      // class silently becomes `[s/>]` — which breaks the predicate in BOTH directions at once.
      renders: new RegExp(String.raw`<${primitive.tag}[\s/>]`).test(source),
    })).filter((entry) => entry.tokens.size > 0 || entry.renders);
    if (active.length === 0) continue;
    for (const entry of active) {
      sitesScanned.set(
        entry.primitive.tag,
        sitesScanned.get(entry.primitive.tag) + entry.tokens.size
      );
      if (entry.renders) {
        renderSitesScanned.set(
          entry.primitive.tag,
          renderSitesScanned.get(entry.primitive.tag) + 1
        );
      }
    }

    const { css, pruned } = compiledCss(file, source);

    // The pruned half needs no hash to be found — the rule never reached the output at all.
    for (const selector of pruned) {
      for (const { tokens } of active) {
        for (const token of tokens) {
          // `(?![\w-])`, never `\b`: `\b` matches before a hyphen.
          if (!new RegExp(String.raw`\.${token}(?![\w-])`).test(selector)) continue;
          violations.push(`${file}: ${selector.trim().replaceAll(/\s+/g, ' ')} [pruned as unused]`);
        }
      }
    }

    const hash = /\.(svelte-[a-z0-9]+)\b/.exec(css)?.[1];
    if (!hash) continue;
    componentsWithScopedCss += 1;

    for (const block of css.split('}')) {
      const selector = block.split('{', 1)[0];
      if (!selector.includes(hash)) continue;
      // The bespoke-token half, PER COMPOUND and SUBSET-GATED. Both qualifications were
      // forced by real cases when `IconButton` joined this guard (issue 1422), and a
      // whole-selector test gets each of them wrong in a different direction:
      for (const { primitive, tokens } of active) {
        for (const compound of compoundsOf(selector)) {
          if (!compound.includes(hash)) continue;
          const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
          const namesToken = classes.some((name) => tokens.has(name));
          if (!namesToken) continue;
          const everyClassCouldBeThePrimitives = classes.every(
            (name) => name === hash || tokens.has(name) || primitive.contractClasses.includes(name)
          );
          if (!everyClassCouldBeThePrimitives) continue;
          violations.push(`${file}: ${selector.trim().replaceAll(/\s+/g, ' ')}`);
        }
      }
      // The no-bespoke-class half. Per compound.
      for (const { primitive, renders } of active) {
        if (!renders) continue;
        for (const compound of compoundsOf(selector)) {
          const noContractClass = primitive.contractClasses.every(
            (token) => !new RegExp(String.raw`\.${token}(?![\w-])`).test(compound)
          );
          if (noContractClass) continue;
          contractRulesScanned += 1;
          if (!compound.includes(hash)) continue;
          violations.push(`${file}: ${selector.trim().replaceAll(/\s+/g, ' ')}`);
        }
      }
    }
  }

  // Non-vacuity, in both directions the scan can rot. A wrong root.
  for (const { tag, minimumTokens, minimumRenderSites } of PRIMITIVES) {
    const byRenders = minimumRenderSites !== undefined;
    const measured = byRenders ? renderSitesScanned.get(tag) : sitesScanned.get(tag);
    const floor = byRenders ? minimumRenderSites : minimumTokens;
    assert.ok(
      measured > floor,
      `only ${measured} ${tag} ${byRenders ? 'render sites' : 'class tokens'} found under src, ` +
        `below the floor of ${floor}, so this guard is no longer reaching that primitive`
    );
  }
  assert.ok(
    componentsWithScopedCss > 0,
    'no component both renders a classed primitive and owns a scoped <style>, so this ' +
      'guard walked over nothing'
  );
  // The floor for the half added at task 9. It has to be stated.
  assert.ok(
    contractRulesScanned > 0,
    'no component that renders a primitive states a scoped rule against one of its ' +
      'contract classes, so the compound check walked over nothing'
  );

  // Code point, not `localeCompare`, for the reason `sourceScan.js` gives.
  assert.deepEqual(
    violations.sort((left, right) => (left === right ? 0 : left < right ? -1 : 1)),
    [],
    'these rules select a class that only a `<ManagerButton>`, `<IconButton>`, ' +
      '`<InspectorCard>`, `<ManagerToolbar>`, `<ManagerSearchField>`, ' +
      '`<EditorValidationSurface>`, `<SearchablePopover>` or `<ActionMenu>` carries, so they ' +
      'match ' +
      'NOTHING ' +
      'and the control is silently unstyled — either emitted with this component`s scoping ' +
      'class attached, or pruned by the compiler before they were emitted at all. Wrap each ' +
      'in `:global(...)` — and chain the primitive`s classes while you are there, because a ' +
      '`:global` rule at (0,2,0) then loses to the primitive on specificity — or hoist the ' +
      'rule into `styles/fabricate.css`, which is the right answer when two components ' +
      'declare the same one:\n  ' +
      violations.join('\n  ')
  );
});
