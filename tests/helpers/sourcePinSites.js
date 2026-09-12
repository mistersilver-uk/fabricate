/**
 * Count the source-text pin sites in one test module (issue 1658). Proved from inside the
 * `npm test` glob by `tests/source-pin-ratchet.test.js`.
 *
 * A site is an AST CALL NODE, never a line match, and that is what makes the gate countable at all:
 * a pattern written as a string or regex literal is a `Literal` rather than a `CallExpression`, and
 * a token in a docblock is not a node, so this file and the ratchet's own file count their true
 * call sites even though both spell the tokens they hunt.
 *
 * A line-based definition was measured and rejected: the canonical read puts its path on its own
 * line, so a same-line rule finds 67 of 1,042; `assert.match` is overwhelmingly DOM text; and
 * counting an assertion and the call inside it double-counts one pin.
 */
import { calledName, identifierNames, literalStrings, walkNodes } from './moduleAst.js';

/** The reads that bring `src/` text into a test. */
const READERS = Object.freeze(new Set(['readFileSync', 'readFile']));

/** A binding chain converges well inside this; the bound is only so a cycle cannot hang the gate. */
const RESOLUTION_PASSES = 6;

const isReader = (node) => node?.type === 'CallExpression' && READERS.has(calledName(node));

const spellsSrcPath = (node) => literalStrings(node).some((text) => text.includes('src/'));

/**
 * Two binding sets, resolved together to a fixpoint: a PATH binding spells a `src/` path without
 * reading it, and a SOURCE binding holds text read through one. Both are needed because the
 * canonical form separates them — `const p = resolve(..., 'src/x.svelte')` then
 * `const xSource = readFileSync(p, 'utf8')` — so a rule keyed on a literal inside the read call
 * misses the pins that matter. A source binding also propagates through derivation, so a
 * `.join('\n')` of several reads stays a source.
 */
function resolveBindings(ast) {
  const declarations = [];
  for (const node of walkNodes(ast)) {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      declarations.push(node);
    }
  }
  const paths = new Set();
  const sources = new Set();
  for (let pass = 0; pass < RESOLUTION_PASSES; pass += 1) {
    let grew = false;
    for (const declaration of declarations) {
      const name = declaration.id.name;
      const reads = [...walkNodes(declaration.init)].filter(isReader);
      if (!paths.has(name) && reads.length === 0 && spellsSrcPath(declaration.init)) {
        paths.add(name);
        grew = true;
      }
      if (sources.has(name)) continue;
      let isSource = reads.some(
        (read) =>
          spellsSrcPath(read) ||
          read.arguments.some((argument) =>
            [...identifierNames(argument)].some((identifier) => paths.has(identifier))
          )
      );
      if (!isSource) {
        isSource = [...identifierNames(declaration.init)].some((identifier) =>
          sources.has(identifier)
        );
      }
      if (isSource) {
        sources.add(name);
        grew = true;
      }
    }
    if (!grew) break;
  }
  return { paths, sources };
}

const receiverName = (node) =>
  node.callee?.type === 'MemberExpression' && node.callee.object?.type === 'Identifier'
    ? node.callee.object.name
    : undefined;

/**
 * @param {object} ast A module AST from `parseModule`.
 * @returns {number} Pin sites: a read of a `src/` path, an `includes` on text so read, or an
 *   `assert.match` against it.
 */
export function countPinSites(ast) {
  const { paths, sources } = resolveBindings(ast);
  let sites = 0;
  for (const node of walkNodes(ast)) {
    if (node.type !== 'CallExpression') continue;
    const called = calledName(node);
    const receiver = receiverName(node);
    if (
      isReader(node) &&
      (spellsSrcPath(node) ||
        node.arguments.some((argument) =>
          [...identifierNames(argument)].some((identifier) => paths.has(identifier))
        ))
    ) {
      sites += 1;
      continue;
    }
    if (called === 'includes' && receiver !== undefined && sources.has(receiver)) {
      sites += 1;
      continue;
    }
    if (called === 'match' && receiver === 'assert') {
      const subject = node.arguments[0];
      if (subject?.type === 'Identifier' && sources.has(subject.name)) sites += 1;
    }
  }
  return sites;
}
