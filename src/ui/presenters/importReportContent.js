/**
 * Pure assembly of the post-import reference report (Q4). Foundry-free: takes the
 * import `summary` plus an injected `localize(key, data?)` and returns a plain
 * data structure (headline, per-kind grouped reported rows, handled counts,
 * empty-state flag). The DialogV2 in the app shell only renders this output (and
 * owns HTML-escaping, F4); keeping assembly pure makes it unit-testable without a
 * smoke run.
 */

const L = 'FABRICATE.Admin.ImportReport';

/** Stable display order for reference kinds. */
const KIND_ORDER = [
  'sourceItem',
  'scene',
  'sceneRegion',
  'macro',
  'dropRowItem',
  'componentLink',
  'taskLink',
  'eventLink',
  'recipeItem',
];

/**
 * @param {object} summary - CompendiumImporter summary (`unresolvedReferences[]`)
 * @param {(key: string, data?: object) => string} localize
 * @returns {{
 *   title: string,
 *   headline: string,
 *   hasReported: boolean,
 *   reportedCount: number,
 *   handledCount: number,
 *   emptyStateLabel: string,
 *   groups: Array<{ kind: string, kindLabel: string, count: number, rows: Array<object> }>,
 *   handledLine: string
 * }}
 */
export function buildImportReportContent(summary, localize) {
  const t = typeof localize === 'function' ? localize : (key) => key;
  const references = Array.isArray(summary?.unresolvedReferences)
    ? summary.unresolvedReferences
    : [];

  const reported = references.filter((ref) => ref.disposition === 'reported');
  const handled = references.filter((ref) => ref.disposition !== 'reported');

  const groupsByKind = new Map();
  for (const ref of reported) {
    const kind = ref.kind || 'unknown';
    if (!groupsByKind.has(kind)) groupsByKind.set(kind, []);
    // Every grouped row is a `reported` ref, so a per-row disposition label
    // would be a zero-information repeat under a headline that already says so —
    // it is intentionally omitted here.
    groupsByKind.get(kind).push({
      ownerType: ref.ownerType || '',
      ownerTypeLabel: t(`${L}.OwnerType.${ref.ownerType || 'unknown'}`),
      ownerName: ref.ownerName || '',
      referenceValue: ref.referenceValue || '',
    });
  }

  const orderedKinds = [
    ...KIND_ORDER.filter((kind) => groupsByKind.has(kind)),
    ...[...groupsByKind.keys()].filter((kind) => !KIND_ORDER.includes(kind)),
  ];

  const groups = orderedKinds.map((kind) => {
    const rows = groupsByKind.get(kind);
    return {
      kind,
      kindLabel: t(`${L}.Kind.${kind}`),
      count: rows.length,
      rows,
    };
  });

  const reportedCount = reported.length;
  const handledCount = handled.length;
  const hasReported = reportedCount > 0;

  const headline = hasReported
    ? t(`${L}.HeadlineNeedsAttention`, { count: reportedCount })
    : t(`${L}.HeadlineAllResolved`);

  return {
    title: t(`${L}.Title`),
    headline,
    hasReported,
    reportedCount,
    handledCount,
    emptyStateLabel: t(`${L}.EmptyState`),
    groups,
    handledLine: t(`${L}.HandledLine`, { count: handledCount }),
  };
}
