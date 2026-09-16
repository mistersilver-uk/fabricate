/**
 * What the two `Select` Chromium fixtures (`player-select/mount.js`, issue 1511, and
 * `manager-select/mount.js`, issue 1510) share: the `game.i18n` stub backed by the REAL
 * `lang/en.json`, and the three caption SHAPES built around one bare `Select`.
 *
 * Lifted out rather than copied because the two fixtures are the same instrument pointed at two
 * apps, and a divergence between their stubs would make a width measured in one incomparable
 * with the other. Each fixture still owns its own frame class, its own subjects and its own
 * wrapper classes — those are the differences under test.
 */

/**
 * Install `game.i18n` backed by the real language file.
 *
 * Not decoration: `localize` returns the KEY when no `game` is present, and every width these
 * fixtures report is a text measurement. A trigger reading
 * `FABRICATE.Admin.Manager.Economy.RegenPolicyElapsed` is four times the width of one reading
 * "Over world time", so a fixture without this would measure its own stub rather than the
 * product.
 *
 * @param {Record<string, unknown>} en The parsed `lang/en.json`.
 * @returns {void}
 */
export function installFixtureI18n(en) {
  const lookup = (key) =>
    String(key)
      .split('.')
      .reduce((node, part) => (node == null ? undefined : node[part]), en);

  globalThis.game = {
    i18n: {
      localize(key) {
        const value = lookup(key);
        return typeof value === 'string' ? value : key;
      },
      format(key, data = {}) {
        const template = this.localize(key);
        return template.replaceAll(/\{(\w+)\}/gu, (whole, name) =>
          Object.hasOwn(data, name) ? String(data[name]) : whole
        );
      },
    },
  };
}

/** One option set for the three caption SHAPES, so all three measure the same control. */
export const SHAPE_OPTIONS = Object.freeze([
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
]);

/**
 * The three caption shapes, built around the same `Select`.
 *
 * `label` and `span` are hosted by fixture markup because that is exactly the difference under
 * test — the wrapper element. `field` is the primitive's own shipped form and is built by the
 * component itself, so its host is whatever `Select.svelte` renders on the commit under test.
 *
 * @param {object} options
 * @param {Function} options.mount Svelte's `mount`.
 * @param {unknown} options.Select The `Select` component.
 * @param {HTMLElement} options.mountPoint Where the shape mounts.
 * @param {string} options.subject `label`, `span` or `field`.
 * @param {string} options.startValue The option that starts selected (`''` for the default).
 * @param {string} options.wrapperClass Class list for the `label`/`span` wrapper.
 * @param {string} options.captionClass Class list for the caption inside the wrapper.
 * @param {Record<string, unknown>} [options.extraProps] Extra props for the wrapped forms.
 * @returns {void}
 */
export function mountCaptionShape({
  mount,
  Select,
  mountPoint,
  subject,
  startValue,
  wrapperClass,
  captionClass,
  extraProps = {},
}) {
  const options = [...SHAPE_OPTIONS];
  if (subject === 'field') {
    mount(Select, {
      target: mountPoint,
      props: {
        size: 'inline',
        label: 'Sort',
        value: startValue || 'newest',
        options,
        triggerData: { 'data-fixture-select': '' },
        onChange: () => {},
      },
    });
    return;
  }

  const wrapper = document.createElement(subject === 'label' ? 'label' : 'span');
  wrapper.className = wrapperClass;
  const caption = document.createElement('span');
  caption.className = captionClass;
  caption.id = 'fixture-caption';
  caption.textContent = 'Sort';
  wrapper.append(caption);
  mountPoint.append(wrapper);

  mount(Select, {
    target: wrapper,
    props: {
      size: 'inline',
      ...extraProps,
      value: startValue || 'newest',
      options,
      ariaLabelledBy: 'fixture-caption',
      triggerData: { 'data-fixture-select': '' },
      onChange: () => {},
    },
  });
}
