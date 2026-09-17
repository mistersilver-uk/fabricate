/**
 * One definition of "compile a component the way this repository builds it", and one definition of
 * "the warnings that come back".
 */
import { compile } from 'svelte/compiler';

import svelteConfig from '../../svelte.config.js';

/** The compiler options the real build uses, read from `svelte.config.js` rather than restated. */
export const BUILD_COMPILER_OPTIONS = Object.freeze({
  generate: 'client',
  dev: false,
  ...svelteConfig.compilerOptions,
});

/** Compile one component with the build's options. */
export function compileComponent(source, filename, overrides = {}) {
  return compile(source, { ...BUILD_COMPILER_OPTIONS, ...overrides, filename });
}

/** One warning, flattened to the fields a report needs. */
function describeWarning(file, warning) {
  return {
    file,
    code: warning.code,
    // The compiler appends a docs URL on its own line; the report prints one line per warning.
    message: String(warning.message ?? '').split('\n', 1)[0],
    line: warning.start?.line ?? null,
    column: warning.start?.column ?? null,
  };
}

/** Every warning the compiler reports across `files`, in file order. */
export function scanComponentWarnings({ files, readSource }) {
  const warnings = [];
  for (const file of files) {
    let result;
    try {
      result = compileComponent(readSource(file), file);
    } catch (error) {
      warnings.push({
        file,
        code: 'compile_error',
        message: error.message,
        line: null,
        column: null,
      });
      continue;
    }
    for (const warning of result.warnings) warnings.push(describeWarning(file, warning));
  }
  return { files: files.length, warnings };
}

/**
 * The summary line, deliberately byte-identical in shape to the one
 * `scripts/compare-svelte-render.mjs` prints, so two runs can be diffed against each other
 * without reading past the first line of either.
 */
export function formatWarningSummary({ files, warnings }) {
  return `svelte_compiler_warnings=${warnings.length} over ${files} files`;
}

/** One warning as a single report line. */
export function formatWarning(warning) {
  const position = warning.line === null ? '' : `:${warning.line}:${warning.column}`;
  return `  ${warning.file}${position} [${warning.code}] ${warning.message}`;
}
