/**
 * A converted manager button must still be reached by its own component's CSS (issue 1118).
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────────────────
 * Several `manager-button` call sites are painted by a rule in their OWN component's scoped
 * `<style>` block rather than by `styles/fabricate.css`. Converting one to `<ManagerButton>`
 * silently disconnects that rule, and every gate this repository has reports clean:
 *
 *  - Svelte scopes a rule by appending its `svelte-<hash>` class to the selector and stamping
 *    that class onto the elements THIS component writes. It does not stamp a child
 *    component's internals, and a `class` prop handed to a child is forwarded verbatim — so
 *    `.fab-bulk-edit-apply.svelte-<hash>` matches nothing the moment Apply becomes a
 *    `<ManagerButton>`, while the element still carries `fab-bulk-edit-apply`.
 *  - The compiler emits no `css_unused_selector` warning for the compound case, because the
 *    class literal is right there in the markup on the component tag and its siblings in the
 *    selector are on elements this component writes. `lint:svelte:warnings` therefore passes.
 *    (A BARE bespoke selector is pruned and warned about instead — see the next section.)
 *  - A fixture built with `tests/helpers/scoped-component-css.js` STAMPS the hash onto its
 *    hand-written markup, which is faithful for an element the component writes and wrong for
 *    one a child renders — so a computed-style fixture keeps measuring the rule that the
 *    product has stopped matching.
 *
 * It shipped. `GatheringEconomyView`'s bulk Save was converted with its scoped rule chained
 * but still scoped, and only a suite that mounts the REAL component could see it:
 * `bulk-edit-dock-pinning.test.js` caught the same mistake in `BulkEditPanelShell` because
 * it measures Apply's rendered box, and nothing at all was measuring the other two.
 *
 * ── AND THE OTHER HALF, WHICH IS PRUNED RATHER THAN SCOPED ───────────────────────────────
 * A dead rule of this kind reaches the compiler in one of TWO states, and only one of them
 * survives into the emitted CSS. Which one you get depends on whether the same class token
 * also appears somewhere on an element the component itself writes:
 *
 *  - It does (or the selector is a compound whose other classes do): the rule is EMITTED with
 *    the hash appended, matches nothing, and no warning is raised. `GatheringEconomyView`'s
 *    `.manager-button.fab-manager-button.is-primary.manager-economy-bulk-save` is that case.
 *  - It does not: Svelte PRUNES the rule to a `/* (unused) … *\/` comment and raises
 *    `css_unused_selector`. Both `.manager-recipe-tab-action` blocks — declared identically in
 *    `RecipeAccessTab` and `RecipeBooksScrollsTab` — were that case (issue 1118, task 8).
 *
 * The rule is equally dead either way, and the repair is the same, so both are checked here.
 * The pruned half is nominally also covered by `lint:svelte:warnings`, which fails on any
 * compiler warning — but that gate reports "Unused CSS selector" with no hint that the class
 * is on a child component and no hint that deleting the rule would unstyle the control. This
 * one names the defect.
 *
 * ── WHAT THIS ASSERTS ────────────────────────────────────────────────────────────────────
 * For every class token a `.svelte` under `src/` hands to a `<ManagerButton>` through the
 * appending `class` prop, no rule in that component's own compiled CSS may select that token
 * with the component's scoping class attached, and no rule the compiler pruned as unused may
 * select it either. `:global(...)` is the fix for the first and passes here, because a
 * `:global` rule compiles without the hash; hoisting into `styles/fabricate.css` is the fix
 * for either, and is the right one when two components declare the same rule.
 *
 * The check is run against the REAL compiler output rather than a hand-parse of the `<style>`
 * block, so `:global()` nesting, selector rewriting, pruning and the hash's exact placement
 * are the compiler's answers and not this file's guesses.
 *
 * ── AND THE CASE WITH NO BESPOKE CLASS AT ALL (issue 1118, task 9) ──────────────────────
 * The scan above keys on the tokens a component HANDS to its `<ManagerButton>`, which is where
 * the first three instances of this defect lived. It is blind to the shape that has no such
 * token: a rule that reaches the button through the CONTRACT class itself —
 * `.some-row .manager-button` — which is the ordinary way a container styles the controls
 * inside it and was, before the sweep, always correct. Every one of those buttons is a child
 * component now, so every such rule is subject to exactly the same failure, and the one in
 * `ImportFolderMappingModal` was found by MUTATING its repair and watching this guard stay
 * green rather than by the guard itself.
 *
 * That half is checked per COMPOUND rather than per selector, because the two spellings differ
 * only in where the hash lands. `.row.svelte-h :global(.manager-button.fab-manager-button)`
 * emits the hash on the ROW's compound and reaches the child correctly;
 * `.row .manager-button.fab-manager-button` scoped emits
 * `.row.svelte-h .manager-button.fab-manager-button:where(.svelte-h)` — the same selector plus
 * a hash on the compound that has to match an element this component does not write. A
 * whole-selector test cannot tell those apart and would fail the repair as loudly as the
 * defect.
 *
 * It deliberately says nothing about SPECIFICITY — `manager-button-cascade-inventory.test.js`
 * owns that question, and a `:global()` rule that reaches the button but loses to the
 * primitive is a cascade problem rather than a reach problem.
 */
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
 * Deliberately crude — descendant, `>`, `+` and `~` are all treated as separators and nothing
 * parses inside `:not(...)` or `:where(...)`, because the only question asked of the result is
 * "does the piece that has to match a CHILD COMPONENT's element carry this component's scoping
 * class". Svelte writes that class as a bare `.svelte-<hash>` or inside `:where(.svelte-<hash>)`
 * and both stay attached to their own compound, which is all the precision this needs.
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
 * The pruned ones are taken from the `css_unused_selector` warnings rather than by reading
 * the `/* (unused) … *\/` comments back out of the emitted text, because the warning is the
 * compiler stating which selector it dropped, while the comment is formatting that a future
 * release is free to change.
 *
 * @param {string} file repo-relative component path
 * @param {string} source component source text
 * @returns {{css: string, pruned: string[]}} the emitted CSS with comments blanked, and every
 *   selector the compiler reported as unused
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

