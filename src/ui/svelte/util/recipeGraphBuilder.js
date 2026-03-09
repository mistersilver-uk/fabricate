/**
 * recipeGraphBuilder.js — Pure graph construction, layout, and filter functions (T-057)
 *
 * No Foundry or DOM dependencies. All inputs/outputs are plain objects.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LAYER_SPACING = 250;
export const NODE_SPACING = 120;
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 80;

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
 * Build a recipe dependency graph from a list of recipes and components.
 *
 * @param {object[]} recipes
 * @param {object[]} components - managed components (unused in edge construction but kept for API symmetry)
 * @returns {{ nodes: GraphNode[], edges: GraphEdge[] }}
 */
export function buildRecipeGraph(recipes, components = []) {
  if (!recipes || recipes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Build component-to-recipe maps
  const producerMap = new Map(); // componentId -> Set<recipeId>
  const consumerMap = new Map(); // componentId -> Set<recipeId>
  const nodeMap = new Map();    // recipeId -> GraphNode

  for (const recipe of recipes) {
    const { inputIds, outputIds } = extractComponentIds(recipe);

    nodeMap.set(recipe.id, {
      id: recipe.id,
      name: recipe.name,
      img: recipe.img || 'icons/svg/item-bag.svg',
      category: recipe.category || '',
      layer: 0,
      position: 0,
      x: 0,
      y: 0,
      inputComponentIds: inputIds,
      outputComponentIds: outputIds,
      inEdges: [],
      outEdges: []
    });

    for (const cid of outputIds) {
      if (!producerMap.has(cid)) producerMap.set(cid, new Set());
      producerMap.get(cid).add(recipe.id);
    }

    for (const cid of inputIds) {
      if (!consumerMap.has(cid)) consumerMap.set(cid, new Set());
      consumerMap.get(cid).add(recipe.id);
    }
  }

  // Derive edges
  const edgeMap = new Map(); // `${srcId}->${tgtId}` -> GraphEdge
  for (const [cid, producerIds] of producerMap.entries()) {
    const consumers = consumerMap.get(cid);
    if (!consumers) continue;
    for (const producerId of producerIds) {
      for (const consumerId of consumers) {
        if (producerId === consumerId) continue; // Skip self-loops
        const edgeId = `${producerId}->${consumerId}`;
        if (!edgeMap.has(edgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            sourceId: producerId,
            targetId: consumerId,
            componentIds: [],
            isCycleEdge: false,
            path: ''
          });
        }
        edgeMap.get(edgeId).componentIds.push(cid);
      }
    }
  }

  const edges = Array.from(edgeMap.values());
  const nodes = Array.from(nodeMap.values());

  // Populate inEdges/outEdges on nodes
  for (const edge of edges) {
    const src = nodeMap.get(edge.sourceId);
    const tgt = nodeMap.get(edge.targetId);
    if (src) src.outEdges.push(edge.id);
    if (tgt) tgt.inEdges.push(edge.id);
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Graph layout
// ---------------------------------------------------------------------------

/**
 * Assign x/y coordinates to nodes using a layered (Sugiyama-style) layout.
 * Mutates node and edge objects in place and returns the updated graph.
 *
 * @param {{ nodes: object[], edges: object[] }} graph
 * @param {object} [options]
 * @returns {{ nodes: object[], edges: object[], width: number, height: number }}
 */
export function layoutGraph(graph, options = {}) {
  const { nodes, edges } = graph;
  if (nodes.length === 0) return { nodes, edges, width: 0, height: 0 };

  const layerSpacing = options.layerSpacing || LAYER_SPACING;
  const nodeSpacing = options.nodeSpacing || NODE_SPACING;
  const nodeWidth = options.nodeWidth || NODE_WIDTH;
  const nodeHeight = options.nodeHeight || NODE_HEIGHT;

  // Build adjacency maps
  const edgeById = new Map(edges.map(e => [e.id, e]));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // --- Step 1: Find connected components (undirected) ---
  const components = _findConnectedComponents(nodes, edges);

  let currentXOffset = 0;
  let totalWidth = 0;
  let totalHeight = 0;

  for (const componentNodeIds of components) {
    const componentNodes = componentNodeIds.map(id => nodeById.get(id));
    const componentEdges = edges.filter(e =>
      componentNodeIds.includes(e.sourceId) && componentNodeIds.includes(e.targetId)
    );

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
    _orderWithinLayers(sortedLayers, layerGroups, componentEdges);

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

  return { nodes, edges, width: totalWidth, height: totalHeight };
}

/**
 * Find connected components using undirected BFS.
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
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }

  return components;
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
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(nodes.map(n => [n.id, WHITE]));

  function dfs(nodeId) {
    color.set(nodeId, GRAY);
    for (const edge of outgoing.get(nodeId) || []) {
      const tgt = edge.targetId;
      if (color.get(tgt) === GRAY) {
        // Back edge — cycle
        cycleEdgeIds.add(edge.id);
      } else if (color.get(tgt) === WHITE) {
        dfs(tgt);
      }
    }
    color.set(nodeId, BLACK);
  }

  // DFS to find cycle edges
  for (const node of nodes) {
    if (color.get(node.id) === WHITE) dfs(node.id);
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

  // BFS: longest path layer assignment
  const processed = new Set();
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (processed.has(currentId)) continue;
    processed.add(currentId);
    const currentLayer = layerAssignment.get(currentId) || 0;

    for (const edge of nonCycleOutgoing.get(currentId) || []) {
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
 * Order nodes within layers using barycenter heuristic to minimize crossings.
 * Mutates layer groups in place.
 */
function _orderWithinLayers(sortedLayers, layerGroups, edges) {
  // Build quick lookup: nodeId -> layer
  const nodeLayer = new Map();
  for (const [layer, nodes] of layerGroups.entries()) {
    for (const node of nodes) nodeLayer.set(node.id, layer);
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
      const inNeighborPositions = edges
        .filter(e => e.targetId === node.id && nodeLayer.get(e.sourceId) === prevLayerIdx)
        .map(e => prevPosition.get(e.sourceId) ?? 0);

      if (inNeighborPositions.length > 0) {
        const avg = inNeighborPositions.reduce((s, v) => s + v, 0) / inNeighborPositions.length;
        barycenters.set(node.id, avg);
      } else {
        barycenters.set(node.id, Infinity);
      }
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
 * @param {{ nodes: object[], edges: object[] }} graph
 * @param {{ category?: string, searchTerm?: string }} filters
 * @returns {{ nodes: object[], edges: object[] }}
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

  return { nodes, edges, width: graph.width || 0, height: graph.height || 0 };
}
