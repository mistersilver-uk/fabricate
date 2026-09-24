/**
 * Count the source-text pin sites in one test module (issue 1658), following text a module imports
 * from another `tests/` module (issue 1933). Proved from inside the `npm test` glob by
 * `tests/source-pin-ratchet.test.js`.
 */
import { posix } from 'node:path';

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

const NO_EXPORTS = () => undefined;

/** The binding an anonymous `export default` stands for, which the AST does not name. */
const DEFAULT_EXPORT = Object.freeze({ type: 'Identifier', name: '*default*' });

/**
 * Subtree queries, memoised on the node: a module is re-analysed on every pass of the cross-module
 * fixpoint, and re-walking each subtree per pass doubled the gate's run time.
 */
function memoised(query) {
  const cache = new WeakMap();
  return (node) => {
    if (!node || typeof node !== 'object') return query(node);
    if (!cache.has(node)) cache.set(node, query(node));
    return cache.get(node);
  };
}

const nodesIn = memoised((node) => [...walkNodes(node)]);

const callsIn = memoised((node) =>
  [...walkNodes(node)].filter((inner) => inner.type === 'CallExpression')
);

/** Identifiers and members, the nodes a binding can be referenced through. */
const referencesIn = memoised((node) =>
  [...walkNodes(node)].filter(
    (inner) => inner.type === 'Identifier' || inner.type === 'MemberExpression'
  )
);

const spellsSrcPath = memoised((node) =>
  literalStrings(node).some((text) => text.includes('src/') || SRC_ROOTS.includes(text))
);

/** `calledName`, plus a string-keyed member such as `fs['readFileSync']`. */
function readerCallName(node) {
  const { callee } = node;
  const keyed = callee?.type === 'MemberExpression' && callee.computed ? callee.property : {};
  return calledName(node) ?? (typeof keyed.value === 'string' ? keyed.value : undefined);
}

const isReader = (node, readers) =>
  node?.type === 'CallExpression' && readers.has(readerCallName(node));

/** The name an import or export specifier spells, whether as an identifier or a string. */
const specifierName = (node) => node?.name ?? node?.value;

/** The name a function is bound to, whether declared or assigned to a `const`. */
function boundFunctionName(node, assignedNames) {
  return node.id?.name ?? assignedNames.get(node);
}

/** Names bound to a function expression, which the AST does not record on the function itself. */
function functionAssignments(nodes) {
  const assigned = new Map();
  for (const node of nodes) {
    if (
      node.type === 'ExportDefaultDeclaration' &&
      FUNCTION_TYPES.includes(node.declaration.type)
    ) {
      assigned.set(node.declaration, DEFAULT_EXPORT.name);
    }
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier') continue;
    if (node.init && FUNCTION_TYPES.includes(node.init.type)) assigned.set(node.init, node.id.name);
  }
  return assigned;
}

/** Local names destructured from a base reader, as `const { readFileSync: rd } = fs`. */
function destructuredReaders(nodes) {
  const names = [];
  for (const node of nodes) {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'ObjectPattern') continue;
    for (const { key, value } of node.id.properties) {
      if (BASE_READERS.includes(specifierName(key)) && value?.type === 'Identifier') {
        names.push(value.name);
      }
    }
  }
  return names;
}

/** A function's own return values, not those of the functions nested in it. */
const functionReturns = memoised((fn) => {
  if (fn.body?.type !== 'BlockStatement') return [fn.body];
  const returns = [];
  // Seeding `seen` with a nested function's body stops the walk descending into its returns.
  const seen = new Set();
  for (const inner of walkNodes(fn.body, seen)) {
    if (FUNCTION_TYPES.includes(inner.type)) seen.add(inner.body);
    else if (inner.type === 'ReturnStatement' && inner.argument) returns.push(inner.argument);
  }
  return returns;
});

