/**
 * The publishable subset of the design system (issue 2455): the candidates, the static rules a
 * candidate must pass to be publishable, and the report the ratchet prints. Every function takes a
 * context `{ rows, manifest, exclusions, reader }` rather than reading the tree, so the ratchet
 * can evaluate the base commit and the head with one implementation. `reader` is a
 * `publishedComponentGate.js` reader, `rows` the design-system manifest's rows, `manifest` the
 * published entries and `exclusions` the exclusion list's rows or `null` when the file is absent.
 */
import { byCodePoint } from './codePointOrder.js';
import { manifestRows } from './designSystemRatchet.js';
import { readHeadFile } from './mergeBaseRatchet.js';
import { parseModule, walkNodes, walkWithAncestors } from './moduleAst.js';
import {
  DYNAMIC_ELEMENTS,
  closureFocusables,
  componentTags,
  foundryReads,
  importClosure,
  isComponent,
  isNameRead,
  propLocals,
  publishedLocals,
  referencedNames,
  relativeImports,
  syntheticReader,
} from './publishedComponentGate.js';

export const EXCLUSIONS_PATH = 'scripts/lib/publishedComponentExclusions.json';
export const PUBLISHED_MANIFEST_PATH = 'src/ui/publishedComponentManifest.js';

/** The overlay actions admission rule 10 names: a closure that reaches one opens an overlay. */
export const OVERLAY_ACTIONS = Object.freeze([
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/actions/typeaheadPanel.js',
]);

/**
 * A reader over `readFile`, which answers a path's text or `undefined`; `has` says which. Each parse
 * of a path is made once, so a closure scan of many entries reads each file once.
 */
function readerOver(readFile) {
  const sources = new Proxy({}, { get: (_target, file) => readFile(file) });
  const base = syntheticReader(sources);
  const memo = (parse) => {
    const seen = new Map();
    return (file) => {
      if (!seen.has(file)) seen.set(file, parse(file));
      return seen.get(file);
    };
  };
  return {
    component: memo(base.component),
    componentScope: memo(base.componentScope),
    module: memo(base.module),
    has: (file) => readFile(file) !== undefined,
  };
}

/** The value a manifest's literal spells, for the `Object.freeze`, object, array and scalar forms it uses. */
function literalValue(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map((element) => literalValue(element));
  if (node.type === 'CallExpression') return literalValue(node.arguments[0]);
  if (node.type !== 'ObjectExpression') {
    throw new Error(`the published manifest holds a ${node.type}, which is no literal`);
  }
  const fields = node.properties.map((property) => [
    property.key.name ?? property.key.value,
    literalValue(property.value),
  ]);
  return Object.fromEntries(fields);
}

/** The published entries `src/ui/publishedComponentManifest.js` spells, read from text rather than imported. */
function publishedManifestOf(readFile) {
  // ratchet-exempt(source-pin): parsed to an AST at once; the base side cannot import the manifest, so it is read as text
  const text = readFile(PUBLISHED_MANIFEST_PATH);
  if (text === undefined) return [];
  const declaration = parseModule(text).ast.body.find(
    (statement) =>
      statement.declaration?.declarations?.[0]?.id?.name === 'PUBLISHED_COMPONENT_MANIFEST'
  );
  return literalValue(declaration.declaration.declarations[0].init);
}

/** The exclusion list's rows, or `null` when the file is absent. */
function exclusionsOf(readFile) {
  const text = readFile(EXCLUSIONS_PATH);
  return text === undefined ? null : (JSON.parse(text).exclusions ?? []);
}

/** The context of the working tree under `dir`. */
export function contextAt(dir) {
  return contextOf((file) => readHeadFile(dir, file));
}

/** The context one side of the comparison evaluates: the base commit's files or the head's. */
export function contextOf(readFile) {
  return {
    rows: manifestRows(readFile),
    manifest: publishedManifestOf(readFile),
    exclusions: exclusionsOf(readFile),
    reader: readerOver(readFile),
  };
}

/**
 * Every design-system row with scope `shared`, and every recorded non-member with a library
 * specimen, as the paths a companion could be offered.
 */
