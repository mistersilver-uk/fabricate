/**
 * Tests for recipeGraphBuilder.js (T-057)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractComponentIds,
  buildRecipeGraph,
  buildBoundedRecipeGraph,
  createRecipeGraphIndex,
  layoutGraph,
  filterGraph,
  DEFAULT_GRAPH_MAX_NODES,
  DEFAULT_GRAPH_MAX_EDGES
} from '../src/ui/svelte/util/recipeGraphBuilder.js';
import { createOperationCounters } from './helpers/scale/scaleProbes.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeRecipe({ id, name = id, category = '', inputComponentIds = [], outputComponentIds = [] } = {}) {
  return {
    id,
    name,
    img: 'icon.png',
    category,
    ingredientSets: inputComponentIds.length > 0
      ? [{ ingredientGroups: [{ options: inputComponentIds.map(cid => ({ match: { componentId: cid } })) }] }]
      : [],
    resultGroups: outputComponentIds.length > 0
      ? [{ results: outputComponentIds.map(cid => ({ componentId: cid })) }]
      : []
  };
}

function makeRecipeLegacy({ id, name = id, inputComponentIds = [], outputComponentIds = [] } = {}) {
  // Legacy flat ingredients structure
  return {
    id,
    name,
    img: 'icon.png',
    category: '',
    ingredientSets: inputComponentIds.length > 0
      ? [{ ingredients: inputComponentIds.map(cid => ({ componentId: cid })) }]
      : [],
    resultGroups: outputComponentIds.length > 0
      ? [{ results: outputComponentIds.map(cid => ({ componentId: cid })) }]
      : []
  };
}

// ---------------------------------------------------------------------------
// extractComponentIds tests
// ---------------------------------------------------------------------------

describe('extractComponentIds', () => {
  it('returns empty sets for recipe with no ingredients or results', () => {
    const recipe = makeRecipe({ id: 'r1' });
    const { inputIds, outputIds } = extractComponentIds(recipe);
    assert.equal(inputIds.size, 0);
    assert.equal(outputIds.size, 0);
  });

  it('extracts ingredient component IDs via match.componentId', () => {
    const recipe = makeRecipe({ id: 'r1', inputComponentIds: ['c1', 'c2'] });
    const { inputIds } = extractComponentIds(recipe);
    assert.ok(inputIds.has('c1'));
    assert.ok(inputIds.has('c2'));
  });

  it('extracts result component IDs', () => {
    const recipe = makeRecipe({ id: 'r1', outputComponentIds: ['c3'] });
    const { outputIds } = extractComponentIds(recipe);
    assert.ok(outputIds.has('c3'));
  });

  it('extracts legacy flat ingredient componentId', () => {
    const recipe = makeRecipeLegacy({ id: 'r1', inputComponentIds: ['c1'] });
    const { inputIds } = extractComponentIds(recipe);
    assert.ok(inputIds.has('c1'));
  });
});

// ---------------------------------------------------------------------------
// buildRecipeGraph tests
// ---------------------------------------------------------------------------

describe('buildRecipeGraph — construction', () => {
  it('1. Empty recipe list produces empty graph', () => {
    const graph = buildRecipeGraph([]);
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
  });

  it('2. Single recipe with no shared components produces 1 node, 0 edges', () => {
    const recipes = [makeRecipe({ id: 'r1', outputComponentIds: ['c1'] })];
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.edges.length, 0);
  });

  it('3. Linear chain (A outputs c1, B inputs c1, outputs c2, C inputs c2) produces correct edges and correct node count', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'], outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c2'] })
    ];
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.length, 2);
    const edgeIds = graph.edges.map(e => e.id);
    assert.ok(edgeIds.includes('A->B'));
    assert.ok(edgeIds.includes('B->C'));
  });

  it('4. Branching graph (A->B and A->C) produces correct edges', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c1'] })
    ];
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.edges.length, 2);
    const edgeIds = graph.edges.map(e => e.id);
    assert.ok(edgeIds.includes('A->B'));
    assert.ok(edgeIds.includes('A->C'));
  });

  it('5. Converging graph (A->C and B->C) produces correct edges', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c1', 'c2'] })
    ];
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.edges.length, 2);
    const edgeIds = graph.edges.map(e => e.id);
    assert.ok(edgeIds.includes('A->C'));
    assert.ok(edgeIds.includes('B->C'));
  });

  it('6. Cycle (A->B->A) detects back-edge', () => {
    const recipes = [
      makeRecipe({ id: 'A', inputComponentIds: ['c2'], outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'], outputComponentIds: ['c2'] })
    ];
    const rawGraph = buildRecipeGraph(recipes);
    const graph = layoutGraph(rawGraph);
    const cycleEdges = graph.edges.filter(e => e.isCycleEdge);
    assert.equal(cycleEdges.length, 1);
  });

  it('7. Disconnected subgraphs are both present in output', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'] }),
      makeRecipe({ id: 'C', outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'D', inputComponentIds: ['c2'] })
    ];
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.nodes.length, 4);
    assert.equal(graph.edges.length, 2);
  });

  it('8. Recipe with multiple result groups produces edges for all output components', () => {
    const recipes = [
      {
        id: 'A',
        name: 'A',
        img: '',
        category: '',
        ingredientSets: [],
        resultGroups: [
          { results: [{ componentId: 'c1' }] },
          { results: [{ componentId: 'c2' }] }
        ]
      },
      makeRecipe({ id: 'B', inputComponentIds: ['c1'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c2'] })
    ];
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.edges.length, 2);
    const edgeIds = graph.edges.map(e => e.id);
    assert.ok(edgeIds.includes('A->B'));
    assert.ok(edgeIds.includes('A->C'));
  });

  it('9. Recipe with multiple ingredient sets produces edges for all input components', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', outputComponentIds: ['c2'] }),
      {
        id: 'C',
        name: 'C',
        img: '',
        category: '',
        ingredientSets: [
          { ingredientGroups: [{ options: [{ match: { componentId: 'c1' } }] }] },
          { ingredientGroups: [{ options: [{ match: { componentId: 'c2' } }] }] }
        ],
        resultGroups: []
      }
    ];
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.edges.length, 2);
    const edgeIds = graph.edges.map(e => e.id);
    assert.ok(edgeIds.includes('A->C'));
    assert.ok(edgeIds.includes('B->C'));
  });

  it('10. Self-referencing recipe (output = input) is handled without crash', () => {
    const recipes = [
      makeRecipe({ id: 'A', inputComponentIds: ['c1'], outputComponentIds: ['c1'] })
    ];
    // Should not throw
    const graph = buildRecipeGraph(recipes);
    assert.equal(graph.nodes.length, 1);
    // Self-loops should not create edges
    assert.equal(graph.edges.length, 0);
  });
});

// ---------------------------------------------------------------------------
// layoutGraph tests
// ---------------------------------------------------------------------------

describe('layoutGraph — layout', () => {
  it('11. Root nodes (no inputs) are assigned layer 0', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'] })
    ];
    const graph = layoutGraph(buildRecipeGraph(recipes));
    const nodeA = graph.nodes.find(n => n.id === 'A');
    assert.equal(nodeA.layer, 0);
  });

  it('12. Linear chain assigns incrementing layers', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'], outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c2'] })
    ];
    const graph = layoutGraph(buildRecipeGraph(recipes));
    const nodeA = graph.nodes.find(n => n.id === 'A');
    const nodeB = graph.nodes.find(n => n.id === 'B');
    const nodeC = graph.nodes.find(n => n.id === 'C');
    assert.ok(nodeA.layer < nodeB.layer);
    assert.ok(nodeB.layer < nodeC.layer);
  });

  it('13. Coordinates are non-overlapping for nodes in the same layer', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c1', 'c2'] })
    ];
    const graph = layoutGraph(buildRecipeGraph(recipes));
    const nodeA = graph.nodes.find(n => n.id === 'A');
    const nodeB = graph.nodes.find(n => n.id === 'B');
    // A and B are both in layer 0 — they should have different y positions
    if (nodeA.layer === nodeB.layer) {
      assert.notEqual(nodeA.y, nodeB.y);
    }
  });

  it('14. Cycle nodes get valid layer assignments (no infinite loop)', () => {
    const recipes = [
      makeRecipe({ id: 'A', inputComponentIds: ['c2'], outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'], outputComponentIds: ['c2'] })
    ];
    // Should not throw or loop infinitely
    const graph = layoutGraph(buildRecipeGraph(recipes));
    assert.equal(graph.nodes.length, 2);
    for (const node of graph.nodes) {
      assert.ok(typeof node.layer === 'number');
      assert.ok(isFinite(node.x));
      assert.ok(isFinite(node.y));
    }
  });
});

// ---------------------------------------------------------------------------
// filterGraph tests
// ---------------------------------------------------------------------------

describe('filterGraph — filtering', () => {
  function buildTestGraph() {
    const recipes = [
      makeRecipe({ id: 'A', name: 'Iron Sword', category: 'weapons', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', name: 'Iron Shield', category: 'armor', inputComponentIds: ['c1'] }),
      makeRecipe({ id: 'C', name: 'Health Potion', category: 'potions', outputComponentIds: ['c2'] })
    ];
    return layoutGraph(buildRecipeGraph(recipes));
  }

  it('15. Category filter returns only matching nodes and their edges', () => {
    const graph = buildTestGraph();
    const filtered = filterGraph(graph, { category: 'weapons' });
    assert.equal(filtered.nodes.length, 1);
    assert.equal(filtered.nodes[0].id, 'A');
    // Edge A->B should be excluded because B is not in filtered set
    assert.equal(filtered.edges.length, 0);
  });

  it('16. Search term filter matches recipe name', () => {
    const graph = buildTestGraph();
    const filtered = filterGraph(graph, { searchTerm: 'iron' });
    assert.equal(filtered.nodes.length, 2);
    const ids = filtered.nodes.map(n => n.id);
    assert.ok(ids.includes('A'));
    assert.ok(ids.includes('B'));
  });

  it('17. Empty filter returns full graph', () => {
    const graph = buildTestGraph();
    const filtered = filterGraph(graph, {});
    assert.equal(filtered.nodes.length, 3);
  });

  it('18. Filter that matches no recipes returns empty graph', () => {
    const graph = buildTestGraph();
    const filtered = filterGraph(graph, { searchTerm: 'dragon' });
    assert.equal(filtered.nodes.length, 0);
    assert.equal(filtered.edges.length, 0);
  });

  it('19. Filtering carries the bound descriptor through unchanged', () => {
    const index = makeChainIndex(4);
    const graph = layoutGraph(buildBoundedRecipeGraph(index, { maxNodes: 2 }));
    const filtered = filterGraph(graph, { searchTerm: 'chain' });
    assert.equal(filtered.bound.complete, false, 'an incomplete graph stays incomplete');
    assert.equal(filtered.bound.requiresScope, true);
  });
});

// ---------------------------------------------------------------------------
// Deep-chain regression — issue 1082
// ---------------------------------------------------------------------------

/**
 * A strictly linear producer/consumer chain: recipe `i` consumes `c<i-1>` and produces `c<i>`.
 * Depth is exactly `depth`, which is the axis that used to overflow the layout's call stack.
 */