/** Every name bound as a function parameter anywhere in the module. */
function parameterNames(functions) {
  const names = new Set();
  for (const node of functions) {
    for (const parameter of node.params ?? []) {
      for (const name of identifierNames(parameter)) names.add(name);
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

/** What a module's analysis needs that does not depend on what it imports, built once per AST. */
const moduleIndex = memoised((ast) => {
  const nodes = nodesIn(ast);
  const functions = nodes.filter((node) => FUNCTION_TYPES.includes(node.type));
  const assigned = functionAssignments(nodes);
  const named = functions
    .map((fn) => ({ name: boundFunctionName(fn, assigned), fn, calls: callsIn(fn.body) }))
    .filter(({ name }) => name !== undefined);
  return {
    named,
    aliases: destructuredReaders(nodes),
    parameters: parameterNames(functions),
    calls: nodes.filter((node) => node.type === 'CallExpression'),
    declarators: nodes.filter(
      (node) => node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init
    ),
  };
});

/**
 * Names this module can read a file through: the base readers, the imported ones, and any local
 * function whose body calls one, resolved to a fixpoint so a wrapper around a wrapper still counts.
 */
function readerNames({ named, aliases }, imported) {
  const names = new Set([...BASE_READERS, ...aliases, ...imported]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const { name, calls } of named) {
      if (names.has(name) || !calls.some((call) => isReader(call, names))) continue;
      names.add(name);
      grew = true;
    }
  }
  return names;
}

/**
 * Names whose call returns what a reader returned, so the path a caller hands one is a read: the
 * readers themselves, and a function returning one's call directly, as `readRootSource` does.
 */
function textReaderNames({ named, aliases }, imported) {
  const names = new Set([...BASE_READERS, ...aliases, ...imported]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const { name, fn } of named) {
      if (names.has(name) || !functionReturns(fn).some((value) => isReader(value, names))) continue;
      names.add(name);
      grew = true;
    }
  }
  return names;
}

function seedKinds(seeds, kinds, key, name) {
  if (kinds?.has('path')) seeds.paths.add(key);
  if (kinds?.has('source')) seeds.sources.add(key);
  if (kinds?.has('reader')) seeds.wrappers.add(name);
  if (kinds?.has('text')) seeds.readers.add(name);
}

/** `ns.TEXT` is keyed on the member node, since the namespace binding itself is not text. */
function seedNamespaceMembers(nodes, identifierKey, namespaces, seeds) {
  for (const node of nodes) {
    if (node.type !== 'MemberExpression' || node.object?.type !== 'Identifier') continue;
    const table = namespaces.get(identifierKey(node.object));
    const name = node.computed ? node.property?.value : node.property?.name;
    if (table === undefined || typeof name !== 'string') continue;
    const key = `${node.object.name}.${name}`;
    seeds.members.set(node, key);
    seedKinds(seeds, table.get(name), key, name);
  }
}

/**
 * What this module imports from a `tests/` export, keyed by (resolved module, imported name): paths
 * and sources by the local binding, and readers by the name a call site spells. An imported wrapper
 * marks the module as reading files but is not a pin read, since most compile or mount a component;
 * one returning the text it read is.
 */
function importSeeds(ast, identifierKey, exportsOf) {
  const seeds = {
    paths: new Set(),
    sources: new Set(),
    readers: new Set(),
    wrappers: new Set(),
    members: new Map(),
  };
  const namespaces = new Map();
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const table = exportsOf(node.source.value);
    for (const { type, local, imported } of node.specifiers) {
      if (type === 'ImportNamespaceSpecifier') {
        if (table !== undefined) namespaces.set(identifierKey(local), table);
        continue;
      }
      const name = type === 'ImportDefaultSpecifier' ? 'default' : specifierName(imported);
      if (BASE_READERS.includes(name)) seeds.readers.add(local.name);
      seedKinds(seeds, table?.get(name), identifierKey(local), local.name);
    }
  }
  if (namespaces.size > 0) seedNamespaceMembers(nodesIn(ast), identifierKey, namespaces, seeds);
  return seeds;
}

/** Whether any identifier or keyed member in a subtree resolves to a key already in `known`. */
function referencesKnown(node, known, keyFor) {
  return referencesIn(node).some((inner) => {
    const key = keyFor(inner);
    return key !== undefined && known.has(key);
  });
}

/** Whether a read call names a `src/` path directly or through a path binding. */
const readsSrc = (call, paths, keyFor) =>
  spellsSrcPath(call) ||
  call.arguments.some((argument) => referencesKnown(argument, paths, keyFor));

/**
 * Classify one declaration: a PATH binding spells a `src/` path without reading it, and a SOURCE
 * binding holds text a reader returned.
 */
function classifyDeclaration(declaration, context) {
  const { readers, paths, sources, keyFor } = context;
  const reads = callsIn(declaration.init).filter((node) => isReader(node, readers));
  // The two are computed independently rather than as an either/or: a binding that spells a path
  // and is later found to derive from a source is both, and collapsing them moves real counts.
  const path = reads.length === 0 && spellsSrcPath(declaration.init);
  const source =
    reads.some((read) => readsSrc(read, paths, keyFor)) ||
    (reads.length > 0 && spellsSrcPath(declaration.init)) ||
    referencesKnown(declaration.init, sources, keyFor);
  return { path, source };
}

