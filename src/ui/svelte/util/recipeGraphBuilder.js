/**
 * recipeGraphBuilder.js — Pure graph construction, layout, and filter functions (T-057)
 *
 * No Foundry or DOM dependencies. All inputs/outputs are plain objects.
 *
 * ## Bounding and indexing (issue 1082, under the issue 1070 performance programme)
 *
 * Three properties this module has to hold at corpus scale, in the order they bite:
 *
 * 1. **Cycle detection must not recurse.** `_assignLayers` used a recursive `dfs`, which
 *    threw `RangeError: Maximum call stack size exceeded` on a dependency chain deeper than
 *    roughly 8,000 recipes — measured on this checkout at depth 8,193. That is a crash, not
 *    a slow render, and it arrived long before any quadratic edge or SVG cost mattered.
 *    {@link _walkDepthFirst} is an explicit-stack transliteration of that recursion: same
 *    visit order, same GRAY/BLACK timing, therefore the same `cycleEdgeIds`.
 * 2. **Edge derivation is producer x consumer.** One component produced by P recipes and
 *    consumed by C recipes yields P*C edges, so an unscoped graph over a large corpus is
 *    quadratic in recipes. {@link buildBoundedRecipeGraph} bounds the NODE set first and
 *    then stops emitting at an edge budget, so the bound bounds WORK and not merely output.
 * 3. **The producer/consumer relation is an index, not a rescan.** {@link createRecipeGraphIndex}
 *    is built once per recipe revision and re-queried per filter interaction; see
 *    `adminStore`'s revision-token keyed cache.
 *
 * A bound that silently truncated would be worse than no bound: the consumer would render a
 * plausible-looking partial graph and call it the system. Every query therefore returns a
 * `bound` descriptor alongside the nodes and edges, `layoutGraph` and `filterGraph` carry it
 * through unchanged, and a graph is only complete when `bound.complete` is `true`.
 */

import { DEFAULT_RECIPE_IMAGE } from './recipeImageIcons.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LAYER_SPACING = 250;
export const NODE_SPACING = 120;
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 80;

/**
 * The default graph bound (issue 1082).
 *
 * Recorded canonically in `openspec/specs/ui-integration/spec.md` rather than living here as
 * a magic number: which neighbourhood a GM is shown is a product decision, not an
 * implementation detail. Measured basis for these figures is the `recipe-graph` scale
 * profile — at 500 nodes / 3,568 edges the bounded layout is single-digit milliseconds,
 * while the unbounded producer x consumer derivation over a 10,000-recipe corpus is
 * quadratic.
 */
export const DEFAULT_GRAPH_MAX_NODES = 500;
export const DEFAULT_GRAPH_MAX_EDGES = 2000;