function makeChain(depth) {
  const recipes = [];
  for (let index = 0; index < depth; index++) {
    recipes.push({
      id: `chain-${index}`,
      name: `Chain Link ${index}`,
      img: 'icon.png',
      category: '',
      ingredientSets: index === 0
        ? []
        : [{ ingredientGroups: [{ options: [{ match: { componentId: `c${index - 1}` } }] }] }],
      resultGroups: [{ results: [{ componentId: `c${index}` }] }]
    });
  }
  return recipes;
}

function makeChainIndex(depth) {
  return createRecipeGraphIndex(makeChain(depth));
}

/**
 * The chain depth every test below runs at.
 *
 * The recursive `dfs` this replaced threw `RangeError: Maximum call stack size exceeded` at a
 * measured depth of 8,193 on this checkout (bisected in a bare Node 22 process; under a test
 * runner, whose own frames are already on the stack, it fails shallower still). 20,000 is
 * comfortably past that on both, and short of it the assertions below would pass against the
 * ORIGINAL implementation and prove nothing. The parent programme's target scale is a
 * 10,000-recipe corpus, so the overflow depth sat inside supported territory.
 */
const OVERFLOWING_CHAIN_DEPTH = 20_000;

describe('layoutGraph — deep dependency chains (issue 1082)', () => {
  it('20. Lays out a chain deeper than the old recursion limit without throwing', () => {
    const graph = layoutGraph(buildRecipeGraph(makeChain(OVERFLOWING_CHAIN_DEPTH)));

    assert.equal(graph.nodes.length, OVERFLOWING_CHAIN_DEPTH);
    assert.equal(graph.edges.length, OVERFLOWING_CHAIN_DEPTH - 1);
    // Not merely "did not throw": the whole chain must have been walked. A layout that gave
    // up part-way would still produce nodes, so the deepest layer is what proves the walk
    // reached the end.
    const deepestLayer = graph.nodes.reduce((max, node) => Math.max(max, node.layer), 0);
    assert.equal(deepestLayer, OVERFLOWING_CHAIN_DEPTH - 1, 'every link got its own layer');
  });

  it('21. Detects a cycle closing a chain deeper than the old recursion limit', () => {
    // The pathological case for cycle detection specifically: the back edge is only found
    // after the DFS has descended the entire chain, so this cannot pass without the explicit
    // stack holding the whole depth.
    const recipes = makeChain(OVERFLOWING_CHAIN_DEPTH);
    recipes[0].ingredientSets = [
      {
        ingredientGroups: [
          { options: [{ match: { componentId: `c${OVERFLOWING_CHAIN_DEPTH - 1}` } }] }
        ]
      }
    ];

    const graph = layoutGraph(buildRecipeGraph(recipes));
    const cycleEdges = graph.edges.filter((edge) => edge.isCycleEdge);
    assert.equal(cycleEdges.length, 1, 'the closing back edge is the one cycle edge');
    assert.equal(cycleEdges[0].id, `chain-${OVERFLOWING_CHAIN_DEPTH - 1}->chain-0`);
  });
});