function candidatePaths(rows) {
  return rows
    .filter((row) => row.scope === 'shared' || (row.scope === undefined && row.library))
    .map((row) => row.path)
    .sort(byCodePoint);
}

const astOf = (file, reader) =>
  isComponent(file) ? reader.component(file) : reader.module(file).ast;

const HOST_RESOLVER = 'resolveOverlayHost';
const keyName = (key) => key?.name ?? key?.value;

/** Whether a node names `resolveOverlayHost` as an import, a re-export, a member or a destructured key. */
function namesHostResolver(node) {
  if (node.type === 'ImportSpecifier') return node.imported?.name === HOST_RESOLVER;
  if (node.type === 'ExportNamedDeclaration') {
    return (
      Boolean(node.source) &&
      node.specifiers.some((specifier) => specifier.local?.name === HOST_RESOLVER)
    );
  }
  if (node.type === 'ExportAllDeclaration') {
    return String(node.source?.value).endsWith('/overlayHost.js');
  }
  if (node.type === 'MemberExpression') {
    return (node.computed ? node.property.value : node.property.name) === HOST_RESOLVER;
  }
  return node.type === 'Property' && !node.computed && keyName(node.key) === HOST_RESOLVER;
}

/** The files of a closure that import, re-export or reach `resolveOverlayHost`, which ignores the overlay chain. */
export function hostResolverImports(path, reader) {
  return [...importClosure(path, reader)]
    .filter((file) => [...walkNodes(astOf(file, reader))].some(namesHostResolver))
    .sort(byCodePoint);
}

const renderCall = (tag) =>
  tag.expression.type === 'ChainExpression' ? tag.expression.expression : tag.expression;

/** The faults of a required prop (a `$props()` key with no default) that no shipped kind carries. */
function requiredPropFaults(ast) {
  const faults = [];
  const nodes = [...walkNodes(ast.fragment)];
  for (const { key, local, fallback } of propLocals(ast)) {
    if (fallback !== undefined) continue;
    const called = nodes.some(
      (node) =>
        node.type === 'RenderTag' &&
        renderCall(node).callee?.name === local &&
        renderCall(node).arguments.length > 0
    );
    const drawn = nodes.some(
      (node) =>
        (node.type === 'Component' && node.name === local) ||
        (node.type === 'SvelteComponent' && node.expression?.name === local)
    );
    if (called) faults.push(`required prop "${key}" is a snippet called with arguments`);
    if (drawn) faults.push(`required prop "${key}" is a component`);
  }
  return faults;
}

/**
 * The faults that keep the component at `path` from being published, empty when it is
 * publishable: it exists; its closure reads no Foundry global and reaches no `resolveOverlayHost`;
 * a published entry states `overlays` where its closure reaches an overlay action; every element
 * rule 9 judges is marked and every `svelte:element` is pinned (`DYNAMIC_ELEMENTS`, read from the
 * head), a form control's `name` judged as `closureFocusables` judges it, against the root's
 * published locals, none for a candidate; and every required prop is a snippet without arguments,
 * a callback or data.
 */
export function publishableFaults(path, { manifest, reader }) {
  if (reader.has && !reader.has(path)) return [`${path} does not exist`];
  const closure = [...importClosure(path, reader)];
  const entry = manifest.find((candidate) => candidate.path === path);
  const faults = [];
  for (const file of closure) {
    faults.push(...foundryReads(file, reader).map((read) => `${file}: ${read}`));
    if (file !== path || !isComponent(file)) continue;
    faults.push(...requiredPropFaults(reader.component(file)).map((fault) => `${file}: ${fault}`));
  }
  if (isComponent(path)) {
    const ast = reader.component(path);
    const rootPublished = new Set(entry ? publishedLocals(entry, ast).keys() : []);
    const options = { manifest, rootPublished, dynamic: DYNAMIC_ELEMENTS };
    faults.push(...closureFocusables(path, reader, options).faults);
  }
  faults.push(
    ...hostResolverImports(path, reader).map(
      (file) => `${file} imports resolveOverlayHost, which ignores the overlay chain`
    )
  );
  if (entry && entry.overlays !== true) {
    faults.push(
      ...closure
        .filter((file) => OVERLAY_ACTIONS.includes(file))
        .map((file) => `reaches ${file} and is not overlays: true`)
    );
  }
  return faults.sort(byCodePoint);
}