/** DFS colours for cycle detection. Module-scoped so the explicit-stack walk can read them. */
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/** Shared empty list, so a missing adjacency entry allocates nothing. */
const NO_NEIGHBOURS = Object.freeze([]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract input and output component IDs from a recipe.
 * Walks ingredientSets[].ingredientGroups[].options[].match.componentId (inputs)
 * and resultGroups[].results[].componentId (outputs).
 *
 * @param {object} recipe
 * @returns {{ inputIds: Set<string>, outputIds: Set<string> }}
 */
export function extractComponentIds(recipe) {
  const inputIds = new Set();
  const outputIds = new Set();

  for (const set of recipe.ingredientSets || []) {
    for (const group of set.ingredientGroups || []) {
      for (const option of group.options || []) {
        const cid = option?.match?.componentId || option?.componentId || option?.systemItemId;
        if (cid) inputIds.add(cid);
      }
    }
    // Legacy flat ingredients
    for (const ing of set.ingredients || []) {
      const cid = ing?.match?.componentId || ing?.componentId || ing?.systemItemId;
      if (cid) inputIds.add(cid);
    }
  }

  for (const group of recipe.resultGroups || []) {
    for (const result of group.results || []) {
      const cid = result?.componentId || result?.systemItemId;
      if (cid) outputIds.add(cid);
    }
  }

  return { inputIds, outputIds };
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Add one recipe id to a component-keyed set map, creating the set on first use.
 *
 * A `Set` rather than an array because the original construction used one: a recipe naming
 * the same component twice must contribute one entry, and the set's insertion order is what
 * makes the derived edge order stable.
 *
 * @param {Map<string, Set<string>>} target
 * @param {string} componentId
 * @param {string} recipeId
 */
function _addRecipeToComponent(target, componentId, recipeId) {
  const existing = target.get(componentId);
  if (existing) existing.add(recipeId);
  else target.set(componentId, new Set([recipeId]));
}

/**
 * Freeze a component-keyed set map into a component-keyed array map, preserving order.
 *
 * @param {Map<string, Set<string>>} sets
 * @returns {Map<string, string[]>}
 */
function _toIdLists(sets) {
  const lists = new Map();
  for (const [componentId, ids] of sets) lists.set(componentId, [...ids]);
  return lists;
}

/**
 * Build the retained producer/consumer index for a recipe corpus (issue 1082).
 *
 * This is the structure every graph query reads, and it is deliberately the ONLY thing that
 * is retained. It stores the producer/consumer relation *through components* rather than a
 * materialised recipe-to-recipe adjacency, because the recipe-to-recipe relation is the
 * producer x consumer product this issue exists to bound — materialising it for the whole
 * corpus would build the very edge explosion the bounded query avoids. Neighbours are
 * expanded on demand instead, one seed at a time.
 *
 * The index holds node SEEDS, not nodes. `layoutGraph` mutates the node objects it is given
 * (`layer`, `position`, `x`, `y`), so handing the same objects to two queries would let one
 * layout leak into the next; {@link buildBoundedRecipeGraph} materialises a fresh node per
 * query instead.
 *
 * Building it is O(recipes x component references) and it is safe to retain for as long as
 * the corpus is unchanged — see `adminStore`, which keys it on the recipe revision token
 * minted by `RecipeManager` (issue 1076) rather than on a corpus hash.
 *
 * @param {object[]} recipes
 * @returns {{recipeCount: number, nodeSeedById: Map<string, object>,
 *   producerRecipeIdsByComponentId: Map<string, string[]>,
 *   consumerRecipeIdsByComponentId: Map<string, string[]>}}
 */
export function createRecipeGraphIndex(recipes) {
  const nodeSeedById = new Map();
  const producerSets = new Map();
  const consumerSets = new Map();

  for (const recipe of recipes || []) {
    const { inputIds, outputIds } = extractComponentIds(recipe);

    nodeSeedById.set(recipe.id, {
      id: recipe.id,
      name: recipe.name,
      img: recipe.img || DEFAULT_RECIPE_IMAGE,
      category: recipe.category || '',
      inputComponentIds: inputIds,
      outputComponentIds: outputIds
    });

    for (const cid of outputIds) _addRecipeToComponent(producerSets, cid, recipe.id);
    for (const cid of inputIds) _addRecipeToComponent(consumerSets, cid, recipe.id);
  }

  return {
    recipeCount: nodeSeedById.size,
    nodeSeedById,
    producerRecipeIdsByComponentId: _toIdLists(producerSets),
    consumerRecipeIdsByComponentId: _toIdLists(consumerSets)
  };
}

/**
 * A fresh, layout-ready node for one index seed.
 *
 * @param {object} seed
 * @returns {object}
 */
function _materializeNode(seed) {
  return {
    id: seed.id,
    name: seed.name,
    img: seed.img,
    category: seed.category,
    layer: 0,
    position: 0,
    x: 0,
    y: 0,
    inputComponentIds: seed.inputComponentIds,
    outputComponentIds: seed.outputComponentIds,
    inEdges: [],
    outEdges: []
  };
}

/**
 * Every recipe that consumes something this recipe produces, plus every recipe that produces
 * something it consumes — one hop of the undirected dependency relation.
 *
 * @param {object} index
 * @param {string} recipeId
 * @returns {string[]}
 */
function _neighbourIds(index, recipeId) {
  const seed = index.nodeSeedById.get(recipeId);
  if (!seed) return NO_NEIGHBOURS;
  const neighbours = [];
  for (const cid of seed.outputComponentIds) {
    for (const id of index.consumerRecipeIdsByComponentId.get(cid) || NO_NEIGHBOURS) {
      if (id !== recipeId) neighbours.push(id);
    }
  }
  for (const cid of seed.inputComponentIds) {
    for (const id of index.producerRecipeIdsByComponentId.get(cid) || NO_NEIGHBOURS) {
      if (id !== recipeId) neighbours.push(id);
    }
  }
  return neighbours;
}

/**
 * The seed recipe ids for each supported scope, and that scope's default hop radius.
 *
 * A `null` seed list means "every recipe" and is the one scope {@link _selectNodeIds} refuses
 * to truncate — see the note there.
 */
const GRAPH_SCOPES = Object.freeze({
  all: { defaultHops: 0, seeds: () => null },
  recipe: {
    defaultHops: 2,
    seeds: (index, scope) => (index.nodeSeedById.has(scope.recipeId) ? [scope.recipeId] : [])
  },
  cohort: {
    // Zero hops by default: a search or category cohort is the set the GM asked for, so
    // expanding it would silently answer a different question.
    defaultHops: 0,
    seeds: (index, scope) =>
      (scope.recipeIds || []).filter((id) => index.nodeSeedById.has(id))
  },
  component: {
    defaultHops: 0,
    // Producers and consumers are INTERLEAVED, not concatenated. A hub component with 600
    // producers and 600 consumers truncates to the bound, and a concatenated list would fill
    // all 500 slots with producers and hand back a 500-node graph with zero edges — a
    // technically-disclosed answer that still looks like "nothing depends on this".
    seeds: (index, scope) =>
      _interleave(
        index.producerRecipeIdsByComponentId.get(scope.componentId) || NO_NEIGHBOURS,
        index.consumerRecipeIdsByComponentId.get(scope.componentId) || NO_NEIGHBOURS
      )
  }
});

/**
 * Alternate two id lists, longest tail last.
 *
 * @param {string[]} left
 * @param {string[]} right
 * @returns {string[]}
 */
function _interleave(left, right) {
  const merged = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (index < left.length) merged.push(left[index]);
    if (index < right.length) merged.push(right[index]);
  }
  return merged;
}

/** Every scope name {@link buildBoundedRecipeGraph} accepts. */
export const GRAPH_SCOPE_NAMES = Object.freeze(Object.keys(GRAPH_SCOPES));

/**
 * Choose the node set for one scope, stopping at `maxNodes`.
 *
 * The `all` scope is deliberately NOT truncated to its first `maxNodes` recipes. There is no
 * comprehensible 500-recipe subset of an unscoped 10,000-recipe corpus, and showing one would
 * be exactly the plausible-looking partial this bound exists to prevent — the GM would read it
 * as their system. An over-budget `all` query therefore returns no nodes and
 * `requiresScope: true`, which asks the consumer for a scope (or an explicit unbounded
 * request) instead of quietly answering a different question. A SCOPED walk is truncated at
 * its frontier, because "N hops out from here, cut off at the bound" is a statement a GM can
 * act on.
 *
 * @param {object} index
 * @param {{scope: object, hops: number, maxNodes: number}} options
 * @returns {{ids: string[], candidateNodeCount: number|null, truncated: boolean,
 *   requiresScope: boolean}}
 */
function _selectNodeIds(index, { scope, hops, maxNodes }) {
  const seedIds = GRAPH_SCOPES[scope.type].seeds(index, scope);
  if (seedIds === null) {
    const all = [...index.nodeSeedById.keys()];
    if (all.length <= maxNodes) {
      return { ids: all, candidateNodeCount: all.length, truncated: false, requiresScope: false };
    }
    return { ids: [], candidateNodeCount: all.length, truncated: true, requiresScope: true };
  }

  const distinctSeedIds = [...new Set(seedIds)];
  const selected = new Set(distinctSeedIds.slice(0, maxNodes));
  const queue = distinctSeedIds.slice(0, maxNodes).map((id) => ({ id, hop: 0 }));
  let head = 0;

  while (head < queue.length && selected.size < maxNodes) {
    const { id, hop } = queue[head++];
    if (hop >= hops) continue;
    for (const neighbourId of _neighbourIds(index, id)) {
      if (selected.size >= maxNodes) break;
      if (selected.has(neighbourId)) continue;
      selected.add(neighbourId);
      queue.push({ id: neighbourId, hop: hop + 1 });
    }
  }

  const truncated = distinctSeedIds.length > maxNodes || head < queue.length;
  return {
    ids: [...selected],
    // At zero hops the candidate set IS the seed set, so the count is exact even when
    // truncated. Past that, stopping at the bound stops before the neighbourhood's true size
    // is known, and inventing a number there would be a guess presented as a count.
    candidateNodeCount: hops === 0 ? distinctSeedIds.length : (truncated ? null : selected.size),
    truncated,
    requiresScope: false
  };
}

/** A fresh edge record. */
function _newEdge(edgeId, sourceId, targetId, componentId) {
  return {
    id: edgeId,
    sourceId,
    targetId,
    componentIds: [componentId],
    isCycleEdge: false,
    path: ''
  };
}

/**
 * Emit every producer x consumer pair for one shared component, up to the edge budget.
 *
 * @returns {boolean} `false` when the budget stopped emission part-way.
 */
function _emitComponentPairs({ edgeMap, componentId, producers, consumers, maxEdges }) {
  for (const producerId of producers) {
    for (const consumerId of consumers) {
      if (producerId === consumerId) continue; // Skip self-loops
      const edgeId = `${producerId}->${consumerId}`;
      const existing = edgeMap.get(edgeId);
      if (existing) {
        existing.componentIds.push(componentId);
        continue;
      }
      if (edgeMap.size >= maxEdges) return false;
      edgeMap.set(edgeId, _newEdge(edgeId, producerId, consumerId, componentId));
    }
  }
  return true;
}

/**
 * Derive the edges among a selected node set.
 *
 * Walks the index's component-keyed producer map — the same order the original whole-corpus
 * derivation used, so an unbounded query produces a byte-identical edge list — but filters
 * each component's producers and consumers to the selection BEFORE enumerating pairs, and
 * stops the moment the edge budget is reached. That is what makes the bound bound work
 * rather than output: the pathological case (`maxNodes` producers x `maxNodes` consumers of
 * one hub component) would enumerate 250,000 pairs at a 500-node bound, and this stops at
 * `maxEdges` + one consumer list.
 *
 * @param {object} index
 * @param {Set<string>} selected
 * @param {number} maxEdges
 * @returns {{edges: object[], truncated: boolean}}
 */
function _deriveEdges(index, selected, maxEdges) {
  const edgeMap = new Map(); // `${srcId}->${tgtId}` -> GraphEdge
  for (const [componentId, producerIds] of index.producerRecipeIdsByComponentId) {
    const consumerIds = index.consumerRecipeIdsByComponentId.get(componentId);
    if (!consumerIds) continue;
    const producers = producerIds.filter((id) => selected.has(id));
    if (producers.length === 0) continue;
    const consumers = consumerIds.filter((id) => selected.has(id));
    if (consumers.length === 0) continue;
    if (!_emitComponentPairs({ edgeMap, componentId, producers, consumers, maxEdges })) {
      return { edges: [...edgeMap.values()], truncated: true };
    }
  }
  return { edges: [...edgeMap.values()], truncated: false };
}

/** Populate `inEdges` / `outEdges` on the materialised nodes. */
function _linkNodeEdges(nodes, edges) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    nodeById.get(edge.sourceId)?.outEdges.push(edge.id);
    nodeById.get(edge.targetId)?.inEdges.push(edge.id);
  }
}

