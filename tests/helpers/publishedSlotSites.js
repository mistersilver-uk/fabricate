/**
 * Where a published `slot` key's render tags can draw, judged on a component's parsed template
 * (issue 2843). A key's _sites_ are its render tags, each counted once per `{@render}` call of the
 * snippet that holds it. A key passes when no two of its sites can be live together: they lie in
 * different branches of one `{#if}` chain, `{:else if}` and `{:else}` included. Anything the analysis
 * cannot place fails closed.
 * Limit: a site is judged by the template and the script of the one file, so a component that draws
 * a slot another file passed on is not seen, and `{#await}` and `{#each}` fallbacks never separate.
 */
import { walkNodes } from './moduleAst.js';

/** Blocks and components under which one render tag can draw several times. */
const REPEATING = new Set([
  'EachBlock',
  'KeyBlock',
  'SnippetBlock',
  'Component',
  'SvelteComponent',
  'SvelteSelf',
]);
/** What may hold a snippet's call: the repeating blocks, and a boundary that renders snippets itself. */
const CALL_BARRED = new Set([...REPEATING, 'SvelteBoundary']);
const PHRASING_PARENTS = new Set(['button', 'span', 'a', 'p']);
const MOTION = new Set(['TransitionDirective', 'AnimateDirective']);

export const REPEATED = 'is a slot key rendered inside {#each}, {#key}, {#snippet} or a component';
export const UNGUARDED = 'is a slot key rendered without ?. or an {#if} guard';

/** Each typed node's parent and the key it hangs from, for every node under `roots`. */
function parentsOf(...roots) {
  const parents = new Map();
  const seen = new Set();
  const visit = (node, parent, edge) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, edge);
      return;
    }
    const typed = typeof node.type === 'string';
    if (typed) parents.set(node, { parent, edge });
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') visit(value, typed ? node : parent, key);
    }
  };
  for (const root of roots) visit(root, null, null);
  return parents;
}

const calleeOf = (tag) => {
  const call =
    tag.expression.type === 'ChainExpression' ? tag.expression.expression : tag.expression;
  return { call, name: call.callee?.type === 'Identifier' ? call.callee.name : null };
};

/** The ancestors of `node`, nearest first, each with the key it was reached by. */
function* ancestorsOf(node, parents) {
  for (let link = parents.get(node); link?.parent; link = parents.get(link.parent)) {
    yield { node: link.parent, edge: link.edge };
  }
}

/** Whether a fragment is only the `{:else if}` block that continues its chain. */
const isElseIfBranch = (fragment) =>
  fragment.nodes.length === 1 && fragment.nodes[0].type === 'IfBlock' && fragment.nodes[0].elseif;

/** The first `{#if}` of the chain `block` continues, and the branch number `block` holds in it. */
function chainOf(block, parents) {
  let root = block;
  let index = 0;
  while (root.elseif) {
    const fragment = parents.get(root).parent;
    root = parents.get(fragment).parent;
    index += 1;
  }
  return { root, index };
}

/** Each `{#if}` chain `node` lies in, as chain root -> branch number. */
function framesOf(node, parents) {
  const frames = new Map();
  let child = node;
  for (let link = parents.get(child); link?.parent; link = parents.get(child)) {
    const { parent, edge } = link;
    if (parent.type === 'IfBlock' && (edge === 'consequent' || edge === 'alternate')) {
      const { root, index } = chainOf(parent, parents);
      const skip = edge === 'alternate' && isElseIfBranch(child);
      if (!skip && !frames.has(root)) frames.set(root, index + (edge === 'alternate' ? 1 : 0));
    }
    child = parent;
  }
  return frames;
}

const separated = (a, b) => [...a].some(([root, index]) => b.has(root) && b.get(root) !== index);

/** The identifiers an `&&` chain tests, or the one identifier a test is. */
export function conjuncts(test) {
  if (test.type === 'Identifier') return [test.name];
  if (test.type === 'LogicalExpression' && test.operator === '&&') {
    return [...conjuncts(test.left), ...conjuncts(test.right)];
  }
  return [];
}