/** An anonymous default export, as declarations of the binding its importers name. */
function defaultExportDeclarations(ast) {
  const declaration = ast.body.find(
    (node) => node.type === 'ExportDefaultDeclaration'
  )?.declaration;
  if (!declaration || declaration.id || declaration.type === 'Identifier') return [];
  if (declaration.type !== 'FunctionDeclaration')
    return [{ id: DEFAULT_EXPORT, init: declaration }];
  return functionReturns(declaration).map((init) => ({ id: DEFAULT_EXPORT, init }));
}

/**
 * Every declared function's return values, as declarations of its binding, so a caller of a
 * function returning text holds a source. `const` functions are classified by their declarator.
 */
const functionReturnDeclarations = memoised((ast) => [
  ...nodesIn(ast)
    .filter((node) => node.type === 'FunctionDeclaration' && node.id)
    .flatMap((fn) => functionReturns(fn).map((init) => ({ id: fn.id, init }))),
  ...defaultExportDeclarations(ast),
]);

function resolveBindings(ast, { declarators }, { readers, keyFor, seeds }) {
  const declarations = [...declarators, ...functionReturnDeclarations(ast)];
  const paths = new Set(seeds.paths);
  const sources = new Set(seeds.sources);
  const context = { readers, paths, sources, keyFor };
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
  return { paths, sources };
}

/**
 * The node a call's receiver is reached through: `byFile[path]` resolves to `byFile`, a keyed
 * `ns.TEXT` to itself, and a call of a source function, `read().includes`, to `read`.
 */
function receiverNode(node, { keyFor, sources }) {
  let object = node.callee?.type === 'MemberExpression' ? node.callee.object : undefined;
  while (object?.type === 'MemberExpression' || object?.type === 'CallExpression') {
    if (sources.has(keyFor(object))) return object;
    if (object.type === 'CallExpression') {
      return sources.has(keyFor(object.callee)) ? object.callee : undefined;
    }
    object = object.object;
  }
  return object?.type === 'Identifier' ? object : undefined;
}

const matchesLiteral = (node) => {
  const [first] = node.arguments;
  return (
    first?.type === 'TemplateLiteral' ||
    (first?.type === 'Literal' && typeof first.value === 'string')
  );
};

/** Whether this call asserts the shape of source text, and so is one pin site. */
function isPinSite(node, context) {
  const { readers, paths, sources, keyFor, parameters } = context;
  if (isReader(node, readers)) return readsSrc(node, paths, keyFor);
  const called = calledName(node);
  const receiver = receiverNode(node, context);
  // `assert.match(source, /x/)` and `/x/.test(source)` take the text as an argument, not a receiver.
  if ((called === 'match' && receiver?.name === 'assert') || called === 'test') {
    const [subject] = node.arguments;
    return (
      subject !== undefined &&
      (sources.has(keyFor(subject)) ||
        (subject.type === 'CallExpression' && sources.has(keyFor(subject.callee))))
    );
  }
  if (called !== 'includes' || receiver === undefined) return false;
  // A resolved source binding is pin enough whatever the needle: a pin whose argument is a loop
  // variable is still a pin, and requiring a literal would let one be hidden by hoisting it.
  if (sources.has(keyFor(receiver))) return true;
  // A parameter is reached without resolving to a read, so it needs a literal needle to stay clear
  // of ordinary membership checks, and only counts where scanning handed-in source is the job.
  return matchesLiteral(node) && parameters.has(receiver.name);
}

/** The local binding or re-exported kinds behind each name one export statement makes public. */
function* exportedBindings(node, exportsOf) {
  if (node.type === 'ExportAllDeclaration') {
    // A known limit: `export * as ns from` is not followed.
    if (node.exported) return;
    for (const [name, kinds] of exportsOf(node.source.value) ?? []) {
      if (name !== 'default') yield { name, kinds };
    }
    return;
  }
  if (node.type === 'ExportDefaultDeclaration') {
    const { declaration } = node;
    yield {
      name: 'default',
      local: declaration.type === 'Identifier' ? declaration : (declaration.id ?? DEFAULT_EXPORT),
    };
    return;
  }
  const { declaration, specifiers = [], source } = node;
  if (declaration?.type === 'VariableDeclaration') {
    for (const { id } of declaration.declarations) {
      if (id?.type === 'Identifier') yield { name: id.name, local: id };
    }
  } else if (declaration?.id) {
    yield { name: declaration.id.name, local: declaration.id };
  }
  const table = source ? exportsOf(source.value) : undefined;
  for (const specifier of specifiers) {
    const name = specifierName(specifier.exported);
    if (source) yield { name, kinds: table?.get(specifierName(specifier.local)) };
    else yield { name, local: specifier.local };
  }
}

