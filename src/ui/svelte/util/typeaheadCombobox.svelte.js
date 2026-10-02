// The typeahead combobox's holder contract, written once (issue 2157). The input holds DOM focus
// and drives a portalled suggestion list, per `openspec/specs/design-system/spec.md` under "A
// picker announces the panel it opens": the list is open only while the field holds focus and its
// query is non-empty, a new query starts with no active option, and Escape empties the query.
// A call site spreads `field`, `list` and `option(index)` onto its own markup and applies
// `typeaheadPanel` with `panel`; it writes no handler of its own. Every config value that can
// change is a thunk read at call time.
import { activeOptionId, holderKeyIntent } from './listboxNavigation.js';

// Per instance, because two fields both indexing their options from 0 would emit one DOM id twice.
let instances = 0;

function suppressPointerFocus(event) {
  event.preventDefault();
}

function reveal(option) {
  const list = option?.closest?.('[role="listbox"]');
  if (!list) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

class TypeaheadCombobox {
  #config;
  #prefix;
  #input = null;
  #focused = $state(false);
  // The query a press elsewhere dismissed the list at, so typing a different one reopens it.
  #dismissedAt = $state(null);
  #cursor = $state({ query: '', index: -1 });

  #query = $derived(String(this.#config.query() ?? '').trim());
  #count = $derived(Math.max(0, Number(this.#config.count()) || 0));
  #open = $derived(this.#focused && this.#query !== '' && this.#dismissedAt !== this.#query);
  #listed = $derived(this.#open && this.#count > 0);
  #active = $derived(
    this.#listed && this.#cursor.query === this.#query && this.#cursor.index < this.#count
      ? this.#cursor.index
      : -1
  );

  constructor(config) {
    this.#config = config;
    instances += 1;
    this.#prefix = `fabricate-typeahead-${instances}`;
  }

  /** Whether the panel is rendered at all: a listbox, or a caller's own empty note. */
  get open() {
    return this.#open;
  }

  /** Whether a `role="listbox"` is rendered. */
  get listed() {
    return this.#listed;
  }

  get field() {
    const listed = this.#listed;
    return {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': listed,
      'aria-controls': listed ? this.#listId : undefined,
      'aria-activedescendant': listed ? activeOptionId(this.#prefix, this.#active) : undefined,
      oninput: this.#onInput,
      onfocus: this.#hold,
      onblur: this.#onBlur,
      onkeydown: this.#onKeydown,
    };
  }

  get list() {
    return { id: this.#listId, role: 'listbox', onmousedown: suppressPointerFocus };
  }

  /** The panel's attributes while it holds a caller's empty note in place of the listbox. */
  get note() {
    return { role: 'status', onmousedown: suppressPointerFocus };
  }

  option = (index) => ({
    id: activeOptionId(this.#prefix, index),
    role: 'option',
    tabindex: -1,
    'data-keyboard-focus': 'true',
    'aria-selected': String(this.#active === index),
    onclick: () => this.#choose(index),
  });

  /** `typeaheadPanel`'s parameters. `count` is carried so a narrowed list re-measures. */
  get panel() {
    return {
      component: this.#config.component,
      trigger: () => this.#input?.closest?.(this.#config.anchor) ?? this.#input,
      maxHeightCap: this.#config.maxHeightCap,
      rows: this.#config.rows,
      count: this.#count,
      onOutsidePress: this.#dismiss,
    };
  }

  get #listId() {
    return `${this.#prefix}-list`;
  }

  #dismiss = () => {
    this.#dismissedAt = this.#query;
  };

  #hold = (event) => {
    this.#input = event.currentTarget;
    this.#focused = true;
    this.#dismissedAt = null;
  };

  #onInput = (event) => {
    this.#hold(event);
    this.#config.onInput(event);
  };

  #onBlur = () => {
    this.#focused = false;
  };

  #choose(index) {
    this.#cursor = { query: '', index: -1 };
    this.#config.onChoose(index);
  }

  #moveTo(index) {
    this.#cursor = { query: this.#query, index };
    const id = activeOptionId(this.#prefix, index);
    reveal(this.#input?.ownerDocument?.getElementById(id));
  }

  #onListKey(event) {
    const intent = holderKeyIntent(event, {
      open: true,
      showSearch: true,
      count: this.#count,
      current: this.#active,
    });
    if (intent.kind === 'choose') this.#choose(intent.index);
    else if (intent.kind === 'move-cursor') this.#moveTo(intent.index);
    else if (event.key === 'Enter') this.#config.onEnterUnchosen?.();
    else return;
    event.preventDefault();
  }

  #onKeydown = (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      if (String(this.#config.query() ?? '') === '') return;
      event.preventDefault();
      event.stopPropagation();
      this.#config.onClear();
      return;
    }
    if (this.#listed) {
      this.#onListKey(event);
      return;
    }
    if (event.key === 'Enter' && this.#config.onEnterUnchosen) {
      event.preventDefault();
      this.#config.onEnterUnchosen();
    }
  };
}

/**
 * @param {object} config
 * @param {string} config.component the overlay's name in a missing-host report
 * @param {string} config.anchor selector of the field's visual box, an ancestor of the input
 * @param {() => string} config.query the field's current value
 * @param {() => number} config.count how many suggestions the query yields
 * @param {(event: Event) => void} config.onInput writes the typed value to the caller's query
 * @param {() => void} config.onClear empties the caller's query
 * @param {(index: number) => void} config.onChoose commits one suggestion
 * @param {() => void} [config.onEnterUnchosen] what Enter commits with no option active; a field
 *   that supplies it consumes every Enter, open or not
 * @param {number} [config.maxHeightCap] the panel's height bound
 * @param {{pitch: number, gap: number, chrome: number}} [config.rows] floors that bound to rows
 */
export function createTypeaheadCombobox(config) {
  return new TypeaheadCombobox(config);
}