/**
 * The primitives this guard covers, and the classes each emits UNCONDITIONALLY.
 *
 * A rule keyed on a contract class reaches the primitive without the component having handed
 * it any class at all, which is why they are checked separately from the tokens a call site
 * passes.
 *
 * `IconButton` (issue 1422) joined `ManagerButton` here rather than getting a guard of its
 * own, because the defect and its two failure modes are identical and a second copy would
 * drift. That conversion is also the sharpest evidence yet that the SILENT mode is the one
 * that matters: of its two dead rules, `EssenceIdentityTab`'s was pruned and named by
 * `lint:svelte:warnings`, while `GatheringEconomyView`'s bare `.manager-economy-actor-roll`
 * was EMITTED with the hash attached and warned about nowhere. A repair driven by the warning
 * gate alone would have shipped the second one dead.
 *
 * `InspectorCard` (issue 1427) joined on the same argument, and it is not a button at all —
 * which is the point. The defect is a property of the COMPONENT BOUNDARY rather than of any one
 * control, so every extraction that moves a class onto a child belongs in this one table.
 *
 * It also corrected what this file previously recorded about WHEN the silent mode fires. The
 * `IconButton` note above blamed a spread attribute on a regular element. That is incomplete.
 * Measured directly against Svelte 5.56.3, with a `.target` rule whose only call site is
 * `<Child class="target" />`, the rule is pruned and warned about when the file holds nothing
 * else, when it holds `<Other {...hook} />`, when it holds `<Other class={expr} />`, when it
 * holds `<i class:is-on={on}>` and when it holds `<i class="static">` — and it is emitted
 * SILENTLY when the file holds `<li {...hook}>` or `<i class={o.icon}>` or
 * ``<i class={`lit ${o.icon}`}>``. The trigger is a REGULAR ELEMENT carrying either a spread or
 * a `class` whose value is any expression, a template literal included; the same attribute on a
 * COMPONENT tag does not do it. `GatheringEconomyView` is the worked example: its only spreads
 * are on `<Stepper>`, and what silences it is `class={option.icon}` on an `<i>`. An
 * expression-valued `class` on a regular element is ordinary in this codebase, so the silent
 * mode is the DEFAULT and this guard — not `lint:svelte:warnings` — is what finds it.
 *
 * Each floor is stated separately, because one primitive having plenty of call sites must not
 * let another's scan rot to zero unnoticed.
 */
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
  // `<Field>` (issue 1428), and the widest sweep this guard has scanned: `manager-field` was a
  // CSS convention on 88 elements across 24 components and 81 of them became this primitive in
  // one change. It belongs on THIS list rather than in a suite of its own because the mechanism
  // is identical and a second copy of it would be new duplicated lines on new code.
  //
  // It is also the primitive that proves the EMITTED half carries the weight. Six scoped rules
  // died in that sweep — `GatheringTaskEditView`'s four, `ImportFolderMappingModal`'s two and
  // `CraftingModifierCatalogueCard`'s one — and not one was pruned, so `lint:svelte:warnings`
  // reported zero warnings across all 307 components and the compiled `css.code` of every
  // converted file came out BYTE-IDENTICAL. Byte-identity is the SIGNATURE of this failure, not
  // evidence against it: the rules were emitted exactly as before, with the caller's scoping
  // class attached, onto elements the caller no longer writes.
  //
  // Each is repaired as `:global(.manager-field.the-other-class …)`. The `.manager-field`
  // compound is load-bearing rather than decorative: the scoped form compiled to
  // `.the-other-class.svelte-hash`, which is (0,2,0), and a bare `:global(.the-other-class)` is
  // (0,1,0) — so the bare form reaches the element and smuggles a cascade change in as a repair.
  // This guard cannot see that difference and says so out loud rather than implying otherwise.
  //
  // Its subset gate is not decorative either: `SubjectModifierPicker` and `SystemEditView` both
  // hand `is-wide` to a `<Field>`, and that is a shared modifier they also put on elements they
  // write themselves. 30 bespoke tokens travel onto a `<Field>` as this lands.
  Object.freeze({ tag: 'Field', contractClasses: ['manager-field'], minimumTokens: 20 }),
  // The manager's filter bar and its search field (issue 1039). The bar is the sharpest entry
  // on this table so far, because its dead rule was LOCATED IN ADVANCE and is still the silent
  // kind: `scoped/EntityListInspectorFrame.svelte` states
  // `.manager-scoped-list-toolbar { flex: 0 0 auto }` inside a `display: flex; flex-direction:
  // column` column, and that file also renders `<div class={TOOLBAR_ROW_CLASS}>` — a regular
  // element with an expression-valued `class` — which is precisely the silencing condition
  // recorded above. `css.code` is BYTE-IDENTICAL across that conversion: the selector is
  // emitted with the hash attached and matches nothing, so a css-diff gate reports the file
  // unchanged while the bar has stopped taking `flex: 0 0 auto` and started absorbing the
  // column's slack instead of the row list.
  //
  // `manager-toolbar` is a PREFIX of `manager-toolbar-pills`, which is why the two token
  // patterns below terminate `(?![\w-])` rather than `\b` — `\b` matches before a hyphen, so
  // the bare-word form counts a chip row as a filter bar.
  //
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
  // THE editor validation surface (issue 1444), and the entry with the SMALLEST token set on
  // this table: exactly one of its four call sites hands it a class at all, and that one hands
  // two — `recipe-item/RecipeItemValidationTab`, whose root carried
  // `manager-recipe-item-tab manager-recipe-item-validation` before the conversion and keeps
  // them through the appending `class` prop so no shipped rule stops matching. The floor is 1
  // because the assertion is strictly greater and the census is 2; a floor of 2 would pass
  // vacuously the day that site stops passing a class.
  //
  // It is on the table despite that conversion having deleted the only scoped rule in either
  // converted file, because the exposure is a property of the BOUNDARY rather than of today's
  // corpus: `manager-recipe-item-validation` now lives on a component tag, so a rule written
  // against it in that file tomorrow is dead on arrival, and the family this surface owns —
  // `manager-recipe-val-*`, `manager-recipe-rail-*` — is exactly the kind a site is tempted to
  // refine locally.
  //
  // All three contract classes are listed because the primitive writes all three on its root
  // unconditionally. `manager-recipe-tab` is shared with the recipe editor's other tabs, which
  // is harmless here: the contract half only runs for a file that RENDERS the primitive, and no
  // such file states a scoped rule against it.
  Object.freeze({
    tag: 'EditorValidationSurface',
    contractClasses: [
      'manager-editor-validation-surface',
      'manager-recipe-validation',
      'manager-recipe-tab',
    ],
    minimumTokens: 1,
  }),
  // The manager's searchable picker (issue 1458), and the first entry that does NOT take its
  // classes through a `class` prop. It renders three elements a caller may want to reach — the
  // trigger, the portaled panel and the value span — so it takes `triggerClass`,
  // `popoverClass`, `valueClass` and `pickerClass` instead, which is what `classProps` below is
  // for. Without it the scan reads `class` on sixteen call sites, finds nothing, and every
  // clause here goes vacuous over this primitive while reporting clean; with it, 69 tokens.
  //
  // It also CORRECTS what this file records about the silent mode, and the correction is the
  // reason the entry earns its place rather than restating the ones above. The silent,
  // warning-free variant needs the class LITERAL to sit in a `class` attribute on the component
  // tag — that is the analysis Svelte's `css_unused_selector` pass consults. A token travelling
  // as `triggerClass` is invisible to it, so a rule that names one is PRUNED and warned about
  // instead. Measured on this change's own conversion: `ModifierPillSelect`'s
  // `.manager-availability-menu-button[aria-disabled='true']` pair was emitted-and-scoped
  // before, and the moment the trigger became a `<SearchablePopover>` both were pruned with an
  // `Unused CSS selector` warning — even though that file holds
  // `<i class={option.icon || 'fa-solid fa-dice-d20'}>`, the exact silencing condition recorded
  // above. So for THIS primitive `lint:svelte:warnings` does see the defect, and the pruned
  // half of this guard is the half that fires. Both halves stay wired, because that behaviour
  // is a property of a PROP NAME and not of the boundary: the day a caller writes
  // `class="…"` on a `<SearchablePopover>` — the `class` prop it does not declare — the
  // emitted half is what would catch it.
  //
  // The portaled panel is why the contract set is not just the picker root: `.manager-travel-
  // popover` and `.manager-travel-option` are appended to the `.fabricate-manager` host, so a
  // caller's `.its-cell .manager-travel-option` rule is dead on ARRIVAL as well as unscoped.
  // The floor is 40 against a measured 69, which reds if two fifths of the call sites stop
  // resolving without failing on a single conversion that drops a bespoke token.
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
  // THE overflow action menu (issue 1477), and the entry that DECLINES the gap the picker above
  // documents. That note ends by saying the emitted half would catch a caller writing
  // `class="…"` on a `<SearchablePopover>`; it would not, because `class` is not in that row's
  // `classProps`, so `classTokensPassedTo` never sees such a token and the rule that names it
  // goes through this guard unexamined. This row lists `class` FIRST for exactly that reason.
  //
  // It costs nothing today — neither caller passes one, so the prop contributes zero tokens and
  // the census below is the one `triggerClass` token the identity strip hands over. It is not a
  // hypothetical either: `class` is the obvious spelling for a caller reaching for the root, this
  // primitive does not declare that prop at all, and a class literal on a COMPONENT tag is the
  // documented SILENT case — emitted with the caller's hash attached, matching nothing, with no
  // compiler warning and byte-identical `css.code`.
  //
  // The floor is 0 against a measured census of 1, and the assertion is strictly greater, so it
  // reds the moment the scan stops resolving that single token. A floor of 1 would pass
  // vacuously the day the identity strip stops passing a bespoke class.
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
    minimumTokens: 0,
  }),
]);