/**
 * What the ratchet prints, as sorted paths: the `candidates`, the `publishable` ones among them,
 * the `published` ones, the `listed` ones, and `staticFailures`, each failing candidate with its
 * faults.
 */
export function ratchetReport(context) {
  const candidates = candidatePaths(context.rows);
  const staticFailures = {};
  for (const path of candidates) {
    const faults = publishableFaults(path, context);
    if (faults.length > 0) staticFailures[path] = faults;
  }
  return {
    candidates,
    publishable: candidates.filter((path) => !Object.hasOwn(staticFailures, path)),
    published: context.manifest.map((entry) => entry.path).sort(byCodePoint),
    listed: (context.exclusions ?? []).map((row) => row.path).sort(byCodePoint),
    staticFailures,
  };
}

const unchained = (expression) =>
  expression.type === 'ChainExpression' ? expression.expression : expression;

/** A value that is, or may hold, an item of a collection the entry does not publish (or a whole one). */
const UNNAMEABLE = Object.freeze({ key: null });

/** A name that is an import or a listed global: it holds no data, and a spread of it still fails closed. */
const UNRESOLVED = Object.freeze({ key: null });

/**
 * The globals and runes a script may read without reading data; every other name no rule resolves
 * is unnameable, so a name missing here makes an alias of it fail closed rather than pass.
 */
const KNOWN_GLOBALS = new Set(
  'Array Boolean Date JSON Map Math Number Object Set String Symbol Infinity NaN undefined globalThis window document console $derived $state $effect $inspect $host'.split(
    ' '
  )
);

/** Whether an origin is, or may hold, published data: every origin but a name no rule resolves. */
const holdsData = (origin) => origin !== UNRESOLVED;

/** The identifiers under `ast` that read `name`, each with its ancestors, less imports and declared patterns. */
function readsOf(ast, name) {
  const reads = [];
  for (const root of [ast.fragment, ast.module, ast.instance]) {
    walkWithAncestors(root, (node, ancestors) => {
      if (node.type !== 'Identifier' || node.name !== name) return;
      if (!isNameRead(node, ancestors.at(-1))) return;
      const declared = (at) =>
        at.type === 'ImportDeclaration' ||
        (at.type === 'VariableDeclarator' && [...walkNodes(at.id)].includes(node));
      if (ancestors.every((at) => !declared(at))) reads.push({ node, ancestors });
    });
  }
  return reads;
}

const COMPARISONS = new Set(['==', '!=', '===', '!==']);

/** Whether a read of a snippet only tests it: its result is a boolean, so the snippet goes nowhere. */
function isTest({ node, ancestors }) {
  const parent = ancestors.at(-1);
  if (parent?.type === 'UnaryExpression')
    return parent.operator === '!' || parent.operator === 'typeof';
  if (parent?.type === 'BinaryExpression') return COMPARISONS.has(parent.operator);
  return ['IfBlock', 'ConditionalExpression'].includes(parent?.type) && parent.test === node;
}

/** Whether a read of a snippet is the callee of a `{@render}`, the name its `{#snippet}` declares, or a test. */
function staysPut(read) {
  const { node, ancestors } = read;
  const tag = ancestors.findLast((at) => at.type === 'RenderTag');
  return (
    (tag && renderCall(tag).callee === node) ||
    (ancestors.at(-1)?.type === 'SnippetBlock' && ancestors.at(-1).expression === node) ||
    isTest(read)
  );
}

/** Whether `node` writes an object literal in each branch, or maps an array to one (what a literal local traces by its keys). */
function isLiteralTree(node) {
  const at = unchained(node);
  if (at.type === 'ObjectExpression') return true;
  if (at.type === 'ConditionalExpression') {
    return isLiteralTree(at.consequent) && isLiteralTree(at.alternate);
  }
  return mappedLiteral(at) !== undefined;
}

