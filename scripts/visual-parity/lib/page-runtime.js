/** The page-side runtime — every routine that runs inside the measured document, as real code. */

/** Install the measurement runtime on `globalThis.__fabricateParity`. */
export function installParityRuntime() {
  const doc = globalThis.document;
  const styleOf = (el) => globalThis.getComputedStyle(el);
  const px = (value) => Number.parseFloat(value) || 0;

  // ── Locators ─────────────────────────────────────────────────────────────────────────

  function matchesText(el, rule) {
    const text = el.textContent.trim();
    if (rule.equals !== undefined && text !== rule.equals) return false;
    if (rule.startsWith !== undefined && !text.startsWith(rule.startsWith)) return false;
    if (rule.nonEmpty === true && text.length === 0) return false;
    return (rule.includes ?? []).every((part) => text.includes(part));
  }

  function matchesRect(el, rule) {
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const left = Math.round(rect.left);
    if (rule.width !== undefined && width !== rule.width) return false;
    if (rule.height !== undefined && height !== rule.height) return false;
    if (rule.minWidth !== undefined && width < rule.minWidth) return false;
    if (rule.maxWidth !== undefined && width > rule.maxWidth) return false;
    if (rule.minHeight !== undefined && height < rule.minHeight) return false;
    if (rule.maxHeight !== undefined && height > rule.maxHeight) return false;
    if (rule.minLeft !== undefined && left < rule.minLeft) return false;
    return true;
  }

  function matchesStyle(el, rule, negated) {
    const computed = styleOf(el);
    for (const [property, value] of Object.entries(rule)) {
      const same = computed[property] === value;
      if (negated ? same : !same) return false;
    }
    return true;
  }

  function matchesWhere(el, rule) {
    if (rule.tag && el.tagName.toLowerCase() !== rule.tag) return false;
    if (rule.text && !matchesText(el, rule.text)) return false;
    if (rule.rect && !matchesRect(el, rule.rect)) return false;
    if (rule.style && !matchesStyle(el, rule.style, false)) return false;
    if (rule.styleNot && !matchesStyle(el, rule.styleNot, true)) return false;
    if (rule.has && !el.querySelector(rule.has)) return false;
    if (rule.childCount !== undefined && el.children.length !== rule.childCount) return false;
    if (rule.leaf === true && el.children.length > 0) return false;
    return true;
  }

  function walkUp(el, times) {
    let node = el;
    for (let step = 0; step < times && node; step += 1) node = node.parentElement;
    return node;
  }

  function walkAside(el, offset) {
    let node = el;
    for (let step = 0; step < Math.abs(offset) && node; step += 1) {
      node = offset < 0 ? node.previousElementSibling : node.nextElementSibling;
    }
    return node;
  }

  const STEPS = {
    select: (nodes, step) => nodes.flatMap((node) => [...node.querySelectorAll(step.css)]),
    children: (nodes) => nodes.flatMap((node) => [...node.children]),
    where: (nodes, step) => nodes.filter((node) => matchesWhere(node, step)),
    at: (nodes, step) => [nodes.at(step.index)].filter(Boolean),
    child: (nodes, step) => nodes.map((node) => [...node.children].at(step.index)).filter(Boolean),
    parent: (nodes, step) => nodes.map((node) => walkUp(node, step.times ?? 1)).filter(Boolean),
    sibling: (nodes, step) => nodes.map((node) => walkAside(node, step.offset)).filter(Boolean),
  };

  /** Resolve a locator to its first matching element, or null. */
  function locate(locator, scope) {
    const root = scope ?? doc;
    if (typeof locator === 'string') return root.querySelector(locator);
    let nodes = [root];
    for (const step of locator) nodes = STEPS[step.op](nodes, step);
    return nodes[0] ?? null;
  }

  // ── Measurement ──────────────────────────────────────────────────────────────────────

  /** Walk to the nearest ancestor that actually paints a background. */
  function paintedBackground(el) {
    let node = el;
    while (node) {
      const background = styleOf(node).backgroundColor;
      if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
        return background;
      }
      node = node.parentElement;
    }
    return 'rgba(0, 0, 0, 0)';
  }

  /** One box's horizontal edges, for the alignment rule. */
  function edgesOf(el) {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top };
  }

  function propertiesOf(entry, propertyGroups) {
    if (entry.properties) return entry.properties;
    return (entry.groups ?? []).flatMap((group) => propertyGroups[group] ?? []);
  }

  function readRegion(el, entry, propertyGroups) {
    const computed = styleOf(el);
    const values = {};
    for (const property of propertiesOf(entry, propertyGroups)) {
      values[property] =
        property === 'backgroundColor' && entry.effectiveBackground
          ? paintedBackground(el)
          : computed[property];
    }
    return { tag: el.tagName.toLowerCase(), properties: values };
  }

  /** The danger-family sweep, and its generalisation. */
  function chromeSweep(selectors, forbidden, root) {
    const scope = root ?? doc;
    const found = [];
    for (const selector of selectors) {
      for (const el of scope.querySelectorAll(selector)) {
        const computed = styleOf(el);
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          const width = computed[`border${side}Width`];
          const color = computed[`border${side}Color`];
          if (width !== '0px' && forbidden.some((rgb) => color.includes(rgb))) {
            found.push(`${selector} border-${side.toLowerCase()}: ${width} ${color}`);
          }
        }
        if (
          computed.outlineWidth !== '0px' &&
          forbidden.some((rgb) => computed.outlineColor.includes(rgb))
        ) {
          found.push(`${selector} outline: ${computed.outlineWidth} ${computed.outlineColor}`);
        }
        if (forbidden.some((rgb) => computed.scrollbarColor.includes(rgb))) {
          found.push(`${selector} scrollbar-color: ${computed.scrollbarColor}`);
        }
      }
    }
    return found;
  }

  /**
   * Read one screen: every region mapped onto it, the chrome sweep, the required ancestors and
   * every alignment group's member edges.
   */
  function measure(payload) {
    const scope = payload.root ? doc.querySelector(payload.root) : doc.documentElement;
    if (!scope) return { missingRoot: payload.root };
    const groups = payload.propertyGroups ?? {};
    const regions = {};
    for (const [name, entry] of Object.entries(payload.regions ?? {})) {
      const el = locate(entry.locator, scope);
      // An UNREACHABLE region is not measured, but its absence IS asserted: the moment the
      // app renders it, the note excusing it has outlived the gap and must go.
      if (entry.unreachable) {
        regions[name] = el ? { reachableAfterAll: true } : { unreachable: true };
      } else if (el) {
        regions[name] = readRegion(el, entry, groups);
      } else {
        regions[name] = { missing: true };
      }
    }
    const alignments = {};
    for (const [name, members] of Object.entries(payload.alignments ?? {})) {
      const edges = {};
      const missing = [];
      for (const [member, locator] of Object.entries(members)) {
        const el = locate(locator, scope);
        if (el) edges[member] = edgesOf(el);
        else missing.push(member);
      }
      alignments[name] = { edges, missing };
    }
    return {
      regions,
      alignments,
      chrome: payload.sweep
        ? chromeSweep(payload.sweep.selectors, payload.sweep.forbidden, scope)
        : [],
      // The real ancestor chain, mechanised.
      missingAncestors: (payload.ancestors ?? []).filter(
        (selector) => !(scope.matches?.(selector) || scope.querySelector(selector))
      ),
    };
  }

  // ── The structural inventory's enumerator ────────────────────────────────────────────

  /**
   * Enumerate a tree into ordered landmarks: cards, the labels inside them, and the icon glyphs
   * inside them. Both documents are enumerated by this one function.
   */
  function collectInventory(root, limits, pane) {
    const cards = [];
    const loose = { labels: [], glyphs: [] };

    // A root is A set, and one element is the set of one.
    const roots = Array.isArray(root) ? root : [root];
    const rootSet = new Set(roots);

    // A landmark's key. Lower-cased, whitespace-collapsed, and every digit run replaced by '#' so a
    // count is not mistaken for copy.
    const normalise = (raw) =>
      String(raw)
        .replaceAll(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replaceAll(/\d+/g, '#')
        .replace(/^[^\p{L}\p{N}#@]+/u, '')
        .replace(/[^\p{L}\p{N}#%)]+$/u, '')
        .trim();

    // The element's OWN text: direct text-node children only, so a container never inherits
    // its descendants' words and every sentence is attributed once.
    const ownText = (el) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join(' ')
        .replaceAll(/\s+/g, ' ')
        .trim();

    // World content is not design.
    const isDataKey = (key) => key.includes('@') || /^[#d\s+-]+$/.test(key) || !/\p{L}/u.test(key);
    const isLabelText = (raw) =>
      Boolean(raw) && raw.length <= limits.maxLabelLength && /\p{L}/u.test(raw);

    // Font Awesome is the one vocabulary both documents share: the prototype writes 'fa-solid
    // fa-grip-vertical' and the subject 'fas fa-grip-vertical'.
    const STYLE_TOKENS = new Set([
      'fa',
      'fas',
      'far',
      'fal',
      'fab',
      'fad',
      'fak',
      'fa-solid',
      'fa-regular',
      'fa-light',
      'fa-thin',
      'fa-duotone',
      'fa-brands',
      'fa-sharp',
      'fa-fw',
      'fa-fixed-width',
      'fa-spin',
      'fa-pulse',
      'fa-lg',
      'fa-sm',
      'fa-xs',
      'fa-2x',
      'fa-3x',
      'fa-inverse',
      'fa-border',
      'fa-stack',
    ]);
    const iconNames = (el) => {
      const classes = typeof el.className === 'string' ? el.className.split(/\s+/) : [];
      return classes.filter((token) => token.startsWith('fa-') && !STYLE_TOKENS.has(token));
    };

    // The width A card is wide relative to — resolved from the first ancestor that has a box, and
    // this walk is the whole of the fix.
    const paneWidth = (el) => {
      for (let node = el; node; node = node.parentElement) {
        const width = node.clientWidth || node.getBoundingClientRect().width || 0;
        if (width > 0) return width;
      }
      return 0;
    };
    // The pane may be declared, and on a `display: contents` root it usually has to be.
    const rootWidth = paneWidth(pane ?? roots[0]);
    // A root with no box anywhere above it is A harness fault, reported rather than defaulted.
    if (rootWidth <= 0) return { unmeasurableRoot: true };

    // A heading is a heading.
    const isTitleLeaf = (el, text) => {
      if (!isLabelText(text)) return false;
      if (/^h[1-6]$/.test(el.tagName.toLowerCase())) return true;
      const computed = styleOf(el);
      return (
        Number.parseInt(computed.fontWeight, 10) >= limits.minTitleWeight &&
        px(computed.fontSize) >= limits.minTitleSize
      );
    };

    // A card is a bordered, rounded, near-full-width container that owns A title.
    const isCard = (el) => {
      const computed = styleOf(el);
      if (computed.borderTopStyle === 'none' || px(computed.borderTopWidth) < 1) return false;
      if (px(computed.borderTopLeftRadius) < limits.minCardRadius) return false;
      return el.getBoundingClientRect().width >= rootWidth * limits.minCardWidthRatio;
    };

    const recordText = (el, target, text) => {
      const key = normalise(text);
      if (!key || isDataKey(key)) return;
      if (target && !target.title && isTitleLeaf(el, text)) {
        target.title = key;
        target.rawTitle = text;
      } else if (target) target.labels.push(key);
      else loose.labels.push(key);
    };

    // A titleless card candidate is a ROW, not a card: fold what it collected into its parent
    // so nothing is lost and no phantom card is reported.
    const closeCard = (card, stack) => {
      if (card.title) {
        card.path = [
          ...stack.filter((entry) => entry.title).map((entry) => entry.title),
          card.title,
        ];
        cards.push(card);
        return;
      }
      const parent = stack.at(-1) ?? loose;
      parent.labels.push(...card.labels);
      parent.glyphs.push(...card.glyphs);
    };

    const walk = (el, cardStack) => {
      // A landmark nobody can see is not a landmark.
      const computed = styleOf(el);
      if (computed.display === 'none' || computed.visibility === 'hidden') return;

      const ownCard =
        !rootSet.has(el) && isCard(el)
          ? { element: el, title: '', rawTitle: '', path: [], labels: [], glyphs: [] }
          : null;
      const target = ownCard ?? cardStack.at(-1) ?? null;
      const nextStack = ownCard ? [...cardStack, ownCard] : cardStack;

      const text = ownText(el);
      if (isLabelText(text)) recordText(el, target, text);
      for (const icon of iconNames(el)) (target ?? loose).glyphs.push(icon);
      for (const child of el.children) walk(child, nextStack);
      if (ownCard) closeCard(ownCard, cardStack);
    };

    // Each part is walked with an EMPTY card stack, so a card in one part never adopts the
    // labels of another; the sort below puts every card back into document order regardless of
    // which part it came from.
    for (const part of roots) walk(part, []);

    // Document order, which the post-order walk above does not produce.
    cards.sort((left, right) => {
      const relation = left.element.compareDocumentPosition(right.element);
      if (relation & globalThis.Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & globalThis.Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const dedupe = (values) => [...new Set(values)];
    return {
      cards: cards.map((card) => ({
        title: card.title,
        rawTitle: card.rawTitle,
        path: card.path,
        labels: dedupe(card.labels),
        glyphs: dedupe(card.glyphs),
      })),
      loose: { labels: dedupe(loose.labels), glyphs: dedupe(loose.glyphs) },
    };
  }

  /**
   * The inventory entry point: resolve the root — one locator, or a declared SET of them —
   * and enumerate it.
   */
  function inventoryOf(payload) {
    const parts = payload.locator?.parts ?? [payload.locator];
    const roots = [];
    for (const part of parts) {
      const el = locate(part, null);
      // A part that resolves to nothing is A fault, never a quietly shorter walk.
      if (!el) return { missingRoot: true, missingPart: part };
      roots.push(el);
    }
    // A part inside another part is also A fault.
    for (const outer of roots) {
      for (const inner of roots) {
        if (outer !== inner && outer.contains(inner)) return { nestedRoots: true };
      }
    }
    // A declared pane that resolves to nothing is a FAULT, never a silent fall-back to the
    // walk: falling back would re-calibrate the classifier without saying so, which is the
    // whole class of defect this argument exists to close.
    const pane = payload.pane ? locate(payload.pane, null) : null;
    if (payload.pane && !pane) return { missingPane: true };
    return collectInventory(roots, payload.limits, pane);
  }

  // `collectInventory` is published so a Node test can enumerate a hand-built tree without a
  // browser: the `display: contents` root above is a fact about CSS that no unit fixture in
  // this repository would otherwise reproduce, and the classifier's calibration is the one
  // part of this runtime whose defect was invisible in every log it produced.

  // Published on the page global because that is the only scope a later `page.evaluate` can
  // reach. `defineProperty` rather than assignment so a re-install replaces it cleanly.
  Object.defineProperty(globalThis, '__fabricateParity', {
    value: { locate, measure, inventoryOf, collectInventory },
    writable: true,
    configurable: true,
  });
}

/** Install the runtime in a page. Called once per page, after it has loaded. */
export async function installRuntime(page) {
  await page.evaluate(installParityRuntime);
}