test('no component scopes a rule onto a class it hands to a shared primitive', () => {
  const violations = [];
  const sitesScanned = new Map(PRIMITIVES.map((p) => [p.tag, 0]));
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
      // It UNDER-matches, rejecting `<Tag class=…>` and `<Tag\n  class=…>` (a tag
      // followed by a space or a newline, which is nearly every call site in this corpus),
      // and it OVER-matches, accepting `<Tags>` — a DIFFERENT component whose name merely
      // EXTENDS this one — so a file that never renders the primitive can satisfy it.
      // (`<TagGroup>` escapes only because `G` happens not to be in the collapsed class;
      // the plural spelling, which is the likely one, does not.) Measured, not reasoned:
      // `<InspectorCards>` matches the collapsed form and not the raw one.
      // Measured when `<InspectorCard>` joined (issue 1427): the collapsed form matched 6
      // of 53 `ManagerButton` files, 2 of 36 `IconButton` files and 5 of 20 `InspectorCard`
      // files, leaving the contract-class half of this guard inert over three quarters of
      // its corpus while reporting clean. A mechanical check that cannot fail is
      // indistinguishable from one that passes, so do not "tidy" this back to a template
      // literal.
      renders: new RegExp(String.raw`<${primitive.tag}[\s/>]`).test(source),
    })).filter((entry) => entry.tokens.size > 0 || entry.renders);
    if (active.length === 0) continue;
    for (const entry of active) {
      sitesScanned.set(
        entry.primitive.tag,
        sitesScanned.get(entry.primitive.tag) + entry.tokens.size
      );
    }

    const { css, pruned } = compiledCss(file, source);

    // The pruned half needs no hash to be found — the rule never reached the output at all.
    for (const selector of pruned) {
      for (const { tokens } of active) {
        for (const token of tokens) {
          // `(?![\w-])`, never `\b`: `\b` matches before a hyphen, so a token pattern for
          // `manager-toolbar` would count `.manager-toolbar-pills` as a hit.
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
      //
      //  - PER COMPOUND, for the reason this file's docblock already gives about the
      //    contract half. `EssenceIdentityTab`'s REPAIR is
      //    `.manager-essence-icon-tile.svelte-h .manager-essence-icon-reset` — the hash sits
      //    on the tile, which this component does write, and the child compound is bare. A
      //    whole-selector test sees a hash and a token in one string and fails the repair as
      //    loudly as the defect it fixes.
      //  - SUBSET-GATED, because a token handed to the primitive may ALSO be a shared
      //    modifier this component puts on its own elements. `ComplicationSummaryRow` hands
      //    `is-danger` to an `<IconButton>` and separately declares
      //    `.fab-complication-severity.is-danger` for a severity pill it writes itself. That
      //    rule is alive and correct, and flagging it would buy a bogus `:global` repair.
      //    Requiring every class in the compound to be one the primitive could carry is what
      //    tells "a rule aimed at the primitive" apart from "a rule that happens to share a
      //    state class with it".
      //
      // `ManagerButton` never met the second case because it takes its role as a `role` prop
      // rather than a pass-through class, so `is-danger` is not in its token set at all.
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
      // The no-bespoke-class half. Per compound, and only for a component that actually
      // renders the primitive: `.some-row .manager-button` in a component whose buttons are
      // still hand-written is correct and must not be flagged.
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

  // Non-vacuity, in both directions the scan can rot. A wrong root, a bad extension filter or
  // a tag matcher that stopped finding call sites reads as zero tokens; a corpus in which no
  // such component has a scoped block at all would make the loop above unreachable. Stated
  // PER PRIMITIVE so a healthy `ManagerButton` count cannot mask an `IconButton` scan that
  // stopped resolving anything.
  for (const { tag, minimumTokens } of PRIMITIVES) {
    assert.ok(
      sitesScanned.get(tag) > minimumTokens,
      `only ${sitesScanned.get(tag)} ${tag} class tokens found under src, below the ` +
        `floor of ${minimumTokens}, so this guard is no longer reaching that primitive`
    );
  }
  assert.ok(
    componentsWithScopedCss > 0,
    'no component both renders a classed primitive and owns a scoped <style>, so this ' +
      'guard walked over nothing'
  );
  // The floor for the half added at task 9. It has to be stated, because that half is the one
  // with no bespoke token to key on: if no component in the corpus both renders a primitive
  // and states a rule against its contract class, the compound walk above is unreachable and
  // its silence means nothing.
  assert.ok(
    contractRulesScanned > 0,
    'no component that renders a primitive states a scoped rule against one of its ' +
      'contract classes, so the compound check walked over nothing'
  );

  // Code point, not `localeCompare`, for the reason `sourceScan.js` gives: locale-dependent
  // ordering would make one corpus compare in two orders on two machines.
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