/**
 * Query a bounded subgraph out of a retained index (issue 1082).
 *
 * @param {object} index From {@link createRecipeGraphIndex}.
 * @param {object} [options]
 * @param {{type: string, recipeId?: string, recipeIds?: string[], componentId?: string}}
 *   [options.scope] Defaults to `{type: 'all'}`.
 * @param {number} [options.hops] Overrides the scope's default hop radius.
 * @param {number} [options.maxNodes]
 * @param {number} [options.maxEdges]
 * @param {boolean} [options.unbounded] The explicit "show me everything" request. It lifts
 *   both budgets; it does not make the result complete by fiat, and `bound` still describes
 *   what was produced.
 * @returns {{nodes: object[], edges: object[], bound: object}}
 */
export function buildBoundedRecipeGraph(index, options = {}) {
  const scope = options.scope || { type: 'all' };
  if (!GRAPH_SCOPES[scope.type]) {
    throw new Error(
      `Unknown recipe graph scope "${scope.type}". Known scopes: ${GRAPH_SCOPE_NAMES.join(', ')}`
    );
  }
  const unbounded = options.unbounded === true;
  const maxNodes = unbounded ? Infinity : (options.maxNodes ?? DEFAULT_GRAPH_MAX_NODES);
  const maxEdges = unbounded ? Infinity : (options.maxEdges ?? DEFAULT_GRAPH_MAX_EDGES);
  const hops = options.hops ?? GRAPH_SCOPES[scope.type].defaultHops;

  const selection = _selectNodeIds(index, { scope, hops, maxNodes });
  const nodes = selection.ids.map((id) => _materializeNode(index.nodeSeedById.get(id)));
  const { edges, truncated: edgesTruncated } = _deriveEdges(
    index,
    new Set(selection.ids),
    maxEdges
  );
  _linkNodeEdges(nodes, edges);

  const limitedBy = _resolveLimitedBy(selection.truncated, edgesTruncated);
  return {
    nodes,
    edges,
    bound: {
      scope: scope.type,
      hops,
      unbounded,
      maxNodes: unbounded ? null : maxNodes,
      maxEdges: unbounded ? null : maxEdges,
      totalRecipeCount: index.recipeCount,
      candidateNodeCount: selection.candidateNodeCount,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      // The one field a consumer must read before rendering. `false` means the picture is
      // a fragment of the system and must be presented as one.
      complete: limitedBy === null,
      limitedBy,
      requiresScope: selection.requiresScope
    }
  };
}

