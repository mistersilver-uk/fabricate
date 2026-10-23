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
  componentTags,
  focusableElements,
  foundryReads,
  importClosure,
  isComponent,
  propLocals,
  publishedLocals,
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

/** The files that may name `resolveOverlayHost`: its own, and the action that acquires through the chain. */
const HOST_RESOLVER_HOMES = Object.freeze([
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/util/overlayHost.js',
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

/** The files of a closure that import `resolveOverlayHost`, which ignores the overlay chain. */
export function hostResolverImports(path, reader) {
  return [...importClosure(path, reader)]
    .filter((file) => !HOST_RESOLVER_HOMES.includes(file))
    .filter((file) =>
      [...walkNodes(astOf(file, reader))].some(
        (node) => node.type === 'ImportSpecifier' && node.imported?.name === 'resolveOverlayHost'
      )
    )
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
 * head); and every required prop is a snippet without arguments, a callback or data.
 */
export function publishableFaults(path, { manifest, reader }) {
  if (reader.has && !reader.has(path)) return [`${path} does not exist`];
  const closure = [...importClosure(path, reader)];
  const faults = [];
  for (const file of closure) {
    faults.push(...foundryReads(file, reader).map((read) => `${file}: ${read}`));
    if (!isComponent(file)) continue;
    const ast = reader.component(file);
    faults.push(...focusableElements(file, ast, DYNAMIC_ELEMENTS).faults);
    if (file === path) faults.push(...requiredPropFaults(ast).map((fault) => `${file}: ${fault}`));
  }
  faults.push(
    ...hostResolverImports(path, reader).map(
      (file) => `${file} imports resolveOverlayHost, which ignores the overlay chain`
    )
  );
  const entry = manifest.find((candidate) => candidate.path === path);
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

/**
 * The places a published entry's closure spreads attributes from a value that is, or may be, data
 * the caller published, as `{ key, members }`: the published `data` key and the members read below
 * it, an `{#each}` item counting as the value it iterates, a `{@const}` as its initialiser and a
 * snippet parameter of the entry's own file as the arguments that file renders it with (a snippet
 * nothing in that file renders is unnameable). `{ key: null }` is a value that may be an item of a
 * collection the entry does not publish. A spread of the file's `$props()` rest, or of a
 * script-level `const` or `$derived`, is no item. A child's `$props()` key is what its parents
 * pass it. Every other spread fails closed.
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
  const scriptLocals = new Map(
    files.map((file) => {
      const ast = asts.get(file);
      const names = new Set();
      for (const statement of topLevel(ast)) {
        if (statement.type !== 'VariableDeclaration') continue;
        for (const { id, init } of statement.declarations) {
          const callee = init?.callee;
          const derived = callee?.name === '$derived' || callee?.object?.name === '$derived';
          if (callee?.name === '$props') {
            const rest = id.properties?.find((property) => property.type === 'RestElement');
            if (rest) names.add(rest.argument.name);
          } else if (statement.kind === 'const' || derived) {
            for (const name of boundNames(id)) names.add(name);
          }
        }
      }
      return [file, names];
    })
  );
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

  const renderedWith = (file, snippet, index, path) => {
    const rendered = [...ancestorsOf.get(file)].filter(
      ([node]) => node.type === 'RenderTag' && renderCall(node).callee?.name === snippet.name
    );
    return rendered.flatMap(([tag, ancestors]) => {
      const argument = renderCall(tag).arguments[index];
      return argument ? originsOf(argument, file, ancestors).map((o) => through(o, path)) : [];
    });
  };

  const passedTo = (file, key) =>
    guarded(`${file}:${key}`, () =>
      files.flatMap((parent) =>
        componentTags(parent, asts.get(parent))
          .filter(([child]) => child === file)
          .flatMap(([, tag]) =>
            tag.attributes
              .filter((attribute) => attribute.name === key)
              .map((attribute) =>
                attribute.type === 'BindDirective'
                  ? attribute.expression
                  : attribute.value?.expression
              )
              .filter(Boolean)
              .flatMap((expression) =>
                originsOf(expression, parent, ancestorsOf.get(parent).get(tag))
              )
          )
      )
    );

  function fromScope(name, file) {
    const ast = asts.get(file);
    const prop = propLocals(ast).find((candidate) => candidate.local === name);
    if (file === entry.path) {
      const key = publishedLocals(entry, ast).get(name);
      if (key !== undefined) return entry.props[key].kind === 'data' ? [{ key, members: [] }] : [];
      if (prop) return [];
    }
    if (scriptLocals.get(file).has(name)) return [];
    return prop ? passedTo(file, prop.key) : [UNNAMEABLE];
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
        return rendered.length === 0 ? [UNNAMEABLE] : rendered;
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
