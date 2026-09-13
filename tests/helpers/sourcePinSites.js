/**
 * Count the source-text pin sites in one test module (issue 1658). Proved from inside the
 * `npm test` glob by `tests/source-pin-ratchet.test.js`.
 *
 * A site is an AST CALL NODE, never a line match, and that is what makes the gate countable at
 * all: a pattern written as a string or regex literal is a `Literal` rather than a
 * `CallExpression`, and a token in a docblock is not a node, so this file and the ratchet's own
 * file count their true call sites even though both spell the tokens they hunt.
 *
 * The matchers counted are `includes`, `assert.match` and a regex `test`, which are the three ways
 * this suite asserts the shape of source text.
 *
 * Bindings resolve through the SCOPE MANAGER, not by name: two functions in one file may both bind
 * `source`, one from a read of `src/` and one from joining rows.
 *
 * READS RESOLVE THROUGH LOCAL WRAPPERS, because the commonest shape here is a one-line `read()`
 * that calls `readFileSync`. A closed set of reader names both missed those pins and mis-filed the
 * binding as a path — measured at 303 sites across 19 files.
 *
 * MEASURED RESIDUE, deliberately uncounted: text a helper returns that its caller matches inline.
 */
import { calledName, identifierNames, literalStrings, walkNodes } from './moduleAst.js';

/** The reads that bring `src/` text into a test, before local wrappers are added per module. */
const BASE_READERS = Object.freeze([
  'readFileSync',
  'readFile',
  'collectSources',
  'collectWorkingTreeSources',
]);

/** `path.join(repoRoot, 'src')` spells the root without a separator, and is the commonest form. */
const SRC_ROOTS = Object.freeze(['src', 'src/']);

const FUNCTION_TYPES = Object.freeze([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const spellsSrcPath = (node) =>
  literalStrings(node).some((text) => text.includes('src/') || SRC_ROOTS.includes(text));

const isReader = (node, readers) =>
  node?.type === 'CallExpression' && readers.has(calledName(node));

/** The name a function is bound to, whether declared or assigned to a `const`. */
function boundFunctionName(node, assignedNames) {
  return node.id?.name ?? assignedNames.get(node);
}

/** Names bound to a function expression, which the AST does not record on the function itself. */
function functionAssignments(ast) {
  const assigned = new Map();
  for (const node of walkNodes(ast)) {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier') continue;
    if (node.init && FUNCTION_TYPES.includes(node.init.type)) assigned.set(node.init, node.id.name);
  }
  return assigned;
}

const callsAReader = (node, readers) =>
  [...walkNodes(node)].some((inner) => isReader(inner, readers));

/**
 * Names this module can read a file through: the base readers plus any local function whose body
 * calls one, resolved to a fixpoint so a wrapper around a wrapper still counts.
 */
function readerNames(ast) {
  const assigned = functionAssignments(ast);
  const names = new Set(BASE_READERS);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of walkNodes(ast)) {
      if (!FUNCTION_TYPES.includes(node.type)) continue;
      const bound = boundFunctionName(node, assigned);
      if (!bound || names.has(bound) || !callsAReader(node.body, names)) continue;
      names.add(bound);
      grew = true;
    }
  }
  return names;
}

/** Map every declaration and reference to the variable it binds, so names cannot be conflated. */
function variableIndex(scopeManager) {
  const index = new Map();
  for (const scope of scopeManager?.scopes ?? []) {
    for (const variable of scope.variables) {
      for (const definition of variable.defs) {
        if (definition.name) index.set(definition.name, variable);
      }
      for (const reference of variable.references) index.set(reference.identifier, variable);
    }
  }
  return index;
}

/** Whether any identifier in a subtree resolves to a key already in `known`. */
function referencesKnown(node, known, keyFor, seedPaths) {
  for (const inner of walkNodes(node)) {
    if (inner.type !== 'Identifier') continue;
    if (known.has(keyFor(inner))) return true;
    if (seedPaths.has(inner.name) && known.has(inner.name)) return true;
  }
  return false;
}

/**
 * Whether a read call names a `src/` path directly or through a path binding.
 *
 * `seedPaths` is honoured while RESOLVING a binding but not when scoring the read itself: a seeded
 * name is a claim about another module, and letting it score a call site directly counted reads of
 * `lang/` and `scripts/` as source. The two call sites pass `seedPaths` accordingly.
 */
const readsSrc = (call, paths, keyFor, seedPaths) =>
  spellsSrcPath(call) ||
  call.arguments.some((argument) => referencesKnown(argument, paths, keyFor, seedPaths));

/**
 * Classify one declaration: a PATH binding spells a `src/` path without reading it, and a SOURCE
 * binding holds text a reader returned. A binding whose initialiser CALLS a reader is a source
 * even when it also spells the path, which is the case a path-first rule mis-files.
 */