// ---------------------------------------------------------------------------
// Retained index + bounded query — issue 1082
// ---------------------------------------------------------------------------

describe('createRecipeGraphIndex', () => {
  it('22. Indexes producers and consumers by component id', () => {
    const index = createRecipeGraphIndex([
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'], outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c1'] })
    ]);

    assert.equal(index.recipeCount, 3);
    assert.deepEqual(index.producerRecipeIdsByComponentId.get('c1'), ['A']);
    assert.deepEqual(index.consumerRecipeIdsByComponentId.get('c1'), ['B', 'C']);
    assert.deepEqual(index.producerRecipeIdsByComponentId.get('c2'), ['B']);
  });

  it('23. Hands every query its own node objects, so one layout cannot leak into the next', () => {
    // `layoutGraph` mutates x/y/layer in place. A retained index that handed out shared node
    // objects would carry the first query's coordinates into the second.
    const index = createRecipeGraphIndex([
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'] })
    ]);

    const first = layoutGraph(buildBoundedRecipeGraph(index));
    const second = buildBoundedRecipeGraph(index);

    assert.ok(first.nodes[1].x > 0, 'the first layout positioned the second node');
    assert.equal(second.nodes[1].x, 0, 'the second query starts from a fresh node');
    assert.ok(first.nodes[0] !== second.nodes[0], 'node objects are not shared between queries');
    assert.equal(second.nodes[0].inEdges.length + second.nodes[0].outEdges.length, 1);
  });
});

