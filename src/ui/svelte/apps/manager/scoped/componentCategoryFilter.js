export const COMPONENT_CATEGORY_FILTER_NONE = '__none';

/**
 * The catalogue's category filter. Options: all, none, the world vocabulary in its order, then
 * any category an entry carries that the vocabulary lacks (code-point order). WITHHELD when no
 * category exists. It compares the trimmed `defaults.category` the inspector's section draws.
 */
export function componentCategoryFilter({ categories = [], entries = [] } = {}, phrase) {
  const categoryOf = (entry) => String(entry?.defaults?.category ?? '').trim();
  const vocabulary = Array.isArray(categories) ? categories : [];
  const known = new Set(vocabulary);
  const strays = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const category = categoryOf(entry);
    if (category && !known.has(category)) strays.add(category);
  }
  const named = [
    ...vocabulary,
    ...[...strays].sort((left, right) => (left < right ? -1 : Number(left > right))),
  ];
  if (named.length === 0) return [];
  return [
    {
      id: 'category',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterCategory', 'Category'),
      toolbarRow: 'lead',
      options: [
        {
          value: 'all',
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterCategoryAll',
            'All categories'
          ),
        },
        {
          value: COMPONENT_CATEGORY_FILTER_NONE,
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterCategoryNone',
            'No category'
          ),
        },
        ...named.map((category) => ({ value: category, label: category })),
      ],
      matches: (entry, value) => {
        if (value === 'all') return true;
        const category = categoryOf(entry);
        return value === COMPONENT_CATEGORY_FILTER_NONE ? category === '' : category === value;
      },
    },
  ];
}