/**
 * Which budget stopped the query, in the order a consumer should report them.
 *
 * @param {boolean} nodesTruncated
 * @param {boolean} edgesTruncated
 * @returns {'nodes'|'edges'|null}
 */
function _resolveLimitedBy(nodesTruncated, edgesTruncated) {
  if (nodesTruncated) return 'nodes';
  if (edgesTruncated) return 'edges';
  return null;
}

/**
 * Build a complete recipe dependency graph from a list of recipes and components.
 *
 * The unbounded query, kept as-is for callers that already know their corpus is small and
 * for the benchmark harness's before/after comparison. Prefer
 * {@link buildBoundedRecipeGraph} against a retained {@link createRecipeGraphIndex} anywhere
 * the corpus size is not known in advance.
 *
 * @param {object[]} recipes
 * @param {object[]} components - managed components (unused in edge construction but kept for API symmetry)
 * @returns {{ nodes: GraphNode[], edges: GraphEdge[], bound?: object }}
 */
export function buildRecipeGraph(recipes, components = []) {
  if (!recipes || recipes.length === 0) {
    return { nodes: [], edges: [] };
  }
  return buildBoundedRecipeGraph(createRecipeGraphIndex(recipes), { unbounded: true });
}

// ---------------------------------------------------------------------------
// Graph layout
// ---------------------------------------------------------------------------

