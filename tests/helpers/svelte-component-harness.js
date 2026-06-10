// Shared harness for mounted Svelte component tests. Compiling each `.svelte`
// into a temp dir and rewriting its client imports is identical across every
// component test, so it lives here rather than being copy-pasted per file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'svelte/compiler';

/**
 * Rewrite a compiled component's imports so they resolve against the temp dir:
 * point bare `svelte` at the client runtime and append `.js` to `.svelte`
 * specifiers (the temp dir holds the compiled `.svelte.js` siblings).
 */
export function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

/**
 * Install the minimal Foundry/DOM globals that mounted component tests rely on.
 * Call after `setupDOM()` so `document` exists.
 */
export function installComponentTestGlobals() {
  globalThis.Text = document.createTextNode('').constructor;
  globalThis.Comment = document.createComment('').constructor;
  globalThis.game = {
    i18n: {
      localize: (key) => key,
      format: (key, data) => `${key}:${JSON.stringify(data)}`
    }
  };
}

/**
 * Build the compile/write helpers bound to a repo root and a (lazily read) temp
 * dir. `getTempRoot` is a thunk so callers can declare the temp dir up front and
 * assign it inside `before()`.
 *
 * @param {string} repoRoot
 * @param {() => string} getTempRoot
 */
export function createSvelteCompiler(repoRoot, getTempRoot) {
  function writeCompiledSvelte(sourcePath) {
    const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
    const compiled = compile(source, { filename: sourcePath, generate: 'client', dev: true, css: 'injected' });
    const destination = join(getTempRoot(), `${sourcePath}.js`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, rewriteClientImports(compiled.js.code));
  }

  function writeRawModule(modulePath) {
    const destination = join(getTempRoot(), modulePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(resolve(repoRoot, modulePath), 'utf8'));
  }

  return { writeCompiledSvelte, writeRawModule };
}
