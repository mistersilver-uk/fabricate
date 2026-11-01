// The typeahead combobox's holder contract, written once (issue 2157). The input holds DOM focus
// and drives a portalled suggestion list, per `openspec/specs/design-system/spec.md` under "A
// picker announces the panel it opens": the list is open only while the field holds focus and its
// query is non-empty, each edit leaves no option active, a choice closes the list until the query
// changes, and Escape empties the query, or with `escapeCloses` first closes an open list.
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
  // The query a choice was made at, at which Enter commits nothing more until the query changes.
  #chosenAt = null;
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
    'aria-selected': String(this.#active === index),
    onclick: () => this.#choose(index),
  });

  /** `typeaheadPanel`'s parameters. `count` is carried so a narrowed list re-measures. */
  get panel() {
    return {
      component: this.#config.component,
      trigger: this.#anchor,
      maxHeightCap: this.#config.maxHeightCap,
      rows: this.#config.rows,
      count: this.#count,
      onOutsidePress: this.#dismiss,
    };
  }

  get #listId() {
    return `${this.#prefix}-list`;
  }

  #anchor = () => {
    const selector = this.#config.anchor;
    return (selector && this.#input?.closest?.(selector)) || this.#input;
  };

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
    this.#cursor = { query: '', index: -1 };
    this.#chosenAt = null;
    this.#config.setQuery(event.currentTarget.value);
  };

  #onBlur = () => {
    this.#focused = false;
  };

  #choose(index) {
    this.#cursor = { query: '', index: -1 };
    this.#dismissedAt = this.#query;
    this.#chosenAt = this.#query;
    this.#config.onChoose(index);
  }

  /** Closes the list until the query changes, as a press elsewhere does. */
  close = () => {
    this.#dismiss();
  };

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

  // Safari reports a key that commits an IME composition with `keyCode` 229 and no `isComposing`.
  #composing(event) {
    return event.isComposing || (this.#config.processKeyComposes && event.keyCode === 229);
  }

  #onEscape(event) {
    const shown = this.#listed || (this.#open && Boolean(this.#config.hasNote));
    const closes = this.#config.escapeCloses && shown;
    if (!closes && String(this.#config.query() ?? '') === '') return;
    event.preventDefault();
    event.stopPropagation();
    this.#cursor = { query: '', index: -1 };
    if (closes) this.#dismiss();
    else this.#config.setQuery('');
  }

  // A field whose `onEnterUnchosen` answers `false` has not taken that Enter, so it passes on.
  #onEnterUnchosen(event) {
    if (this.#chosenAt !== null && this.#chosenAt === this.#query) {
      event.preventDefault();
      return;
    }
    if (this.#config.onEnterUnchosen() !== false) event.preventDefault();
  }

  #onKeydown = (event) => {
    if (this.#composing(event)) return;
    if (event.key === 'Escape') {
      this.#onEscape(event);
      return;
    }
    if (this.#listed) {
      this.#onListKey(event);
      return;
    }
    if (event.key === 'Enter' && this.#config.onEnterUnchosen) this.#onEnterUnchosen(event);
  };
}

/**
 * @param {object} config
 * @param {string} config.component the overlay's name in a missing-host report
 * @param {string} [config.anchor] selector of the field's visual box, an ancestor of the input;
 *   the input itself when omitted
 * @param {() => string} config.query the field's current value
 * @param {() => number} config.count how many suggestions the query yields
 * @param {(value: string) => void} config.setQuery writes the caller's query; Escape writes ''
 * @param {(index: number) => void} config.onChoose commits one suggestion
 * @param {() => (boolean | void)} [config.onEnterUnchosen] what Enter commits with no option
 *   active; a field that supplies it consumes every Enter, open or not, but one it answers `false`
 *   while the list is closed
 * @param {boolean} [config.escapeCloses] Escape closes a shown list and keeps the query, and
 *   empties it only while none is shown
 * @param {boolean} [config.hasNote] the caller shows a note while the query lists nothing
 * @param {boolean} [config.processKeyComposes] a `keyCode` 229 key counts as composing
 * @param {number} [config.maxHeightCap] the panel's height bound
 * @param {{pitch: number, gap: number, chrome: number}} [config.rows] floors that bound to rows
 */
export function createTypeaheadCombobox(config) {
  return new TypeaheadCombobox(config);
}