/**
 * Assign x/y coordinates to nodes using a layered (Sugiyama-style) layout.
 * Mutates node and edge objects in place and returns the updated graph.
 *
 * @param {{ nodes: object[], edges: object[], bound?: object }} graph
 * @param {object} [options]
 * @param {{bump: (key: string, amount?: number) => void}} [options.instrumentation] The
 *   operation-counter seam (issue 1072's vocabulary). Layout bumps
 *   `graphAdjacencyLookups` once per incoming-neighbour lookup and
 *   `graphIncomingEdgesExamined` by the length of each list it reads, so
 *   "layout performs no repeated whole-edge filtering per node" is an assertion
 *   (`graphIncomingEdgesExamined <= edges.length`) rather than a code-review note.
 * @returns {{ nodes: object[], edges: object[], width: number, height: number,
 *   bound: object|null }}
 */
export function layoutGraph(graph, options = {}) {
  const { nodes, edges } = graph;
  const bound = graph.bound ?? null;
  if (nodes.length === 0) return { nodes, edges, width: 0, height: 0, bound };

  const layerSpacing = options.layerSpacing || LAYER_SPACING;
  const nodeSpacing = options.nodeSpacing || NODE_SPACING;
  const nodeWidth = options.nodeWidth || NODE_WIDTH;
  const nodeHeight = options.nodeHeight || NODE_HEIGHT;
  const instrumentation = options.instrumentation || null;

  // Build adjacency maps
  const edgeById = new Map(edges.map(e => [e.id, e]));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // --- Step 1: Find connected components (undirected) ---
  const components = _findConnectedComponents(nodes, edges);
  // ONE pass assigns every edge to its component. This replaces a per-component
  // `edges.filter(e => componentNodeIds.includes(...))`, which was
  // O(components x edges x nodes) — 1,764,840 membership probes on the 500-node dense
  // benchmark fixture alone (issue 1082).
  const edgesByComponent = _partitionEdgesByComponent(components, edges);

  let currentXOffset = 0;
  let totalWidth = 0;
  let totalHeight = 0;

  for (const [componentIndex, componentNodeIds] of components.entries()) {
    const componentNodes = componentNodeIds.map(id => nodeById.get(id));
    const componentEdges = edgesByComponent[componentIndex];

    // --- Step 2: Topological sort with cycle detection within component ---
    const { layerAssignment, cycleEdgeIds } = _assignLayers(componentNodes, componentEdges);

    // Mark cycle edges
    for (const eid of cycleEdgeIds) {
      const edge = edgeById.get(eid);
      if (edge) edge.isCycleEdge = true;
    }

    // Group nodes by layer
    const layerGroups = new Map();
    for (const node of componentNodes) {
      const layer = layerAssignment.get(node.id) || 0;
      node.layer = layer;
      if (!layerGroups.has(layer)) layerGroups.set(layer, []);
      layerGroups.get(layer).push(node);
    }

    // --- Step 3: Order within layers using barycenter heuristic ---
    const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
    _orderWithinLayers(sortedLayers, layerGroups, componentEdges, instrumentation);

    // --- Step 4: Assign coordinates ---
    let componentWidth = 0;
    let componentHeight = 0;

    for (const layerIdx of sortedLayers) {
      const layerNodes = layerGroups.get(layerIdx);
      const layerHeight = layerNodes.length * nodeSpacing;
      const layerX = currentXOffset + layerIdx * layerSpacing;
      componentWidth = Math.max(componentWidth, layerIdx * layerSpacing + nodeWidth);

      for (let pos = 0; pos < layerNodes.length; pos++) {
        const node = layerNodes[pos];
        node.position = pos;
        node.x = layerX;
        // Center layer vertically (we don't know total height yet, use position * spacing)
        node.y = pos * nodeSpacing;
      }

      componentHeight = Math.max(componentHeight, layerHeight);
    }

    currentXOffset += componentWidth + layerSpacing;
    totalWidth = currentXOffset;
    totalHeight = Math.max(totalHeight, componentHeight);
  }

  // --- Step 5: Compute edge paths ---
  _computeEdgePaths(edges, nodeById, nodeHeight, nodeWidth);

  return { nodes, edges, width: totalWidth, height: totalHeight, bound };
}