/** The `{#each}` a mapped call stands for: its parameters are an element of the array and its index. */
function elementOf(call) {
  const [element, index] = call.arguments[0].params;
  return {
    type: 'EachBlock',
    context: element ?? { type: 'Identifier', name: '' },
    index: index?.name,
    expression: call.callee.object,
  };
}

/** The names a script expression declares inside itself: callback parameters and local declarations. */
function declaredWithin(expression) {
  const names = new Set();
  for (const node of walkNodes(expression)) {
    const patterns = [
      ...(node.type.endsWith('FunctionExpression') || node.type === 'ArrowFunctionExpression'
        ? node.params
        : []),
      ...(node.type === 'VariableDeclarator' ? [node.id] : []),
      ...(node.type === 'CatchClause' && node.param ? [node.param] : []),
    ];
    for (const pattern of patterns) for (const name of boundNames(pattern)) names.add(name);
  }
  return names;
}

/** The literal an `array.map((x) => <literal>)` call returns for each element, else `undefined`. */
function mappedLiteral(node) {
  const [callback] = node.arguments ?? [];
  const mapping =
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.name === 'map' &&
    node.arguments.length === 1 &&
    callback.type === 'ArrowFunctionExpression' &&
    callback.expression;
  return mapping && isLiteralTree(callback.body) ? callback.body : undefined;
}

/** The names a binding pattern introduces. */
function boundNames(pattern) {
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'AssignmentPattern') return boundNames(pattern.left);
  if (pattern.type === 'RestElement') return boundNames(pattern.argument);
  if (pattern.type === 'ArrayPattern') {
    return pattern.elements.filter(Boolean).flatMap((element) => boundNames(element));
  }
  return pattern.properties.flatMap((property) =>
    boundNames(property.type === 'RestElement' ? property : property.value)
  );
}

/**
 * The members from the value a pattern binds down to `name`: `[]` for the pattern itself, `null`
 * for a name reached through a rest, an array or a computed key, `undefined` for a name the
 * pattern does not bind.
 */
function bindingPath(pattern, name) {
  if (!boundNames(pattern).includes(name)) return undefined;
  if (pattern.type === 'Identifier') return [];
  if (pattern.type === 'AssignmentPattern') return bindingPath(pattern.left, name);
  if (pattern.type !== 'ObjectPattern') return null;
  const property = pattern.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      boundNames(candidate.value).includes(name) &&
      !candidate.computed
  );
  const inner = property && bindingPath(property.value, name);
  return inner ? [property.key.name ?? property.key.value, ...inner] : null;
}

const through = (origin, path) =>
  origin.key === null || path === null
    ? UNNAMEABLE
    : { key: origin.key, members: [...origin.members, ...path] };

/** The expression an attribute value is exactly, bare or alone inside quotes; else `undefined`. */
function singleExpression(value) {
  const parts = [value].flat();
  return parts.length === 1 ? parts[0]?.expression : undefined;
}

/**
 * The places a published entry's closure spreads attributes from a value that is, or may be, data
 * the caller published, as `{ key, members }`: the published `data` key and the members read below
 * it, an `{#each}` item counting as the value it iterates, a `{@const}` as its initialiser and a
 * snippet parameter of the entry's own file as the arguments that file, or a child it hands the
 * snippet to, renders it with, an object literal's plain key read by name (a snippet nothing
 * renders, or one read anywhere but a render, a test or the tag that hands it, is unnameable;
 * issues 2647, 2607). `{ key: null }` is a value that may be an item of a collection the entry
 * does not publish. A spread of the file's `$props()` rest is no item. A script-level `const` or
 * `$derived` holds no data when every name it reads is an import, a function declared in the file
 * or a `KNOWN_GLOBALS` member, and is otherwise unnameable, as is every other name no rule
 * resolves. An object literal (under a condition, or mapped from an array) has its spreads and
 * computed keys traced, a branch or call inside it counting as its values. A child's `$props()` key is what its
 * parents pass it, and unnameable where a parent draws the child other than by a component tag.
 * An object literal writes its own keys: each computed key and each spread inside it is traced as a
 * spread is (issue 2601). Every other spread fails closed.
 */