function classifyDeclaration(declaration, context) {
  const { readers, paths, sources, keyFor, seedPaths } = context;
  const reads = [...walkNodes(declaration.init)].filter((node) => isReader(node, readers));
  // The two are computed independently rather than as an either/or: a binding that spells a path
  // and is later found to derive from a source is both, and collapsing them moves real counts.
  const path = reads.length === 0 && spellsSrcPath(declaration.init);
  const source =
    reads.some((read) => readsSrc(read, paths, keyFor, seedPaths)) ||
    (reads.length > 0 && spellsSrcPath(declaration.init)) ||
    referencesKnown(declaration.init, sources, keyFor, seedPaths);
  return { path, source };
}

function resolveBindings(ast, scopeManager, readers, seedPaths) {
  const index = variableIndex(scopeManager);
  const keyFor = (node) => index.get(node) ?? node?.name;
  const declarations = [...walkNodes(ast)].filter(
    (node) => node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init
  );
  const paths = new Set(seedPaths);
  const sources = new Set();
  const context = { readers, paths, sources, keyFor, seedPaths };
  // Monotone over a finite set of declarations, so this terminates on its own; a fixed pass bound
  // would only turn a long binding chain into a silent under-count.
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      const key = keyFor(declaration.id);
      if (paths.has(key) && sources.has(key)) continue;
      const { path, source } = classifyDeclaration(declaration, context);
      if (path && !paths.has(key)) {
        paths.add(key);
        grew = true;
      }
      if (source && !sources.has(key)) {
        sources.add(key);
        grew = true;
      }
    }
  }
  return { paths, sources, keyFor };
}

/** The identifier a call's receiver is reached through, so `byFile[path]` resolves to `byFile`. */
function receiverNode(node) {
  let object = node.callee?.type === 'MemberExpression' ? node.callee.object : undefined;
  while (object?.type === 'MemberExpression') object = object.object;
  return object?.type === 'Identifier' ? object : undefined;
}

const matchesLiteral = (node) => {
  const [first] = node.arguments;
  return (
    first?.type === 'TemplateLiteral' ||
    (first?.type === 'Literal' && typeof first.value === 'string')
  );
};

/** Every name bound as a function parameter anywhere in the module. */
function parameterNames(ast) {
  const names = new Set();
  for (const node of walkNodes(ast)) {
    if (!FUNCTION_TYPES.includes(node.type)) continue;
    for (const parameter of node.params ?? []) {
      for (const name of identifierNames(parameter)) names.add(name);
    }
  }
  return names;
}

/** Whether this call asserts the shape of source text, and so is one pin site. */
function isPinSite(node, context) {
  const { readers, paths, sources, keyFor, parameters } = context;
  if (isReader(node, readers)) return readsSrc(node, paths, keyFor, new Set());
  const called = calledName(node);
  const receiver = receiverNode(node);
  // `assert.match(source, /x/)` and `/x/.test(source)` take the text as an argument, not a receiver.
  if ((called === 'match' && receiver?.name === 'assert') || called === 'test') {
    const [subject] = node.arguments;
    return subject?.type === 'Identifier' && sources.has(keyFor(subject));
  }
  if (called !== 'includes' || receiver === undefined) return false;
  // A resolved source binding is pin enough whatever the needle: a pin whose argument is a loop
  // variable is still a pin, and requiring a literal would let one be hidden by hoisting it.
  if (sources.has(keyFor(receiver))) return true;
  // A parameter is reached without resolving to a read, so it needs a literal needle to stay clear
  // of ordinary membership checks, and only counts where scanning handed-in source is the job.
  return matchesLiteral(node) && parameters.has(receiver.name);
}

/**
 * @param {object} ast A module AST from `parseModule`.
 * @param {{file?: string, scopeManager?: object, seedPaths?: Set<string>}} options `file` decides
 *   whether a parameter the module was handed counts as source it is pinning; `seedPaths` names the
 *   `src/` path constants this module imports.
 * @returns {number}
 */
export function countPinSites(ast, { file = '', scopeManager, seedPaths = new Set() } = {}) {
  const readers = readerNames(ast);
  const { paths, sources, keyFor } = resolveBindings(ast, scopeManager, readers, seedPaths);
  // Counted everywhere, the parameter shape sweeps up ordinary array membership in behavioural
  // tests: 425 sites across 94 files, against 11 under `tests/helpers/`.
  const parameters = file.startsWith('tests/helpers/') ? parameterNames(ast) : new Set();
  const context = { readers, paths, sources, keyFor, seedPaths, parameters };
  let sites = 0;
  for (const node of walkNodes(ast)) {
    if (node.type === 'CallExpression' && isPinSite(node, context)) sites += 1;
  }
  return sites;
}