/** This module's exports that importers must treat as a path, a source, a reader, or text. */
function exportTable(ast, { paths, sources, wrappers, texts, keyFor }, exportsOf) {
  const table = new Map();
  for (const node of ast.body) {
    if (!node.type.startsWith('Export')) continue;
    for (const { name, local, kinds } of exportedBindings(node, exportsOf)) {
      const found = new Set(kinds);
      if (local !== undefined) {
        const key = keyFor(local);
        if (paths.has(key)) found.add('path');
        if (sources.has(key)) found.add('source');
        if (wrappers.has(local.name)) found.add('reader');
        if (texts.has(local.name)) found.add('text');
      }
      if (found.size > 0) table.set(name, found);
    }
  }
  return table;
}

const hasExports = (ast) => ast.body.some((node) => node.type.startsWith('Export'));

/**
 * One module's pin sites, whether it calls a reader at all, and its export table.
 *
 * @param {object} ast A module AST from `parseModule`.
 * @param {{file?: string, scopeManager?: object, exportsOf?: Function}} options `file` decides
 *   whether a handed parameter counts as source; `exportsOf(specifier)` is the export table of the
 *   `tests/` module an import names, or `undefined`.
 */
function analyseModule(ast, { file = '', scopeManager, exportsOf = NO_EXPORTS } = {}) {
  const index = moduleIndex(ast);
  const variables = variableIndex(scopeManager);
  const identifierKey = (node) => variables.get(node) ?? node?.name;
  const seeds = importSeeds(ast, identifierKey, exportsOf);
  const keyFor = (node) => seeds.members.get(node) ?? identifierKey(node);
  const readers = readerNames(index, seeds.readers);
  const { paths, sources } = resolveBindings(ast, index, { readers, keyFor, seeds });
  // Counted everywhere, the parameter shape sweeps up ordinary array membership in behavioural
  // tests: 425 sites across 94 files, against 11 under `tests/helpers/`.
  const parameters = file.startsWith('tests/helpers/') ? index.parameters : new Set();
  const context = { readers, paths, sources, keyFor, parameters };
  // A local wrapper's body calls one of these, so they alone decide whether the module reads files.
  const direct = new Set([...readers, ...seeds.wrappers]);
  let sites = 0;
  let readsFiles = false;
  for (const node of index.calls) {
    readsFiles ||= isReader(node, direct);
    if (isPinSite(node, context)) sites += 1;
  }
  if (!hasExports(ast)) return { sites, readsFiles, exports: new Map() };
  const wrappers = readerNames(index, direct);
  const texts = textReaderNames(index, seeds.readers);
  return {
    sites,
    readsFiles,
    exports: exportTable(ast, { ...context, wrappers, texts }, exportsOf),
  };
}

/** @returns {number} The pin sites in one module, with nothing imported resolved. */
export function countPinSites(ast, options) {
  return analyseModule(ast, options).sites;
}

/** A relative specifier as a corpus key, or `undefined` for a package or a file outside it. */
function resolveSpecifier(file, specifier, corpus) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(file), specifier));
  return [base, `${base}.js`, `${base}/index.js`].find((candidate) => corpus.has(candidate));
}

const sameTable = (left, right) =>
  left !== undefined &&
  left.size === right.size &&
  [...right].every(([name, kinds]) => [...kinds].every((kind) => left.get(name)?.has(kind)));

/**
 * Every module's pin sites, with imported text followed across modules to a fixpoint.
 *
 * @param {Map<string, {ast: object, scopeManager?: object}>} corpus Keyed by repo-relative path.
 * @returns {{sites: Map<string, number>, fileReaders: Set<string>}} Sites for modules with any,
 *   and every module that calls a raw reader or an imported reader wrapper.
 */
export function countCorpusPinSites(corpus) {
  const tables = new Map();
  const results = new Map();
  const analyse = (file) => {
    const { ast, scopeManager } = corpus.get(file);
    const exportsOf = (specifier) => tables.get(resolveSpecifier(file, specifier, corpus));
    const result = analyseModule(ast, { file, scopeManager, exportsOf });
    results.set(file, result);
    return result;
  };
  const exporting = [...corpus.keys()].filter((file) => hasExports(corpus.get(file).ast));
  // Export tables only grow as their imports' tables grow, so this reaches a fixpoint, and the last
  // pass, which changed nothing, analysed every exporting module against the final tables.
  let grew = true;
  while (grew) {
    grew = false;
    for (const file of exporting) {
      const { exports } = analyse(file);
      if (sameTable(tables.get(file), exports)) continue;
      tables.set(file, exports);
      grew = true;
    }
  }
  for (const file of corpus.keys()) if (!results.has(file)) analyse(file);
  const sites = new Map();
  const fileReaders = new Set();
  for (const [file, result] of results) {
    if (result.sites > 0) sites.set(file, result.sites);
    if (result.readsFiles) fileReaders.add(file);
  }
  return { sites, fileReaders };
}
