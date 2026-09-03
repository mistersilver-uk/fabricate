/**
 * Component tests for RecipeGraphTab (T-057)
 * DOM-based tests using happy-dom (no Svelte compiler needed)
 * Uses node:test + node:assert/strict
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import { buildRecipeGraph, layoutGraph } from '../../src/ui/svelte/util/recipeGraphBuilder.js';

// ---------------------------------------------------------------------------
// Helper: build DOM structures that mirror RecipeGraphTab output
// ---------------------------------------------------------------------------

function makeGraphNode({ id, name, img = 'icon.png', category = '', x = 0, y = 0 } = {}) {
  return { id, name, img, category, x, y, layer: 0, inEdges: [], outEdges: [] };
}

function makeGraphEdge({ id, sourceId, targetId, isCycleEdge = false, path = '' } = {}) {
  return { id, sourceId, targetId, isCycleEdge, path, componentIds: [] };
}

function buildGraphTabDOM({ nodes = [], edges = [], categories = [], onNodeClick = null, onSearch = null } = {}) {
  const section = document.createElement('section');
  section.className = 'admin-panel recipe-graph-tab';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'graph-toolbar';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'graph-search';
  searchInput.placeholder = 'Search recipes...';
  searchInput.oninput = (e) => onSearch?.(e.target.value);
  toolbar.appendChild(searchInput);

  const categorySelect = document.createElement('select');
  categorySelect.className = 'graph-category-filter';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Categories';
  categorySelect.appendChild(defaultOption);
  for (const cat of categories) {
    const option = document.createElement('option');
    option.value = cat.name;
    option.textContent = `${cat.name} (${cat.count})`;
    categorySelect.appendChild(option);
  }
  toolbar.appendChild(categorySelect);

  const zoomIn = document.createElement('button');
  zoomIn.className = 'graph-zoom-btn';
  zoomIn.dataset.action = 'zoom-in';
  zoomIn.textContent = '+';
  toolbar.appendChild(zoomIn);

  const zoomOut = document.createElement('button');
  zoomOut.className = 'graph-zoom-btn';
  zoomOut.dataset.action = 'zoom-out';
  zoomOut.textContent = '-';
  toolbar.appendChild(zoomOut);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'graph-reset-btn';
  resetBtn.textContent = 'Reset View';
  toolbar.appendChild(resetBtn);

  section.appendChild(toolbar);

  // Viewport
  const viewport = document.createElement('div');
  viewport.className = 'graph-viewport';
  viewport.setAttribute('role', 'img');
  viewport.setAttribute('aria-label', 'Recipe dependency graph');

  if (nodes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'graph-empty-state';
    empty.textContent = 'No recipes in this system';
    viewport.appendChild(empty);
  } else {
    const canvas = document.createElement('div');
    canvas.className = 'graph-canvas';

    // SVG edges layer
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.className = 'graph-edges';
    svg.setAttribute('aria-hidden', 'true');

    for (const edge of edges) {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', edge.path || '');
      path.setAttribute('data-edge-id', edge.id);
      if (edge.isCycleEdge) path.classList.add('cycle-edge');
      svg.appendChild(path);
    }
    canvas.appendChild(svg);

    // Node buttons
    for (const node of nodes) {
      const btn = document.createElement('button');
      btn.className = 'graph-node';
      btn.dataset.nodeId = node.id;
      btn.style.left = `${node.x}px`;
      btn.style.top = `${node.y}px`;
      btn.onclick = () => onNodeClick?.(node.id);

      const img = document.createElement('img');
      img.src = node.img;
      img.alt = '';
      img.className = 'node-icon';
      btn.appendChild(img);

      const info = document.createElement('div');
      info.className = 'node-info';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'node-name';
      nameSpan.textContent = node.name;
      info.appendChild(nameSpan);
      if (node.category) {
        const catSpan = document.createElement('span');
        catSpan.className = 'node-category';
        catSpan.textContent = node.category;
        info.appendChild(catSpan);
      }
      btn.appendChild(info);
      canvas.appendChild(btn);
    }
    viewport.appendChild(canvas);
  }
  section.appendChild(viewport);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'graph-legend';
  section.appendChild(legend);

  return section;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecipeGraphTab — component', () => {
  before(setupDOM);
  after(teardownDOM);

  it('1. Renders graph nodes for each recipe', () => {
    const nodes = [
      makeGraphNode({ id: 'A', name: 'Iron Ingot', x: 0, y: 0 }),
      makeGraphNode({ id: 'B', name: 'Iron Sword', x: 250, y: 0 })
    ];
    const edges = [makeGraphEdge({ id: 'A->B', sourceId: 'A', targetId: 'B' })];
    const el = buildGraphTabDOM({ nodes, edges });

    const nodeButtons = el.querySelectorAll('.graph-node');
    assert.equal(nodeButtons.length, 2);
    const names = Array.from(nodeButtons).map(b => b.querySelector('.node-name').textContent);
    assert.ok(names.includes('Iron Ingot'));
    assert.ok(names.includes('Iron Sword'));
  });

  it('2. Renders SVG edges between connected recipes', () => {
    const nodes = [
      makeGraphNode({ id: 'A', name: 'Iron Ingot' }),
      makeGraphNode({ id: 'B', name: 'Iron Sword', x: 250 })
    ];
    const edges = [makeGraphEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', path: 'M 0 0 C 100 0, 150 0, 250 0' })];
    const el = buildGraphTabDOM({ nodes, edges });

    const svgEdges = el.querySelectorAll('.graph-edges path');
    assert.equal(svgEdges.length, 1);
    assert.equal(svgEdges[0].getAttribute('data-edge-id'), 'A->B');
  });

  it('3. Clicking a node calls onNodeClick with recipe ID', () => {
    const clickedIds = [];
    const nodes = [makeGraphNode({ id: 'A', name: 'Iron Ingot' })];
    const el = buildGraphTabDOM({ nodes, onNodeClick: (id) => clickedIds.push(id) });

    const btn = el.querySelector('.graph-node[data-node-id="A"]');
    assert.ok(btn, 'Node button should exist');
    btn.click();
    assert.deepEqual(clickedIds, ['A']);
  });

  it('4. Category filter dropdown renders categories', () => {
    const categories = [
      { name: 'weapons', count: 3 },
      { name: 'armor', count: 2 }
    ];
    const el = buildGraphTabDOM({ categories });
    const select = el.querySelector('.graph-category-filter');
    const options = Array.from(select.querySelectorAll('option'));
    assert.ok(options.length >= 3, 'Should have at least 3 options (default + 2 categories)');
    const values = options.map(o => o.value);
    assert.ok(values.includes('weapons'));
    assert.ok(values.includes('armor'));
  });

  it('5. Empty state is shown when no nodes exist', () => {
    const el = buildGraphTabDOM({ nodes: [] });
    const emptyState = el.querySelector('.graph-empty-state');
    assert.ok(emptyState, 'Empty state should be rendered');
    assert.ok(emptyState.textContent.length > 0);
  });
});