describe('buildBoundedRecipeGraph — bounds and scopes (issue 1082)', () => {
  /**
   * A hub corpus: `producers` recipes all produce one component and `consumers` recipes all
   * consume it. Its complete graph has `producers x consumers` edges, which is the explosion
   * this bound exists to stop.
   */
  function makeHub({ producers, consumers }) {
    const recipes = [];
    for (let index = 0; index < producers; index++) {
      recipes.push(makeRecipe({ id: `p${index}`, name: `Producer ${index}`, outputComponentIds: ['hub'] }));
    }
    for (let index = 0; index < consumers; index++) {
      recipes.push(makeRecipe({ id: `q${index}`, name: `Consumer ${index}`, inputComponentIds: ['hub'] }));
    }
    return recipes;
  }

  it('24. Declares the default bound the canonical spec records', () => {
    assert.equal(DEFAULT_GRAPH_MAX_NODES, 500);
    assert.equal(DEFAULT_GRAPH_MAX_EDGES, 2000);
  });

  it('25. A corpus inside the bound is returned complete', () => {
    const graph = buildBoundedRecipeGraph(makeChainIndex(10));
    assert.equal(graph.nodes.length, 10);
    assert.equal(graph.bound.complete, true);
    assert.equal(graph.bound.limitedBy, null);
    assert.equal(graph.bound.candidateNodeCount, 10);
  });

  it('26. An unscoped corpus over the bound returns NOTHING and asks for a scope', () => {
    // The load-bearing decision: no arbitrary 500-recipe slice of an unscoped corpus, because
    // a GM would read the slice as their system. Silence plus `requiresScope` is honest; a
    // plausible partial is not.
    const graph = buildBoundedRecipeGraph(makeChainIndex(40), { maxNodes: 10 });
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
    assert.equal(graph.bound.complete, false);
    assert.equal(graph.bound.requiresScope, true);
    assert.equal(graph.bound.limitedBy, 'nodes');
    assert.equal(graph.bound.candidateNodeCount, 40, 'the GM is told how big the real graph is');
  });

  it('27. An explicit unbounded request lifts both budgets', () => {
    const graph = buildBoundedRecipeGraph(makeChainIndex(40), { maxNodes: 10, unbounded: true });
    assert.equal(graph.nodes.length, 40);
    assert.equal(graph.bound.complete, true);
    assert.equal(graph.bound.unbounded, true);
    assert.equal(graph.bound.maxNodes, null);
  });

  it('28. A cohort scope returns exactly the cohort and the edges among it', () => {
    const index = makeChainIndex(10);
    const graph = buildBoundedRecipeGraph(index, {
      scope: { type: 'cohort', recipeIds: ['chain-3', 'chain-4', 'chain-9'] }
    });

    assert.deepEqual(graph.nodes.map((node) => node.id).sort(), ['chain-3', 'chain-4', 'chain-9']);
    assert.deepEqual(graph.edges.map((edge) => edge.id), ['chain-3->chain-4']);
    assert.equal(graph.bound.complete, true);
  });

  it('29. A recipe scope walks the requested number of hops and no further', () => {
    const index = makeChainIndex(10);
    const graph = buildBoundedRecipeGraph(index, {
      scope: { type: 'recipe', recipeId: 'chain-5' },
      hops: 2
    });

    assert.deepEqual(
      graph.nodes.map((node) => node.id).sort(),
      ['chain-3', 'chain-4', 'chain-5', 'chain-6', 'chain-7']
    );
    assert.equal(graph.bound.hops, 2);
    assert.equal(graph.bound.complete, true);
  });

  it('30. A component scope returns that component’s producers and consumers', () => {
    const index = createRecipeGraphIndex(makeHub({ producers: 3, consumers: 2 }));
    const graph = buildBoundedRecipeGraph(index, {
      scope: { type: 'component', componentId: 'hub' }
    });

    assert.equal(graph.nodes.length, 5);
    assert.equal(graph.edges.length, 6, '3 producers x 2 consumers');
    assert.equal(graph.bound.complete, true);
  });

  it('31. A truncated component scope keeps BOTH sides, not just the producers', () => {
    // Concatenating producers before consumers would spend the whole node budget on
    // producers and hand back a graph with no edges at all — disclosed, but still reading as
    // "nothing depends on this component".
    const index = createRecipeGraphIndex(makeHub({ producers: 40, consumers: 40 }));
    const graph = buildBoundedRecipeGraph(index, {
      scope: { type: 'component', componentId: 'hub' },
      maxNodes: 10
    });

    const ids = graph.nodes.map((node) => node.id);
    assert.equal(ids.length, 10);
    assert.ok(ids.some((id) => id.startsWith('p')), 'producers are represented');
    assert.ok(ids.some((id) => id.startsWith('q')), 'consumers are represented');
    assert.ok(graph.edges.length > 0, 'a truncated neighbourhood still shows dependencies');
    assert.equal(graph.bound.complete, false);
    assert.equal(graph.bound.candidateNodeCount, 80);
  });

  it('32. A scoped view does not enumerate unrelated producer x consumer pairs', () => {
    // The acceptance criterion as an edge-count bound. The complete hub graph has
    // 60 x 60 = 3,600 edges; a 20-node scoped view must not pay for them.
    const index = createRecipeGraphIndex(makeHub({ producers: 60, consumers: 60 }));
    const complete = buildBoundedRecipeGraph(index, { unbounded: true });
    assert.equal(complete.edges.length, 3600, 'the unbounded graph really is quadratic');

    const scoped = buildBoundedRecipeGraph(index, {
      scope: { type: 'component', componentId: 'hub' },
      maxNodes: 20,
      maxEdges: 50
    });
    assert.ok(scoped.edges.length <= 50, `edges bounded, got ${scoped.edges.length}`);
    assert.equal(scoped.bound.limitedBy, 'nodes');
    assert.equal(scoped.bound.complete, false);
  });

  it('33. The edge budget stops emission and says so', () => {
    const index = createRecipeGraphIndex(makeHub({ producers: 20, consumers: 20 }));
    const graph = buildBoundedRecipeGraph(index, {
      scope: { type: 'cohort', recipeIds: [...index.nodeSeedById.keys()] },
      maxNodes: 100,
      maxEdges: 25
    });

    assert.equal(graph.edges.length, 25);
    assert.equal(graph.bound.limitedBy, 'edges');
    assert.equal(graph.bound.complete, false);
  });

  it('34. An unknown scope is rejected rather than silently treated as "all"', () => {
    assert.throws(
      () => buildBoundedRecipeGraph(makeChainIndex(3), { scope: { type: 'everything' } }),
      /Unknown recipe graph scope "everything"/
    );
  });
});

