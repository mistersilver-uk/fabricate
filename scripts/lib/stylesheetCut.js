/**
 * The module sheet's contiguous partition into partials (issue 1711, D3): each partial starts at an
 * anchor that must match exactly one top-level line, and a cut not on a top-level rule boundary
 * throws. A comment anchor cuts at the first line of its comment block.
 */

/** `text` is a whole trimmed line for a `rule` anchor, and a substring for a `comment` anchor. */
export const STYLESHEET_CUT = Object.freeze([
  { partial: 'fabricate-tokens.css', kind: 'start' },
  { partial: 'fabricate-base.css', kind: 'comment', text: 'Every Fabricate window' },
  { partial: 'fabricate-manager-shell.css', kind: 'comment', text: 'Crafting System Manager' },
  {
    partial: 'fabricate-manager-checks-modifiers.css',
    kind: 'rule',
    text: '.fabricate-manager .manager-checks-page {',
  },
  {
    partial: 'fabricate-list-primitives.css',
    kind: 'comment',
    text: 'THE VISUALLY-HIDDEN UTILITY',
  },
  {
    partial: 'fabricate-manager-library.css',
    kind: 'rule',
    text: '.fabricate-manager .manager-table-scroll {',
  },
  {
    partial: 'fabricate-manager-recipe-editor.css',
    kind: 'rule',
    text: '.fabricate-manager .manager-recipe-steps-requirements {',
  },
  {
    partial: 'fabricate-manager-rail-gathering.css',
    kind: 'rule',
    text: '.fabricate-nav.manager-nav,',
  },
  {
    partial: 'fabricate-manager-responsive.css',
    kind: 'rule',
    text: '@container fabricate-manager (max-width: 1320px) {',
  },
  {
    partial: 'fabricate-manager-tools-environments.css',
    kind: 'comment',
    text: 'Manager — Tool Studio editor',
  },
  {
    partial: 'fabricate-chat-dialogs.css',
    kind: 'comment',
    text: 'Gathering + crafting result chat cards',
  },
  { partial: 'fabricate-manager-travel.css', kind: 'comment', text: 'GM Travel route' },
  { partial: 'fabricate-select.css', kind: 'comment', text: "THE APP'S ONE SELECT" },
  {
    partial: 'fabricate-manager-knowledge-components.css',
    kind: 'comment',
    text: 'Manager — Tool Studio library',
  },
]);

/** The scanner state after `char`, whose successor is `next`; `skip` consumes `next` too. */
function step(state, char, next) {
  if (state.inComment) {
    return char === '*' && next === '/' ? { ...state, inComment: false, skip: true } : state;
  }
  if (state.quote) {
    if (char === '\\') return { ...state, skip: true };
    return char === state.quote ? { ...state, quote: null } : state;
  }
  if (char === '/' && next === '*') return { ...state, inComment: true, skip: true };
  if (char === '"' || char === "'") return { ...state, quote: char };
  const delta = { '{': 1, '}': -1 }[char] ?? 0;
  return delta === 0 ? state : { ...state, depth: state.depth + delta };
}

/** Each line's state at its start: brace depth, and whether it opens inside a comment. */
function lineStates(lines) {
  const states = [];
  let state = { depth: 0, inComment: false, quote: null, skip: false };
  for (const line of lines) {
    states.push({ depth: state.depth, inComment: state.inComment });
    let index = 0;
    while (index < line.length) {
      state = step(state, line[index], line[index + 1]);
      index += state.skip ? 2 : 1;
      state = { ...state, skip: false };
    }
    state = { ...state, quote: null };
  }
  return states;
}

const isComment = (line, state) => state.inComment || line.trim().startsWith('/*');

/** The 0-based first line of the comment block holding `index`: blanks and comments above it. */
function bannerStart(lines, states, index) {
  let start = index;
  for (let above = index - 1; above >= 0; above -= 1) {
    if (lines[above].trim() === '') continue;
    if (!isComment(lines[above], states[above])) break;
    start = above;
  }
  return start;
}

function anchorLine(lines, states, { partial, kind, text }) {
  const matches = lines.flatMap((line, index) => {
    if (states[index].depth !== 0) return [];
    const hit = kind === 'rule' ? line.trim() === text : line.includes(text);
    const right =
      kind === 'rule' ? !isComment(line, states[index]) : isComment(line, states[index]);
    return hit && right ? [index] : [];
  });
  if (matches.length !== 1) {
    const where = matches.map((index) => index + 1).join(', ') || 'none';
    throw new Error(`${partial}: "${text}" must match one top-level line; matched ${where}`);
  }
  return kind === 'comment' ? bannerStart(lines, states, matches[0]) : matches[0];
}

function assertTopLevelCut(lines, states, index, partial) {
  const previous = lines.slice(0, index).findLast((line) => line.trim() !== '');
  const atBoundary = previous === undefined || /[};]\s*$|\*\/\s*$/u.test(previous);
  if (states[index].depth !== 0 || states[index].inComment || !atBoundary) {
    throw new Error(`${partial}: the cut at line ${index + 1} is not on a top-level rule boundary`);
  }
}

/**
 * The partition of `text` by `table`, as `[{partial, startLine, text}]` in order; joined, the
 * parts are `text` byte for byte.
 */
export function cutStylesheet(text, table = STYLESHEET_CUT) {
  const lines = text.split('\n');
  const states = lineStates(lines);
  const starts = table.map((row) => {
    const index = row.kind === 'start' ? 0 : anchorLine(lines, states, row);
    assertTopLevelCut(lines, states, index, row.partial);
    return index;
  });
  for (let at = 1; at < starts.length; at += 1) {
    if (starts[at] <= starts[at - 1]) {
      throw new Error(`${table[at].partial} starts before ${table[at - 1].partial} ends`);
    }
  }
  const offsets = [];
  for (let index = 0, offset = 0; index < lines.length; index += 1) {
    offsets.push(offset);
    offset += lines[index].length + 1;
  }
  return table.map((row, at) => ({
    partial: row.partial,
    startLine: starts[at] + 1,
    text: text.slice(offsets[starts[at]], offsets[starts[at + 1]] ?? text.length),
  }));
}

/** The entry that imports `parts` in order. */
export function stylesheetEntry(parts) {
  return parts.map(({ partial }) => `@import url("${partial}");\n`).join('');
}