/**
 * Find connected components using undirected BFS.
 *
 * The queue is an append-only array read through a head cursor rather than an array drained
 * with `queue.shift()`. `shift()` is O(queue length) on a large array, so the original made
 * component discovery quadratic in the size of the largest component — the exact shape that
 * bites on the dense corpus this issue targets.
 *
 * @returns {string[][]} Each element is an array of node IDs in that component.
 */
function _findConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map(n => [n.id, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.add(edge.targetId);
    adjacency.get(edge.targetId)?.add(edge.sourceId);
  }

  const visited = new Set();
  const components = [];

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const component = [];
    const queue = [node.id];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) || NO_NEIGHBOURS) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }

  return components;
}

/**
 * Bucket every edge into the connected component that holds both of its endpoints.
 *
 * Equivalent to the per-component `edges.filter(...)` it replaces — including the edge order
 * within each bucket, which layout is sensitive to — but one pass over the edges instead of
 * one pass per component with a linear array membership probe per endpoint.
 *
 * @param {string[][]} components
 * @param {object[]} edges
 * @returns {object[][]} One edge array per component, index-aligned with `components`.
 */
function _partitionEdgesByComponent(components, edges) {
  const componentIndexByNodeId = new Map();
  for (const [index, nodeIds] of components.entries()) {
    for (const nodeId of nodeIds) componentIndexByNodeId.set(nodeId, index);
  }

  const buckets = components.map(() => []);
  for (const edge of edges) {
    const sourceComponent = componentIndexByNodeId.get(edge.sourceId);
    if (sourceComponent === undefined) continue;
    if (componentIndexByNodeId.get(edge.targetId) !== sourceComponent) continue;
    buckets[sourceComponent].push(edge);
  }
  return buckets;
}

/**
 * One depth-first walk from a root, using an EXPLICIT stack (issue 1082).
 *
 * This is a transliteration of the recursive `dfs` it replaces, not a re-derivation: a frame
 * carries the node's outgoing edges and a cursor into them, a target is coloured GRAY at the
 * moment it is pushed, and a node goes BLACK only once its cursor has passed its last edge.
 * Visit order and colour timing are therefore identical, which is what keeps `cycleEdgeIds`
 * — and every downstream layer assignment — unchanged.
 *
 * The recursion it replaces threw `RangeError: Maximum call stack size exceeded` at a chain
 * depth of 8,193 on this checkout, well inside the 10,000-recipe corpus this programme
 * supports. The stack here is a heap array, so depth is bounded by memory rather than by the
 * call stack.
 *
 * @param {string} rootId
 * @param {{outgoing: Map<string, object[]>, color: Map<string, number>,
 *   cycleEdgeIds: Set<string>}} state
 */