// ---------------------------------------------------------------------------
// Layout adjacency instrumentation — issue 1082
// ---------------------------------------------------------------------------

describe('layoutGraph — adjacency instrumentation (issue 1082)', () => {
  it('35. Examines each edge at most once across the whole ordering pass', () => {
    // The acceptance criterion "layout performs no repeated whole-edge filtering per node",
    // as a counter rather than a code-review note. The original filtered ALL edges once per
    // node per layer; on this fixture that was 20 layers x 5 nodes x ~95 edges. The bound
    // below is violated by any implementation that reintroduces it.
    const recipes = [];
    for (let layer = 0; layer < 20; layer++) {
      for (let slot = 0; slot < 5; slot++) {
        recipes.push(
          makeRecipe({
            id: `n${layer}-${slot}`,
            name: `Node ${layer}-${slot}`,
            inputComponentIds: layer === 0 ? [] : [`c${layer - 1}`],
            outputComponentIds: [`c${layer}`]
          })
        );
      }
    }

    const counters = createOperationCounters();
    const graph = layoutGraph(buildRecipeGraph(recipes), { instrumentation: counters });

    const examined = counters.get('graphIncomingEdgesExamined');
    const lookups = counters.get('graphAdjacencyLookups');
    // Non-vacuity first: a counter that cannot go up reports a green baseline forever.
    assert.ok(examined > 0, 'the counter actually counted something');
    assert.ok(lookups > 0, 'adjacency was actually consulted');
    assert.ok(
      examined <= graph.edges.length,
      `examined ${examined} edge entries for ${graph.edges.length} edges — that is a rescan`
    );
    assert.ok(lookups <= graph.nodes.length, 'one adjacency lookup per node at most');
  });

  it('36. Runs without instrumentation, and instrumentation does not change the layout', () => {
    const recipes = [
      makeRecipe({ id: 'A', outputComponentIds: ['c1'] }),
      makeRecipe({ id: 'B', inputComponentIds: ['c1'], outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'C', inputComponentIds: ['c1'], outputComponentIds: ['c2'] }),
      makeRecipe({ id: 'D', inputComponentIds: ['c2'] })
    ];

    const plain = layoutGraph(buildRecipeGraph(recipes));
    const counted = layoutGraph(buildRecipeGraph(recipes), {
      instrumentation: createOperationCounters()
    });

    assert.deepEqual(
      plain.nodes.map((node) => [node.id, node.layer, node.x, node.y]),
      counted.nodes.map((node) => [node.id, node.layer, node.x, node.y])
    );
  });
});