/** Whether `tag` is `?.()`, or in the consequent of an `{#if}` or `{:else if}` that tests `local`. */
function guarded(tag, local, parents) {
  if (calleeOf(tag).call.optional === true) return true;
  let child = tag;
  for (let link = parents.get(child); link?.parent; link = parents.get(child)) {
    const { parent, edge } = link;
    if (
      parent.type === 'IfBlock' &&
      edge === 'consequent' &&
      conjuncts(parent.test).includes(local)
    ) {
      return true;
    }
    child = parent;
  }
  return false;
}

/** Every render tag whose callee is the identifier `name`, with its call. */
function tagsCalling(ast, name) {
  return [...walkNodes(ast.fragment)].filter(
    (node) => node.type === 'RenderTag' && calleeOf(node).name === name
  );
}

/** Names a pattern, parameter list or declaration binds. */
function boundNames(...patterns) {
  return patterns.flatMap((pattern) =>
    pattern
      ? [...walkNodes(pattern)]
          .filter((node) => node.type === 'Identifier')
          .map((node) => node.name)
      : []
  );
}

/** Every name the template binds: snippet parameters, `{@const}`, `{#each}` and `{#await}` bindings. */
function templateBindings(ast) {
  const names = new Set();
  for (const node of walkNodes(ast.fragment)) {
    const bound = {
      SnippetBlock: () => boundNames(...node.parameters),
      ConstTag: () => boundNames(node.declaration),
      EachBlock: () => [
        ...boundNames(node.context),
        ...(typeof node.index === 'string' ? [node.index] : []),
      ],
      AwaitBlock: () => boundNames(node.value, node.error),
    }[node.type];
    for (const name of bound?.() ?? []) names.add(name);
  }
  return names;
}

const isNameRead = (node, parent) =>
  !(parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) &&
  !(parent?.type === 'Property' && parent.key === node && !parent.computed);

/**
 * Whether the value an identifier reads can leave the expression it sits in. A test (`{#if}`,
 * `?:`, `Boolean()`, `!`) or the left of an `&&` cannot carry it out, but the result of `x || y`, of
 * `y && x` or of a bare read can.
 */
function valueEscapes(node, parents) {
  let child = node;
  for (let link = parents.get(child); link?.parent; link = parents.get(child)) {
    const { parent, edge } = link;
    if (parent.type === 'UnaryExpression' && parent.operator === '!') return false;
    if (parent.type === 'LogicalExpression') {
      if (parent.operator === '&&' && parent.left === child) return false;
      child = parent;
      continue;
    }
    const call = parent.type === 'CallExpression' && parent.callee?.name === 'Boolean';
    if (call && parent.arguments[0] === child) return false;
    const test = ['IfBlock', 'IfStatement', 'ConditionalExpression'].includes(parent.type);
    return !(test && edge === 'test');
  }
  return true;
}

/** Every read of `local` in the file that is neither a render callee nor a test. */
function strayReads(ast, local, parents) {
  const roots = [ast.fragment, ast.instance, ast.module].filter(Boolean);
  const nodes = roots.flatMap((root) => [...walkNodes(root)]);
  const props = nodes.find(
    (node) => node.type === 'VariableDeclarator' && node.init?.callee?.name === '$props'
  );
  const declared = new Set(props ? [...walkNodes(props.id)] : []);
  return nodes.filter((node) => {
    if (node.type !== 'Identifier' || node.name !== local || declared.has(node)) return false;
    const parent = parents.get(node)?.parent;
    if (!isNameRead(node, parent)) return false;
    const callee = parent?.type === 'CallExpression' && parent.callee === node;
    const rendered =
      callee && [...ancestorsOf(node, parents)].some((a) => a.node.type === 'RenderTag');
    return !rendered && valueEscapes(node, parents);
  });
}

/**
 * Why a top-level snippet cannot count as the one place its calls draw from, or `null` when it can:
 * every reference is a `{@render}` call outside the barred blocks, and it is named once.
 */
