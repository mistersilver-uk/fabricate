/**
 * The player window's props held reactive, as `SvelteApplicationMixin` holds them, with a tab
 * select that writes the new tab back the way `SvelteFabricateApp._selectTab` does (issue 2571).
 *
 * @param {object} initial The player window's props bag.
 * @returns {object} The same props, reactive, with `onSelectTab` switching `activeTab`.
 */
export function switchableTabs(initial) {
  const props = $state({});
  Object.assign(props, initial, {
    onSelectTab: (tab) => {
      props.activeTab = tab;
    },
  });
  return props;
}
