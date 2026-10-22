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
import { identifierNames, parseModule, walkNodes, walkWithAncestors } from './moduleAst.js';
import {
  DYNAMIC_ELEMENTS,
  focusableElements,
  importClosure,
  isComponent,
  propLocals,
  publishedLocals,
  syntheticReader,
} from './publishedComponentGate.js';
import { readsGlobal } from './svelteStructureContract.js';

export const EXCLUSIONS_PATH = 'scripts/lib/publishedComponentExclusions.json';
export const PUBLISHED_MANIFEST_PATH = 'src/ui/publishedComponentManifest.js';

export const FOUNDRY_GLOBALS = Object.freeze([
  'game',
  'foundry',
  'Hooks',
  'CONFIG',
  'CONST',
  'ui',
  'canvas',
  'fromUuid',
  'fromUuidSync',
  'getDocumentClass',
]);

/** The overlay actions admission rule 10 names: a closure that reaches one opens an overlay. */
export const OVERLAY_ACTIONS = Object.freeze([
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/actions/typeaheadPanel.js',
]);

/** The files that may name `resolveOverlayHost`: its own, and the action that acquires through the chain. */
export const HOST_RESOLVER_HOMES = Object.freeze([
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/util/overlayHost.js',
]);

const parsesOf = new WeakMap();

/** `reader` with each parse of a path made once, so a closure scan of many entries reads each file once. */
export function cachedReader(reader) {
  if (!parsesOf.has(reader)) {
    const memo = (parse) => {
      const seen = new Map();
      return (file) => {
        if (!seen.has(file)) seen.set(file, parse(file));
        return seen.get(file);
      };
    };
    parsesOf.set(reader, {
      ...reader,
      component: memo(reader.component),
      componentScope: memo(reader.componentScope),
      module: memo(reader.module),
    });
  }
  return parsesOf.get(reader);
}

/** A cached reader over `textOf`, which answers a path's text or `undefined`; `has` says which. */
export function readerOver(textOf) {
  const sources = new Proxy({}, { get: (_target, file) => textOf(file) });
  return { ...cachedReader(syntheticReader(sources)), has: (file) => textOf(file) !== undefined };
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
export function publishedManifestOf(textOf) {
  const text = textOf(PUBLISHED_MANIFEST_PATH);
  if (text === undefined) return [];
  const declaration = parseModule(text).ast.body.find(
    (statement) =>
      statement.declaration?.declarations?.[0]?.id?.name === 'PUBLISHED_COMPONENT_MANIFEST'
  );
  return literalValue(declaration.declaration.declarations[0].init);
}

/** The exclusion list's rows, or `null` when the file is absent. */
export function exclusionsOf(textOf) {
  const text = textOf(EXCLUSIONS_PATH);
  return text === undefined ? null : (JSON.parse(text).exclusions ?? []);
}

/** The context of the working tree under `dir`. */
export function contextAt(dir) {
  return contextOf((file) => readHeadFile(dir, file));
}

/** The context one side of the comparison evaluates: the base commit's files or the head's. */
export function contextOf(textOf) {
  return {
    rows: manifestRows(textOf),
    manifest: publishedManifestOf(textOf),
    exclusions: exclusionsOf(textOf),
    reader: readerOver(textOf),
  };
}

/**
 * Every design-system row with scope `shared`, and every recorded non-member with a library
 * specimen, as the paths a companion could be offered.
 */
export function candidatePaths(rows) {
  return rows
    .filter((row) => row.scope === 'shared' || (row.scope === undefined && row.library))
    .map((row) => row.path)
    .sort(byCodePoint);
}

/** Each Foundry global one file reads, as `reads <name>`; a local binding of the name is no read. */
export function foundryReads(file, reader) {
  const scope = isComponent(file) ? reader.componentScope(file) : reader.module(file);
  return FOUNDRY_GLOBALS.filter((name) => readsGlobal(scope, name)).map((name) => `reads ${name}`);
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

/**
 * Where the value an expression reads comes from, as `{ key, members }`: the published `data` key
 * and the members read below it, an `{#each}` item counting as the value it iterates. `null` is a
 * value that is neither an item nor a published local; `{ key: null }` is an item of a collection
 * the entry does not publish, which no `STRIPPED_ITEM_MEMBERS` row can name.
 */
function originOf(expression, ancestors, locals) {
  const node = unchained(expression);
  if (node.type === 'MemberExpression') {
    const base = originOf(node.object, ancestors, locals);
    if (base === null) return null;
    const named = !node.computed && node.property.type === 'Identifier';
    return named && base.key
      ? { key: base.key, members: [...base.members, node.property.name] }
      : { key: null };
  }
  if (node.type !== 'Identifier') return null;
  const at = ancestors.findLastIndex(
    (block) => block.type === 'EachBlock' && identifierNames(block.context).has(node.name)
  );
  if (at !== -1)
    return originOf(ancestors[at].expression, ancestors.slice(0, at), locals) ?? { key: null };
  return locals.has(node.name) ? { key: locals.get(node.name), members: [] } : null;
}

/** The spreads of one closure file that `originOf` traces, as `{ origin }` per spread. */
function itemSpreadsIn(file, entry, reader) {
  const ast = reader.component(file);
  const published = file === entry.path ? publishedLocals(entry, ast) : new Map();
  const locals = new Map([...published].filter(([, key]) => entry.props[key].kind === 'data'));
  const origins = [];
  walkWithAncestors(ast.fragment, (node, ancestors) => {
    if (node.type !== 'SpreadAttribute' || unchained(node.expression).type !== 'MemberExpression') {
      return;
    }
    const origin = originOf(node.expression, ancestors, locals);
    if (origin !== null) origins.push(origin);
  });
  return origins;
}

/**
 * Each `{...x.y}` a published entry's closure spreads where `x` is an `{#each}` item or a
 * published `data` local, as `<Entry>.<key>.<member>`; one whose collection the entry does not
 * publish is `<file>: a spread of an item the entry does not publish`, which no row can name.
 */
export function itemSpreadIds(entry, reader) {
  return [...importClosure(entry.path, reader)]
    .filter(isComponent)
    .flatMap((file) =>
      itemSpreadsIn(file, entry, reader).map((origin) =>
        origin.key
          ? [entry.name, origin.key, ...origin.members].join('.')
          : `${file}: a spread of an item the entry does not publish`
      )
    )
    .sort(byCodePoint);
}

/**
 * What `stripped` (`STRIPPED_ITEM_MEMBERS`) breaks against the spreads the published closures
 * draw: a spread no row names, and a row no closure spreads, a published `data` key does not
 * hold or whose entry is not published.
 */
export function strippedMemberFaults({ manifest, reader }, stripped) {
  const spread = new Set(manifest.flatMap((entry) => itemSpreadIds(entry, reader)));
  return [
    ...[...spread]
      .filter((id) => !stripped.includes(id))
      .map((id) => `${id} is spread per item and not stripped: add it to STRIPPED_ITEM_MEMBERS`),
    ...stripped
      .filter((id) => !spread.has(id))
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
 * rule, and a publishable candidate that is neither published nor listed.
 */
export function exclusionFailures(context) {
  const { exclusions, rows } = context;
  if (exclusions === null) return [`${EXCLUSIONS_PATH} is missing`];
  const report = ratchetReport(context);
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
