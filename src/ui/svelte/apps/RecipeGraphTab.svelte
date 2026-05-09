<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import { filterGraph } from '../util/recipeGraphBuilder.js';

  let {
    graphData = { nodes: [], edges: [], width: 0, height: 0 },
    categories = [],
    onNodeClick = null,
    onSearch = null,
    searchTerm = ''
  } = $props();

  let selectedCategory = $state('');
  let panX = $state(0);
  let panY = $state(0);
  let scale = $state(1);
  let isDragging = $state(false);
  let dragStart = $state({ x: 0, y: 0 });

  let filteredGraph = $derived(
    filterGraph(graphData, { category: selectedCategory })
  );

  function handleMouseDown(e) {
    if (e.target.closest('.graph-node')) return;
    isDragging = true;
    dragStart = { x: e.clientX - panX, y: e.clientY - panY };
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    panX = e.clientX - dragStart.x;
    panY = e.clientY - dragStart.y;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(2, Math.max(0.3, scale + delta));
  }

  function resetView() {
    scale = 1;
    panX = 0;
    panY = 0;
  }

  const canvasWidth = $derived(filteredGraph.width > 0 ? filteredGraph.width + 200 : 800);
  const canvasHeight = $derived(filteredGraph.height > 0 ? filteredGraph.height + 200 : 600);
</script>

<section class="admin-panel recipe-graph-tab">
  <!-- Toolbar -->
  <div class="panel-toolbar graph-toolbar">
    <input
      type="text"
      class="graph-search"
      placeholder={localize('FABRICATE.Graph.SearchPlaceholder')}
      value={searchTerm}
      oninput={(e) => onSearch?.(e.target.value)}
    />
    <select
      class="graph-category-filter"
      onchange={(e) => { selectedCategory = e.target.value; }}
    >
      <option value="">{localize('FABRICATE.Graph.AllCategories')}</option>
      {#each categories as cat}
        <option value={cat.name}>{cat.name} ({cat.count})</option>
      {/each}
    </select>
    <button class="graph-zoom-btn" onclick={() => { scale = Math.min(2, scale + 0.1); }}>+</button>
    <button class="graph-zoom-btn" onclick={() => { scale = Math.max(0.3, scale - 0.1); }}>-</button>
    <button class="graph-reset-btn" onclick={resetView}>{localize('FABRICATE.Graph.ResetView')}</button>
  </div>

  <!-- Graph viewport: role="application" allows mouse interaction handlers on this custom widget -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="graph-viewport"
    role="application"
    aria-label="Recipe dependency graph"
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onmouseleave={handleMouseUp}
    onwheel={handleWheel}
  >
    {#if filteredGraph.nodes.length === 0}
      <div class="graph-empty-state">
        <p>{localize('FABRICATE.Graph.NoRecipes')}</p>
      </div>
    {:else}
      <div
        class="graph-canvas"
        style="transform: translate({panX}px, {panY}px) scale({scale}); width: {canvasWidth}px; height: {canvasHeight}px;"
      >
        <!-- SVG layer for edges -->
        <svg
          class="graph-edges"
          style="width: {canvasWidth}px; height: {canvasHeight}px;"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-border-dark, var(--fab-text-subtle))" />
            </marker>
          </defs>
          {#each filteredGraph.edges as edge (edge.id)}
            <path
              d={edge.path}
              class="graph-edge"
              class:cycle-edge={edge.isCycleEdge}
              stroke="var(--color-border-dark, var(--fab-text-subtle))"
              fill="none"
              marker-end="url(#arrowhead)"
            />
          {/each}
        </svg>

        <!-- HTML layer for nodes -->
        {#each filteredGraph.nodes as node (node.id)}
          <button
            class="graph-node"
            style="left: {node.x}px; top: {node.y}px;"
            onclick={() => onNodeClick?.(node.id)}
            title={node.name}
          >
            <img src={node.img} alt="" class="node-icon" />
            <div class="node-info">
              <span class="node-name">{node.name}</span>
              {#if node.category}
                <span class="node-category">{node.category}</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="graph-legend">
    <span class="legend-item">
      <span class="legend-line solid"></span>
      {localize('FABRICATE.Graph.EdgeNormal')}
    </span>
    <span class="legend-item">
      <span class="legend-line dashed"></span>
      {localize('FABRICATE.Graph.EdgeCycle')}
    </span>
    <span class="legend-stats">
      {filteredGraph.nodes.length} recipes &bull; {filteredGraph.edges.length} connections
    </span>
  </div>
</section>