function spreadTracer(entry, reader) {
  const files = [...importClosure(entry.path, reader)].filter(isComponent);
  const asts = new Map(files.map((file) => [file, reader.component(file)]));
  const ancestorsOf = new Map(
    files.map((file) => {
      const found = new Map();
      walkWithAncestors(asts.get(file).fragment, (node, ancestors) => found.set(node, ancestors));
      return [file, found];
    })
  );
  const topLevel = (ast) =>
    [ast.module, ast.instance].flatMap((script) => script?.content?.body ?? []);
  const scopeNames = new Map();
  const scriptLocals = new Map(
    files.map((file) => {
      const ast = asts.get(file);
      const names = new Map();
      const imports = new Set();
      const functions = new Set();
      const others = new Set();
      scopeNames.set(file, { imports, functions, others });
      for (const exported of topLevel(ast)) {
        const statement = exported.declaration ?? exported;
        if (exported.type === 'ImportDeclaration') {
          for (const specifier of exported.specifiers) imports.add(specifier.local.name);
        }
        if (statement.type === 'FunctionDeclaration') functions.add(statement.id.name);
        if (statement.type === 'ClassDeclaration') others.add(statement.id.name);
        if (statement.type !== 'VariableDeclaration') continue;
        if (statement.kind !== 'const') {
          for (const { id } of statement.declarations) {
            for (const name of boundNames(id)) others.add(name);
          }
        }
        for (const { id, init } of statement.declarations) {
          const callee = init?.callee;
          const derived = callee?.name === '$derived' || callee?.object?.name === '$derived';
          if (callee?.name === '$props') {
            const rest = id.properties?.find((property) => property.type === 'RestElement');
            if (rest) names.set(rest.argument.name, { kind: 'rest' });
          } else if (statement.kind === 'const' || derived) {
            const value = callee?.name === '$derived' ? init.arguments[0] : init;
            const literal = id.type === 'Identifier' && isLiteralTree(value);
            const held = { kind: literal ? 'literal' : 'derived', value };
            for (const name of boundNames(id)) names.set(name, held);
          }
        }
      }
      return [file, names];
    })
  );
  const propNames = new Map(
    files.map((file) => [file, new Set(propLocals(asts.get(file)).map(({ local }) => local))])
  );
  /** Whether `file` binds `name` at its top level to something the tracer resolves or fails closed on. */
  const boundAtTopLevel = (name, file) =>
    scriptLocals.get(file).has(name) ||
    propNames.get(file).has(name) ||
    scopeNames.get(file).others.has(name);
  const active = new Set();
  const guarded = (id, trace) => {
    if (active.has(id)) return [];
    active.add(id);
    try {
      return trace();
    } finally {
      active.delete(id);
    }
  };

  /** An argument's origins down `path`, an object literal of plain keys read by the member named. */
  const argumentOrigins = (argument, file, ancestors, path) => {
    const node = unchained(argument);
    const plain = node.type === 'ObjectExpression' && path?.length > 0;
    if (plain && node.properties.every((p) => p.type === 'Property' && !p.computed)) {
      const named = node.properties.find((p) => (p.key.name ?? p.key.value) === path[0]);
      return named ? argumentOrigins(named.value, file, ancestors, path.slice(1)) : [];
    }
    return originsOf(argument, file, ancestors).map((o) => through(o, path));
  };

  /** Each render tag of `local` in `file`, as the origins of its argument at `index` down `path`. */
  const rendersOf = (file, local, index, path) =>
    [...ancestorsOf.get(file)]
      .filter(([node]) => node.type === 'RenderTag' && renderCall(node).callee?.name === local)
      .map(([tag, ancestors]) => {
        const argument = renderCall(tag).arguments[index];
        return argument ? argumentOrigins(argument, file, ancestors, path) : [];
      });

  /** The keys a tag hands `snippet` as: its own name when it is the tag's content, else each attribute naming it. */
  const handedAs = (tag, snippet, handed) => [
    ...(tag.fragment?.nodes.some((n) => n.type === 'SnippetBlock' && n.expression.name === snippet)
      ? [snippet]
      : []),
    ...tag.attributes
      .filter(
        ({ type, value }) => type === 'Attribute' && singleExpression(value)?.name === snippet
      )
      .map(({ name, value }) => {
        handed.add(singleExpression(value));
        return name;
      }),
  ];

  /** Whether `file` reads `name` anywhere but as a `{@render}` callee, a declaration, a test or a `handed` node. */
  const strays = (file, name, handed = new Set()) =>
    readsOf(asts.get(file), name).some((read) => !staysPut(read) && !handed.has(read.node));

  const renderedWith = (file, snippet, index, path) => {
    const own = rendersOf(file, snippet.name, index, path);
    const handed = new Set();
    const byChildren = componentTags(file, asts.get(file)).flatMap(([child, tag]) => {
      const accounted = new Set();
      const keys = handedAs(tag, snippet.name, accounted);
      if (keys.length === 0 || !asts.has(child)) return [];
      for (const node of accounted) handed.add(node);
      const locals = propLocals(asts.get(child)).filter(({ key }) => keys.includes(key));
      return locals.flatMap(({ local }) =>
        guarded(`${child}#${local}`, () => [
          ...rendersOf(child, local, index, path),
          ...(strays(child, local) ? [UNNAMEABLE] : []),
        ])
      );
    });
    return [...own, ...byChildren, ...(strays(file, snippet.name, handed) ? [UNNAMEABLE] : [])];
  };

  /** Whether `parent` reads the binding of its import of `file` anywhere but as a component tag. */
  const drawnApart = (parent, file) =>
    [...relativeImports(parent, asts.get(parent))]
      .filter(([, path]) => path === file)
      .some(([binding]) => readsOf(asts.get(parent), binding).length > 0);

  const passedTo = (file, key) =>
    guarded(`${file}:${key}`, () => {
      const tags = files.flatMap((parent) =>
        componentTags(parent, asts.get(parent))
          .filter(([child]) => child === file)
          .map(([, tag]) => [parent, tag])
      );
      const passes = tags.flatMap(([parent, tag]) =>
        tag.attributes
          .filter((attribute) => attribute.name === key)
          .map((attribute) =>
            attribute.type === 'BindDirective'
              ? attribute.expression
              : singleExpression(attribute.value)
          )
          .filter(Boolean)
          .flatMap((expression) => originsOf(expression, parent, ancestorsOf.get(parent).get(tag)))
      );
      const untraced = tags.length === 0 || files.some((parent) => drawnApart(parent, file));
      return untraced ? [...passes, UNNAMEABLE] : passes;
    });

  function fromScope(name, file) {
    const ast = asts.get(file);
    const prop = propLocals(ast).find((candidate) => candidate.local === name);
    if (file === entry.path) {
      const key = publishedLocals(entry, ast).get(name);
      if (key !== undefined) return entry.props[key].kind === 'data' ? [{ key, members: [] }] : [];
      if (prop) return [];
    }
    const held = scriptLocals.get(file).get(name);
    if (held) return guarded(held, () => localOrigins(held, file));
    if (prop) return passedTo(file, prop.key);
    // A function declaration is read as holding no data (a stated limit); a class, a let, an
    // export and anything unknown is unnameable.
    const { imports, functions } = scopeNames.get(file);
    const clean = imports.has(name) || functions.has(name) || KNOWN_GLOBALS.has(name);
    return clean ? [UNRESOLVED] : [UNNAMEABLE];
  }

  /** A script local's origins: a rest and a plain constant hold none, a literal its keys, a derived value any data it reads. */
  function localOrigins({ kind, value }, file) {
    if (kind === 'literal') return literalOrigins(value, file);
    if (kind === 'rest') return [];
    const inside = declaredWithin(value);
    const reads = [...referencedNames(value)].filter(
      (read) => !inside.has(read) || boundAtTopLevel(read, file)
    );
    return reads.some((read) => nameOrigins(read, file, []).some(holdsData)) ? [UNNAMEABLE] : [];
  }

  /** A script-level literal's origins: its plain keys are no item, a branch or call is its values. */
  function literalOrigins(expression, file, ancestors = []) {
    const node = unchained(expression);
    const trace = (inner) => literalOrigins(inner, file, ancestors);
    if (node.type === 'ConditionalExpression') {
      return [node.consequent, node.alternate].flatMap((branch) => trace(branch));
    }
    if (node.type === 'CallExpression') {
      const mapped = mappedLiteral(node);
      if (mapped) return literalOrigins(mapped, file, [...ancestors, elementOf(node)]);
      const base =
        node.callee.type === 'MemberExpression'
          ? originsOf(node.callee.object, file, ancestors)
          : [];
      return [...base, ...node.arguments.flatMap((argument) => trace(argument))];
    }
    if (node.type !== 'ObjectExpression') return originsOf(node, file, ancestors);
    return node.properties.flatMap((property) => {
      if (property.type === 'SpreadElement') return trace(property.argument);
      return property.computed ? originsOf(property.key, file, ancestors) : [];
    });
  }

  function nameOrigins(name, file, ancestors) {
    for (let at = ancestors.length - 1; at >= 0; at--) {
      const block = ancestors[at];
      const above = ancestors.slice(0, at);
      if (block.type === 'EachBlock') {
        if (block.index === name) return [];
        const path = bindingPath(block.context, name);
        if (path === undefined) continue;
        const source = guarded(block, () => originsOf(block.expression, file, above));
        return source.length === 0 ? [UNNAMEABLE] : source.map((o) => through(o, path));
      }
      if (block.type === 'AwaitBlock') {
        const bound = [block.value, block.error].filter(Boolean);
        if (bound.some((pattern) => boundNames(pattern).includes(name))) return [UNNAMEABLE];
      }
      if (block.type === 'SnippetBlock') {
        const index = block.parameters.findIndex(
          (pattern) => bindingPath(pattern, name) !== undefined
        );
        if (index === -1) continue;
        if (file !== entry.path) return [];
        const path = bindingPath(block.parameters[index], name);
        const rendered = guarded(block, () => renderedWith(file, block.expression, index, path));
        return rendered.length === 0 ? [UNNAMEABLE] : rendered.flat();
      }
      if (block.type === 'Fragment') {
        for (const { type, declaration } of block.nodes) {
          if (type !== 'ConstTag') continue;
          for (const { id, init } of declaration.declarations) {
            const path = bindingPath(id, name);
            if (path === undefined) continue;
            const held = guarded(init, () => originsOf(init, file, ancestors.slice(0, at + 1)));
            return held.map((o) => through(o, path));
          }
        }
      }
    }
    return fromScope(name, file);
  }

  function originsOf(expression, file, ancestors) {
    const node = unchained(expression);
    if (node.type === 'Identifier') return nameOrigins(node.name, file, ancestors);
    if (node.type === 'Literal') return [];
    if (node.type === 'ObjectExpression') {
      return node.properties.flatMap((property) => {
        if (property.type === 'SpreadElement') return originsOf(property.argument, file, ancestors);
        return property.computed ? originsOf(property.key, file, ancestors) : [UNNAMEABLE];
      });
    }
    if (node.type !== 'MemberExpression') return [UNNAMEABLE];
    const named = !node.computed && node.property.type === 'Identifier';
    return originsOf(node.object, file, ancestors).map((base) =>
      through(base, named ? [node.property.name] : null)
    );
  }

  return {
    files,
    spreads: (file) =>
      [...ancestorsOf.get(file)]
        .filter(([node]) => node.type === 'SpreadAttribute')
        .flatMap(([node, ancestors]) => originsOf(node.expression, file, ancestors)),
  };
}

