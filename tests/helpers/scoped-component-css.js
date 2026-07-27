/*
 * Scoped-component CSS for the real-browser computed-CSS gates (issue 883).
 *
 * The font-size gates render RAW HTML against `styles/fabricate.css` in Chromium, because
 * happy-dom cannot compute a cascade. That worked while every manager rule lived in the
 * global sheet. It stops working the moment a shared primitive owns its appearance in a
 * scoped `<style>`: the fixture's elements match nothing, the role falls back to Foundry's
 * 14px app base, and the gate's own anti-bleed assertion fires.
 *
 * Deleting those roles from the gate would "fix" it by removing the only real-browser
 * coverage the repo has for the primitive — and that coverage is precisely what catches
 * the hazard scoped styles introduce. Svelte compiles `.manager-chip` to
 * `.manager-chip.svelte-<hash>`, TWO classes, and `css: 'injected'` (svelte.config.js) puts
 * it in `document.head` AFTER Foundry's `<link>` for the global sheet. A global rule at two
 * classes therefore TIES and loses on source order, silently.
 *
 * So the gate keeps the coverage instead: compile the component, take its real scoped CSS,
 * append it after the global sheet (matching injection order) and stamp the real hash class
 * onto the fixture's elements (matching specificity). Both halves are needed — appending the
 * CSS without the hash class would make the rules match nothing, and adding the hash class
 * without the real ordering would prove the wrong winner.
 */
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

/**
 * Compiles a `.svelte` file and returns its scoped CSS with the hash class Svelte generated.
 *
 * @param {string} componentPath absolute path to the component
 * @returns {{ css: string, hashClass: string }} the emitted CSS and its `svelte-<hash>` class
 */
export function scopedComponentCss(componentPath) {
  const source = readFileSync(componentPath, 'utf8');
  const { css } = compile(source, { filename: componentPath, css: 'external' });
  const code = css?.code || '';
  const hashClass = code.match(/\.(svelte-[a-z0-9]+)\b/)?.[1] || '';
  if (!code || !hashClass) {
    throw new Error(`${componentPath} emitted no scoped CSS — the gate would prove nothing`);
  }
  return { css: code, hashClass };
}

/**
 * Adds the scoping hash to every element in a fixture carrying `className`, so the fixture's
 * specificity matches what Svelte actually renders.
 *
 * @param {string} fixture the fixture HTML
 * @param {string} className the primitive's contract class, e.g. `manager-chip`
 * @param {string} hashClass the `svelte-<hash>` class from {@link scopedComponentCss}
 * @returns {string} the fixture with the hash applied
 */
export function withScopeHash(fixture, className, hashClass) {
  // Only `class="…"` attributes that carry the contract class as a whole token, so
  // `manager-chip-row` (a container, not a chip) is left alone.
  return fixture.replace(/class="([^"]*)"/g, (whole, value) =>
    value.split(/\s+/).includes(className) ? `class="${value} ${hashClass}"` : whole
  );
}