function snippetFault(snippet, ast, parents) {
  const { name } = snippet.expression;
  const top = parents.get(snippet).parent === ast.fragment;
  if (!top) return `${name} is declared inside another block`;
  const declared = [...walkNodes(ast.fragment)].filter(
    (node) => node.type === 'SnippetBlock' && node.expression.name === name
  );
  if (declared.length > 1) return `${name} is declared more than once`;
  const calls = tagsCalling(ast, name);
  if (calls.length === 0) return `${name} is rendered by no call`;
  for (const call of calls) {
    const barred = [...ancestorsOf(call, parents)].find((a) => CALL_BARRED.has(a.node.type));
    if (barred) return `${name} is rendered inside ${barred.node.type}`;
  }
  const callees = new Set(calls.map((call) => calleeOf(call).call.callee));
  const roots = [ast.fragment, ast.instance, ast.module].filter(Boolean);
  for (const root of roots) {
    for (const node of walkNodes(root)) {
      if (node.type !== 'Identifier' || node.name !== name || node === snippet.expression) continue;
      if (!isNameRead(node, parents.get(node)?.parent) || callees.has(node)) continue;
      return `${name} is referenced other than by a render call`;
    }
  }
  return null;
}

/** The faults a `slot` key's render sites break, with the strings the one-tag rule used. */
export function slotSiteFaults(ast, key, spec, local) {
  const parents = parentsOf(ast.fragment, ast.instance, ast.module);
  const tags = tagsCalling(ast, local);
  const faults = [];
  if (tags.length === 0) return [`${key} is a slot key no render tag draws`];

  const sites = [];
  const reasons = new Set();
  let repeated = false;
  for (const tag of tags) {
    const climb = [...ancestorsOf(tag, parents)];
    const holder = climb.find((a) => a.node.type === 'SnippetBlock')?.node;
    const inner = climb.slice(0, holder ? climb.findIndex((a) => a.node === holder) : climb.length);
    if (inner.some((a) => REPEATING.has(a.node.type))) repeated = true;
    if (!holder) {
      sites.push({
        tag,
        origin: tag,
        position: framesOf(tag, parents),
        within: framesOf(tag, parents),
      });
      continue;
    }
    const reason = snippetFault(holder, ast, parents);
    if (reason) {
      repeated = true;
      if (!reason.endsWith('rendered by no call')) reasons.add(reason);
      continue;
    }
    const within = framesOf(tag, parents);
    for (const call of tagsCalling(ast, holder.expression.name)) {
      sites.push({ tag, origin: call, position: framesOf(call, parents), within, call });
    }
  }

  if (sites.some((a, i) => sites.slice(i + 1).some((b) => !apart(a, b)))) {
    faults.push(`${key} is a slot key more than one render tag draws`);
  }
  if (tags.some((tag) => calleeOf(tag).call.arguments.length > 0)) {
    faults.push(`${key} is a slot key rendered with an argument`);
  }
  if (tags.some((tag) => !guarded(tag, local, parents))) faults.push(`${key} ${UNGUARDED}`);
  if (repeated) faults.push(`${key} ${REPEATED}`);
  for (const reason of reasons) faults.push(`${key} is a slot key whose snippet fails: ${reason}`);

  if (templateBindings(ast).has(local)) {
    faults.push(`${key} is a slot key whose local is bound again in the template`);
  }
  const stray = strayReads(ast, local, parents);
  if (stray.length > 0) {
    faults.push(`${key} is a slot key whose local is read other than as a render callee or a test`);
  }
  if (sites.length > 1 && [...walkNodes(ast.fragment)].some((node) => MOTION.has(node.type))) {
    faults.push(`${key} is a slot key in a file with a transition or animation`);
  }
  const phrasing = sites.some((site) => {
    const above = [...ancestorsOf(site.origin, parents)];
    return above.some((a) => a.node.type === 'RegularElement' && PHRASING_PARENTS.has(a.node.name));
  });
  if (phrasing && (spec.element ?? 'div') !== 'span') {
    faults.push(`${key} is a slot key inside phrasing content that does not state element span`);
  }
  return faults;
}

/** Whether two sites can never be live together. */
function apart(a, b) {
  return a.origin === b.origin ? separated(a.within, b.within) : separated(a.position, b.position);
}