/**
 * Each spread a published entry's closure draws from published `data`, as `{ id, nameable }`: a
 * nameable id is `<Entry>.<key>` then each member read below it. A spread of a whole item, of an
 * item of a collection the entry does not publish, or of a value no rule traces is `<file>: …`,
 * which no `STRIPPED_ITEM_MEMBERS` row can name. A spread inside a child component's snippet is
 * not traced.
 */
function itemSpreads(entry, reader) {
  const tracer = spreadTracer(entry, reader);
  const spreads = tracer.files.flatMap((file) =>
    tracer.spreads(file).map((origin) => {
      if (origin.key === null) {
        return { id: `${file}: a spread of an item the entry does not publish`, nameable: false };
      }
      if (origin.members.length === 0) {
        return {
          id: `${file}: a spread of a whole item of ${entry.name}.${origin.key}`,
          nameable: false,
        };
      }
      return { id: [entry.name, origin.key, ...origin.members].join('.'), nameable: true };
    })
  );
  const distinct = new Map(spreads.map((spread) => [spread.id, spread]));
  return [...distinct.values()].sort((a, b) => byCodePoint(a.id, b.id));
}

/** The ids of `itemSpreads`. */
export const itemSpreadIds = (entry, reader) =>
  itemSpreads(entry, reader).map((spread) => spread.id);

