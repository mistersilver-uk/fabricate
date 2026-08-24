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
 *  - The compiler emits NO `css_unused_selector` warning, because the class literal is right
 *    there in the markup on the component tag. `lint:svelte:warnings` therefore passes.
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
 * ── WHAT THIS ASSERTS ────────────────────────────────────────────────────────────────────
 * For every class token a `.svelte` under `src/` hands to a `<ManagerButton>` through the
 * appending `class` prop, no rule in that component's own compiled CSS may select that token
 * with the component's scoping class attached. `:global(...)` is the fix and passes here,
 * because a `:global` rule compiles without the hash.
 *
 * The check is run against the REAL compiler output rather than a hand-parse of the `<style>`
 * block, so `:global()` nesting, selector rewriting and the hash's exact placement are the
 * compiler's answers and not this file's guesses.
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

/** A component's compiled CSS with comments blanked, so prose cannot be read as a selector. */
function compiledCss(file, source) {
  const emitted = compile(source, {
    filename: join(repoRoot, file),
    css: 'external',
    generate: 'client',
  });
  return (emitted.css?.code ?? '').replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
}

test('no component scopes a rule onto a class it hands to a ManagerButton', () => {
  const violations = [];
  let sitesScanned = 0;
  let componentsWithScopedCss = 0;

  for (const file of svelteFiles()) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const tokens = managerButtonClassTokens(source);
    if (tokens.size === 0) continue;
    sitesScanned += tokens.size;

    const css = compiledCss(file, source);
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

  // Code point, not `localeCompare`, for the reason `sourceScan.js` gives: locale-dependent
  // ordering would make one corpus compare in two orders on two machines.
  assert.deepEqual(
    violations.sort((left, right) => (left === right ? 0 : left < right ? -1 : 1)),
    [],
    'these rules carry their component`s scoping class but select a class that only a ' +
      '<ManagerButton> carries, so they match NOTHING and the control is silently unstyled. ' +
      'Wrap each in `:global(...)` — and chain the primitive`s classes while you are there, ' +
      'because a `:global` rule at (0,2,0) then loses to the primitive on specificity:\n  ' +
      violations.join('\n  ')
  );
});