function _walkDepthFirst(rootId, { outgoing, color, cycleEdgeIds }) {
  const stack = [{ nodeId: rootId, edges: outgoing.get(rootId) || NO_NEIGHBOURS, index: 0 }];
  color.set(rootId, GRAY);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.edges.length) {
      color.set(frame.nodeId, BLACK);
      stack.pop();
      continue;
    }
    const edge = frame.edges[frame.index++];
    const targetColor = color.get(edge.targetId);
    if (targetColor === GRAY) {
      // Back edge — cycle
      cycleEdgeIds.add(edge.id);
    } else if (targetColor === WHITE) {
      color.set(edge.targetId, GRAY);
      stack.push({
        nodeId: edge.targetId,
        edges: outgoing.get(edge.targetId) || NO_NEIGHBOURS,
        index: 0
      });
    }
  }
}

/**
 * Assign layers using longest-path algorithm with DFS cycle detection.
 * @returns {{ layerAssignment: Map<string, number>, cycleEdgeIds: Set<string> }}
 */
function _assignLayers(nodes, edges) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map(nodes.map(n => [n.id, []]));
  const incoming = new Map(nodes.map(n => [n.id, []]));

  for (const edge of edges) {
    outgoing.get(edge.sourceId)?.push(edge);
    incoming.get(edge.targetId)?.push(edge);
  }

  const cycleEdgeIds = new Set();
  const layerAssignment = new Map();
  const color = new Map(nodes.map(n => [n.id, WHITE]));

  // DFS to find cycle edges. Explicit stack, never recursion — see _walkDepthFirst.
  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      _walkDepthFirst(node.id, { outgoing, color, cycleEdgeIds });
    }
  }

  // Assign layers: BFS from roots, ignoring cycle edges
  const nonCycleOutgoing = new Map(nodes.map(n => [n.id, []]));
  const nonCycleIncoming = new Map(nodes.map(n => [n.id, 0]));

  for (const edge of edges) {
    if (!cycleEdgeIds.has(edge.id)) {
      nonCycleOutgoing.get(edge.sourceId)?.push(edge);
      nonCycleIncoming.set(edge.targetId, (nonCycleIncoming.get(edge.targetId) || 0) + 1);
    }
  }

  // Kahn's algorithm on the DAG (cycle edges removed)
  const queue = [];
  for (const node of nodes) {
    if ((nonCycleIncoming.get(node.id) || 0) === 0) {
      queue.push(node.id);
      layerAssignment.set(node.id, 0);
    }
  }

  // BFS: longest path layer assignment. Head cursor, not `queue.shift()`: draining a large
  // array from the front is O(length) per element and made this quadratic in node count.
  const processed = new Set();
  let head = 0;
  while (head < queue.length) {
    const currentId = queue[head++];
    if (processed.has(currentId)) continue;
    processed.add(currentId);
    const currentLayer = layerAssignment.get(currentId) || 0;

    for (const edge of nonCycleOutgoing.get(currentId) || NO_NEIGHBOURS) {
      const tgtId = edge.targetId;
      const newLayer = currentLayer + 1;
      if (!layerAssignment.has(tgtId) || layerAssignment.get(tgtId) < newLayer) {
        layerAssignment.set(tgtId, newLayer);
      }
      // Decrement in-degree
      const newIndegree = (nonCycleIncoming.get(tgtId) || 1) - 1;
      nonCycleIncoming.set(tgtId, newIndegree);
      if (newIndegree <= 0) queue.push(tgtId);
    }
  }

  // Any node not assigned (isolated in cycle) gets layer 0
  for (const node of nodes) {
    if (!layerAssignment.has(node.id)) layerAssignment.set(node.id, 0);
  }

  return { layerAssignment, cycleEdgeIds };
}

/**
 * The average position, in the previous layer, of one node's incoming neighbours.
 *
 * @returns {number} `Infinity` when the node has no neighbour in the previous layer, which
 *   sorts it after every node that does — the original behaviour.
 */
function _barycenterOf(sourceIds, { nodeLayer, prevLayerIdx, prevPosition }) {
  let sum = 0;
  let count = 0;
  for (const sourceId of sourceIds) {
    if (nodeLayer.get(sourceId) !== prevLayerIdx) continue;
    sum += prevPosition.get(sourceId) ?? 0;
    count += 1;
  }
  return count > 0 ? sum / count : Infinity;
}

