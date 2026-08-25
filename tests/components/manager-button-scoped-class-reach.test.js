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
 * The class tokens a component hands to its `<ManagerButton>` call sites.
 *
 * The tag's end cannot be found with `[^<>]*`: every one of these sites passes an inline
 * `onclick={() => …}`, and the arrow's `>` would end the match half way through the
 * attributes. So the scan walks to the first `>` that is not the tail of an `=>`, which is
 * exact for this markup and does not depend on how prettier wrapped the attributes.
 *
 * @param {string} source component source text
 * @returns {Set<string>} every literal class token passed through the `class` prop
 */
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

function managerButtonClassTokens(source) {
  const tokens = new Set();
  for (const opening of source.matchAll(/<ManagerButton\b/g)) {
    let end = opening.index;
    do {
      end = source.indexOf('>', end + 1);
    } while (end > 0 && source[end - 1] === '=');
    if (end < 0) continue;
    const tag = source.slice(opening.index, end + 1);
    const literal = /\bclass="([^"]*)"/.exec(tag);
    if (!literal) continue;
    for (const token of literal[1].split(/\s+/)) if (token) tokens.add(token);
  }
  return tokens;
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

// The two classes the primitive emits unconditionally. A rule keyed on either of them reaches
// a `<ManagerButton>` without the component having handed it any class at all, which is why
// they are checked separately from the tokens a call site passes.
const CONTRACT_CLASSES = ['manager-button', 'fab-manager-button'];

test('no component scopes a rule onto a class it hands to a ManagerButton', () => {
  const violations = [];
  let sitesScanned = 0;
  let componentsWithScopedCss = 0;
  let contractRulesScanned = 0;

  for (const file of svelteFiles()) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const tokens = managerButtonClassTokens(source);
    const rendersPrimitive = /<ManagerButton[\s/>]/.test(source);
    if (tokens.size === 0 && !rendersPrimitive) continue;
    sitesScanned += tokens.size;

    const { css, pruned } = compiledCss(file, source);

    // The pruned half needs no hash to be found — the rule never reached the output at all.
    for (const selector of pruned) {
      for (const token of tokens) {
        if (!new RegExp(String.raw`\.${token}\b`).test(selector)) continue;
        violations.push(`${file}: ${selector.trim().replaceAll(/\s+/g, ' ')} [pruned as unused]`);
      }
    }

    const hash = /\.(svelte-[a-z0-9]+)\b/.exec(css)?.[1];
    if (!hash) continue;
    componentsWithScopedCss += 1;

    for (const block of css.split('}')) {
      const selector = block.split('{', 1)[0];
      if (!selector.includes(hash)) continue;
      for (const token of tokens) {
        if (!new RegExp(String.raw`\.${token}\b`).test(selector)) continue;
        violations.push(`${file}: ${selector.trim().replaceAll(/\s+/g, ' ')}`);
      }
      // The no-bespoke-class half. Per compound, and only for a component that actually
      // renders the primitive: `.some-row .manager-button` in a component whose buttons are
      // still hand-written is correct and must not be flagged.
      if (!rendersPrimitive) continue;
      for (const compound of compoundsOf(selector)) {
        const noContractClass = CONTRACT_CLASSES.every(
          (token) => !new RegExp(String.raw`\.${token}\b`).test(compound)
        );
        if (noContractClass) continue;
        contractRulesScanned += 1;
        if (!compound.includes(hash)) continue;
        violations.push(`${file}: ${selector.trim().replaceAll(/\s+/g, ' ')}`);
      }
    }
  }

  // Non-vacuity, in both directions the scan can rot. A wrong root, a bad extension filter or
  // a tag matcher that stopped finding call sites reads as zero tokens; a corpus in which no
  // such component has a scoped block at all would make the loop above unreachable.
  assert.ok(sitesScanned > 20, `only ${sitesScanned} ManagerButton class tokens found under src`);
  assert.ok(
    componentsWithScopedCss > 0,
    'no component both renders a classed ManagerButton and owns a scoped <style>, so this ' +
      'guard walked over nothing'
  );
  // The floor for the half added at task 9. It has to be stated, because that half is the one
  // with no bespoke token to key on: if no component in the corpus both renders the primitive
  // and states a rule against the contract class, the compound walk above is unreachable and
  // its silence means nothing. Three such rules exist as this lands, all in
  // `ImportFolderMappingModal`.
  assert.ok(
    contractRulesScanned > 0,
    'no component that renders a ManagerButton states a scoped rule against `.manager-button` ' +
      'or `.fab-manager-button`, so the compound check walked over nothing'
  );

  // Code point, not `localeCompare`, for the reason `sourceScan.js` gives: locale-dependent
  // ordering would make one corpus compare in two orders on two machines.
  assert.deepEqual(
    violations.sort((left, right) => (left === right ? 0 : left < right ? -1 : 1)),
    [],
    'these rules select a class that only a `<ManagerButton>` carries, so they match NOTHING ' +
      'and the control is silently unstyled — either emitted with this component`s scoping ' +
      'class attached, or pruned by the compiler before they were emitted at all. Wrap each ' +
      'in `:global(...)` — and chain the primitive`s classes while you are there, because a ' +
      '`:global` rule at (0,2,0) then loses to the primitive on specificity — or hoist the ' +
      'rule into `styles/fabricate.css`, which is the right answer when two components ' +
      'declare the same one:\n  ' +
      violations.join('\n  ')
  );
});
