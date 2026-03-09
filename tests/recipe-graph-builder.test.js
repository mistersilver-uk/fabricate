/**
 * Tests for recipeGraphBuilder.js (T-057)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractComponentIds,
  buildRecipeGraph,
  layoutGraph,
  filterGraph
} from '../src/ui/svelte/util/recipeGraphBuilder.js';

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
});