/**
 * What `stripped` (`STRIPPED_ITEM_MEMBERS`) breaks against the spreads the published closures
 * draw: a spread no row names, and a row no closure spreads, a published `data` key does not
 * hold or whose entry is not published.
 */
export function strippedMemberFaults({ manifest, reader }, stripped) {
  const spreads = new Map(
    manifest.flatMap((entry) => itemSpreads(entry, reader)).map((spread) => [spread.id, spread])
  );
  return [
    ...[...spreads.values()]
      .filter(({ id }) => !stripped.includes(id))
      .map(({ id, nameable }) =>
        nameable
          ? `${id} is spread per item and not stripped: add it to STRIPPED_ITEM_MEMBERS`
          : `${id}: no STRIPPED_ITEM_MEMBERS row can name it; spread a member of a published data key, or drop the spread`
      ),
    ...stripped
      .filter((id) => !spreads.has(id))
      .map((id) => `${id} is stripped and no published closure spreads it`),
  ];
}

/** A row's reason: a code from the closed set, then free text. */
const REASON =
  /^(?<code>no-consumer|domain-coupled|event-argument|item-spread|part-of:(?<part>\S+?)|pending:#\d+): (?<text>\S.*)$/u;

/** The remedy every failure of a publishable component names. */
export const REMEDY =
  'publish it, or add it to scripts/lib/publishedComponentExclusions.json with a reason';

/** What a row's `reason` breaks, or `null` when it holds a code and its text. */
function reasonFault({ path, reason }, paths) {
  const match = REASON.exec(typeof reason === 'string' ? reason.trim() : '');
  if (!match) return `${path} has no reason of the form "<code>: <text>"`;
  const part = match.groups.part;
  return part && !paths.has(part)
    ? `${path} is part of ${part}, which is no design-system row`
    : null;
}

/**
 * What the exclusion list and the published set break at one side: a missing list, a row with no
 * reason or a repeated path, a listed path that is published, is no candidate or fails a static
 * rule, and a publishable candidate that is neither published nor listed. `report` is
 * `ratchetReport(context)`, which a caller that also prints it computes once.
 */
export function exclusionFailures(context, report = ratchetReport(context)) {
  const { exclusions, rows } = context;
  if (exclusions === null) return [`${EXCLUSIONS_PATH} is missing`];
  const candidates = new Set(report.candidates);
  const published = new Set(report.published);
  const listed = new Set();
  const paths = new Set(rows.map((row) => row.path));
  const failures = [];
  for (const row of exclusions) {
    const fault = reasonFault(row, paths);
    if (fault) failures.push(fault);
    if (listed.has(row.path)) failures.push(`${row.path} is listed twice`);
    listed.add(row.path);
    if (published.has(row.path)) failures.push(`${row.path} is listed and published`);
    if (!candidates.has(row.path))
      failures.push(`${row.path} is listed and is no design-system candidate`);
    if (Object.hasOwn(report.staticFailures, row.path)) {
      failures.push(
        `${row.path} is listed and fails a static rule: ${report.staticFailures[row.path][0]}`
      );
    }
  }
  const unaccounted = report.publishable.filter(
    (path) => !published.has(path) && !listed.has(path)
  );
  return [
    ...failures,
    ...unaccounted.map(
      (path) => `${path} is publishable and neither published nor listed: ${REMEDY}`
    ),
  ];
}
