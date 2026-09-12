/**
 * Count the source-text pin sites in one test module (issue 1658). Proved from inside the
 * `npm test` glob by `tests/source-pin-ratchet.test.js`.
 *
 * A site is an AST CALL NODE, never a line match, and that is what makes the gate countable at
 * all: a pattern written as a string or regex literal is a `Literal` rather than a
 * `CallExpression`, and a token in a docblock is not a node, so this file and the ratchet's own
 * file count their true call sites even though both spell the tokens they hunt.
 *
 * Bindings resolve through the SCOPE MANAGER, not by name. Two functions in one file may both
 * bind `source`, one from a read of `src/` and one from joining rows; matching on the name alone
 * attributes the second to the first.
 *
 * READS ARE RESOLVED THROUGH LOCAL WRAPPERS. The commonest shape here is a one-line `read()` that
 * calls `readFileSync`, so a closed set of reader names both misses those pins and mis-files the
 * binding as a path — measured at 303 sites across 19 files before this resolved them.
 *
 * A PATH CONSTANT IMPORTED FROM ANOTHER MODULE is resolved too, through `seedPaths`: the caller
 * supplies the names this module imports that are known `src/` path constants, because a helper
 * exporting one is a recurring shape and the read through it would otherwise count nothing.
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

/**
 * Names this module can read a file through: the base readers plus any local function whose body
 * calls one. `function read(p) { return readFileSync(p, 'utf8'); }` is a reader.
 */
function readerNames(ast) {
  const names = new Set(BASE_READERS);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const node of walkNodes(ast)) {
      if (!FUNCTION_TYPES.includes(node.type)) continue;
      const bound =
        node.id?.name ??
        (node.parent?.type === 'VariableDeclarator' && node.parent.id?.type === 'Identifier'
          ? node.parent.id.name
          : undefined);
      if (!bound || names.has(bound)) continue;
      for (const inner of walkNodes(node.body)) {
        if (inner.type === 'CallExpression' && names.has(calledName(inner))) {
          names.add(bound);
          break;
        }
      }
    }
  }
  return names;
}

/** Bind a function expression to the declarator name it is assigned to, which the AST omits. */
function namedFunctionBindings(ast) {
  const named = new Map();
  for (const node of walkNodes(ast)) {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier') continue;
    if (node.init && FUNCTION_TYPES.includes(node.init.type)) named.set(node.init, node.id.name);
  }
  return named;
}

const isReader = (node, readers) =>
  node?.type === 'CallExpression' && readers.has(calledName(node));

/**
 * Two sets resolved together to a fixpoint: a PATH binding spells a `src/` path without reading
 * it, and a SOURCE binding holds text a reader returned. A binding whose initialiser CALLS a
 * reader is a source even when it also spells the path, which is the case a path-first rule
 * mis-files.
 */
function resolveBindings(ast, scopeManager, readers, seedPaths = new Set()) {
  const declarations = [];
  for (const node of walkNodes(ast)) {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      declarations.push(node);
    }
  }
  // Resolve every reference to the variable it actually binds, so two `source` declarations in
  // different functions stay apart. `variableFor` maps both a declarator's own id node and every
  // later reference to one variable object, which is what the sets below hold.
  const variableFor = new Map();
  for (const scope of scopeManager?.scopes ?? []) {
    for (const variable of scope.variables) {
      for (const definition of variable.defs) {
        if (definition.name) variableFor.set(definition.name, variable);
      }
      for (const reference of variable.references) variableFor.set(reference.identifier, variable);
    }
  }
  const keyFor = (node) => variableFor.get(node) ?? node?.name;
  const paths = new Set(seedPaths);
  const sources = new Set();
  // A seeded name is matched by text as well as by variable, because an imported binding's
  // declaration lives in the module it came from.
  const referencedKeys = (node) => {
    const keys = new Set();
    for (const inner of walkNodes(node)) {
      if (inner.type !== 'Identifier') continue;
      keys.add(keyFor(inner));
      if (seedPaths.has(inner.name)) keys.add(inner.name);
    }
    return keys;
  };
  // Monotone over a finite set of declarator names, so this terminates on its own.
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      const key = keyFor(declaration.id);
      const reads = [...walkNodes(declaration.init)].filter((node) => isReader(node, readers));
      if (!paths.has(key) && reads.length === 0 && spellsSrcPath(declaration.init)) {
        paths.add(key);
        grew = true;
      }
      if (sources.has(key)) continue;
      let isSource = reads.some(
        (read) =>
          spellsSrcPath(read) ||
          read.arguments.some((argument) =>
            [...referencedKeys(argument)].some((referenced) => paths.has(referenced))
          )
      );
      if (!isSource && reads.length > 0 && spellsSrcPath(declaration.init)) isSource = true;
      if (!isSource) {
        isSource = [...referencedKeys(declaration.init)].some((referenced) =>
          sources.has(referenced)
        );
      }
      if (isSource) {
        sources.add(key);
        grew = true;
      }
    }
  }
  return { paths, sources, keyFor };
}

/**
 * The identifier a call's receiver is ultimately reached through, so `holder.source.includes(...)`
 * and `byFile[path].includes(...)` resolve to `holder` and `byFile` rather than to nothing.
 */
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

/**
 * @param {object} ast A module AST from `parseModule`.
 * @param {{file?: string}} options The repo-relative path, which decides whether a parameter the
 *   module was handed counts as source it is pinning.
 * @returns {number}
 */
export function countPinSites(ast, { file = '', scopeManager, seedPaths = new Set() } = {}) {
  const named = namedFunctionBindings(ast);
  for (const [node, name] of named)
    node.parent = { type: 'VariableDeclarator', id: { type: 'Identifier', name } };
  const readers = readerNames(ast);
  const { paths, sources, keyFor } = resolveBindings(ast, scopeManager, readers, seedPaths);
  // A helper handed source text pins it through a parameter, never through a binding it read.
  // Counted everywhere, that shape sweeps up ordinary array membership in behavioural tests:
  // 425 sites across 94 files, against 11 under `tests/helpers/`.
  const scansHandedSource = file.startsWith('tests/helpers/');
  const parameters = scansHandedSource ? parameterNames(ast) : new Set();
  let sites = 0;
  for (const node of walkNodes(ast)) {
    if (node.type !== 'CallExpression') continue;
    const called = calledName(node);
    const receiverIdentifier = receiverNode(node);
    const receiver = receiverIdentifier ? keyFor(receiverIdentifier) : undefined;
    const receiverText = receiverIdentifier?.name;
    if (
      isReader(node, readers) &&
      (spellsSrcPath(node) ||
        node.arguments.some((argument) =>
          [...walkNodes(argument)].some(
            (inner) => inner.type === 'Identifier' && paths.has(keyFor(inner))
          )
        ))
    ) {
      sites += 1;
      continue;
    }
    if (called === 'match' && receiverText === 'assert') {
      const subject = node.arguments[0];
      if (subject?.type === 'Identifier' && sources.has(keyFor(subject))) sites += 1;
      continue;
    }
    if (called !== 'includes') continue;
    // A resolved source binding is pin enough whatever the needle: a pin whose argument is a loop
    // variable is still a pin, and requiring a literal would let one be hidden by hoisting it.
    if (receiver !== undefined && sources.has(receiver)) {
      sites += 1;
      continue;
    }
    // The widened shapes below are reached without resolving the text to a read, so they require a
    // literal needle to stay clear of ordinary membership checks.
    if (!matchesLiteral(node)) continue;
    if (scansHandedSource && receiverText !== undefined && parameters.has(receiverText)) sites += 1;
  }
  return sites;
}