/**
 * Order nodes within layers using barycenter heuristic to minimize crossings.
 * Mutates layer groups in place.
 *
 * The incoming-neighbour lists are precomputed in ONE pass over the edges (issue 1082). The
 * original ran `edges.filter(...)` per node per layer, which is O(nodes x edges) — 1,068,168
 * edge examinations for the 3,568-edge dense benchmark fixture. Each edge now appears in
 * exactly one target's list and each node's list is read at most once, so
 * `graphIncomingEdgesExamined` cannot exceed the edge count. That inequality is the
 * assertable form of "layout performs no repeated whole-edge filtering per node".
 *
 * @param {number[]} sortedLayers
 * @param {Map<number, object[]>} layerGroups
 * @param {object[]} edges
 * @param {{bump: (key: string, amount?: number) => void}|null} [instrumentation]
 */
function _orderWithinLayers(sortedLayers, layerGroups, edges, instrumentation = null) {
  // Build quick lookup: nodeId -> layer
  const nodeLayer = new Map();
  for (const [layer, nodes] of layerGroups.entries()) {
    for (const node of nodes) nodeLayer.set(node.id, layer);
  }

  // Build quick lookup: targetId -> incoming source ids, in edge order.
  const incomingSourceIdsByTargetId = new Map();
  for (const edge of edges) {
    const existing = incomingSourceIdsByTargetId.get(edge.targetId);
    if (existing) existing.push(edge.sourceId);
    else incomingSourceIdsByTargetId.set(edge.targetId, [edge.sourceId]);
  }

  // For each layer (except first), sort by average position of neighbors in previous layer
  for (let i = 1; i < sortedLayers.length; i++) {
    const layerIdx = sortedLayers[i];
    const prevLayerIdx = sortedLayers[i - 1];
    const prevNodes = layerGroups.get(prevLayerIdx) || [];
    const prevPosition = new Map(prevNodes.map((n, pos) => [n.id, pos]));

    const currentNodes = layerGroups.get(layerIdx) || [];
    const barycenters = new Map();

    for (const node of currentNodes) {
      const sourceIds = incomingSourceIdsByTargetId.get(node.id) || NO_NEIGHBOURS;
      instrumentation?.bump('graphAdjacencyLookups');
      instrumentation?.bump('graphIncomingEdgesExamined', sourceIds.length);
      barycenters.set(
        node.id,
        _barycenterOf(sourceIds, { nodeLayer, prevLayerIdx, prevPosition })
      );
    }

    currentNodes.sort((a, b) => barycenters.get(a.id) - barycenters.get(b.id));
    layerGroups.set(layerIdx, currentNodes);
  }
}

/**
 * Compute SVG cubic bezier path data for each edge.
 * Edges go from the right edge of the source node to the left edge of the target node.
 */
function _computeEdgePaths(edges, nodeById, nodeHeight, nodeWidth) {
  const halfH = nodeHeight / 2;
  for (const edge of edges) {
    const src = nodeById.get(edge.sourceId);
    const tgt = nodeById.get(edge.targetId);
    if (!src || !tgt) { edge.path = ''; continue; }

    const x1 = src.x + nodeWidth;
    const y1 = src.y + halfH;
    const x2 = tgt.x;
    const y2 = tgt.y + halfH;

    const cx1 = x1 + (x2 - x1) / 3;
    const cx2 = x2 - (x2 - x1) / 3;

    edge.path = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  }
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * Filter a graph by category and/or search term.
 * Includes an edge only if both source and target nodes are in the filtered set.
 *
 * The `bound` descriptor is carried through unchanged: filtering a bounded graph narrows what
 * is shown but cannot make an incomplete graph complete, so a consumer must still disclose it.
 *
 * @param {{ nodes: object[], edges: object[], bound?: object }} graph
 * @param {{ category?: string, searchTerm?: string }} filters
 * @returns {{ nodes: object[], edges: object[], width: number, height: number,
 *   bound: object|null }}
 */
export function filterGraph(graph, { category = '', searchTerm = '' } = {}) {
  let nodes = graph.nodes;
  const lowerSearch = (searchTerm || '').toLowerCase().trim();
  const lowerCategory = (category || '').toLowerCase().trim();

  if (lowerSearch) {
    nodes = nodes.filter(n => n.name.toLowerCase().includes(lowerSearch));
  }
  if (lowerCategory) {
    nodes = nodes.filter(n => (n.category || '').toLowerCase() === lowerCategory);
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = graph.edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

  return {
    nodes,
    edges,
    width: graph.width || 0,
    height: graph.height || 0,
    bound: graph.bound ?? null
  };
}
