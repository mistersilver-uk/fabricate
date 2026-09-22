/**
 * A rendered region's DOM as one line per element, and the sentinel-delimited literal a suite pins
 * it in (issue 1717, shared by the rail and page-header censuses since issue 1720).
 *
 * The defect a hand-split component produces is a correctly-shaped element fed the wrong prop, so
 * the census pins every element's tag, nesting depth, own text and every attribute name and value.
 * Attribute order is deliberately not pinned: it is a compiler artefact of which attributes are
 * static, and nothing rendered, styled, announced or serialised reads it.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { byCodePoint } from './ratchetBaseline.js';

// Built from a token so a suite's own marks are not themselves a match: the writer rewrites the
// first region it finds, and a literal sentinel in the suite's source would be that region.
const censusMark = (name, edge) => `/* ${name}-census:${edge} */`;

/** One element as `{ tag, attrs, text }`: every attribute name and value, and its own text. */
function censusRecord(element) {
  return {
    tag: element.tagName.toLowerCase(),
    attrs: Object.fromEntries([...element.attributes].map((a) => [a.name, a.value])),
    text: [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent)
      .join('')
      .replace(/\s+/g, ' ')
      .trim(),
  };
}

/**
 * The one record builder every pinned literal is emitted from: the record as a single line, so
 * many states of a large region stay inside one screen of diff and repeat no markup. Attributes
 * are sorted by name, exactly as the `deepEqual` over `Object.fromEntries` this serialises is
 * key-order-insensitive.
 */
function censusLine(element) {
  const { tag, attrs, text } = censusRecord(element);
  const written = Object.entries(attrs)
    .sort(([left], [right]) => byCodePoint(left, right))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`);
  return [tag, ...written, ...(text ? [`| ${text}`] : [])].join(' ');
}

/**
 * Each further state is pinned as its difference from the baseline, because most states of one
 * region are overwhelmingly the same rows: stating only what moved is both the clearer claim and
 * the one that does not multiply the pinned text. `-` is a row the baseline has and this state
 * does not; `+` the reverse.
 */
export function censusDelta(base, next) {
  const common = Array.from({ length: base.length + 1 }, () => new Array(next.length + 1).fill(0));
  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = next.length - 1; j >= 0; j -= 1) {
      common[i][j] =
        base[i] === next[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const delta = [];
  let i = 0;
  let j = 0;
  while (i < base.length && j < next.length) {
    if (base[i] === next[j]) {
      i += 1;
      j += 1;
    } else if (common[i + 1][j] >= common[i][j + 1]) {
      delta.push(`- ${base[i]}`);
      i += 1;
    } else {
      delta.push(`+ ${next[j]}`);
      j += 1;
    }
  }
  return [
    ...delta,
    ...base.slice(i).map((row) => `- ${row}`),
    ...next.slice(j).map((row) => `+ ${row}`),
  ];
}

function censusDepth(element, root) {
  let depth = 0;
  for (let node = element; node && node !== root; node = node.parentElement) depth += 1;
  return depth;
}

/**
 * Every element of `root`, itself included, depth-prefixed and in document order. Document order
 * survives lifting an element out of its parent into the parent's own position — the characteristic
 * defect of a markup split — and the depth prefix is what makes the record a tree rather than a
 * sequence. Comment and anchor nodes are outside the walk by construction, so the anchors a split
 * `{#if}` chain compiles to cannot move a row.
 */
export function censusOf(root) {
  return [root, ...root.querySelectorAll('*')].map(
    (element) => `${censusDepth(element, root)} ${censusLine(element)}`
  );
}

/** Rewrite the sentinel-delimited literal in place, so it stays derived rather than hand-edited. */
export function writeCensus(file, name, observed) {
  const source = readFileSync(file, 'utf8');
  const open = source.indexOf(censusMark(name, 'start'));
  const close = source.indexOf(censusMark(name, 'end'));
  assert.ok(open >= 0 && close > open, 'the census literal lost its sentinels');
  const rowsOf = (lines, indent) =>
    lines.map((line) => `${indent}${JSON.stringify(line)},`).join('\n');
  const deltas = Object.entries(observed.deltas)
    .map(([state, lines]) => `    ${JSON.stringify(state)}: [\n${rowsOf(lines, '      ')}\n    ],`)
    .join('\n');
  const body = `  base: [\n${rowsOf(observed.base, '    ')}\n  ],\n  deltas: {\n${deltas}\n  },`;
  writeFileSync(
    file,
    `${source.slice(0, open + censusMark(name, 'start').length)}\n${body}\n  ${source.slice(close)}`
  );
}
