/** Group-free expansions of a `sourceMatches` / `matches` pattern, for the stranded-path guards. */

/**
 * The first unescaped group holding no nested group, with the quantifier after it. A lookaround
 * is never one: its branches are not paths.
 */
const INNERMOST_GROUP = /(?<!\\)\((?:\?:)?(?!\?)((?:[^()\\]|\\.)*)\)([?*+]?)/;

/** Every group-free path through a pattern; an optional group also takes its empty branch. */
export function alternativesOf(pattern, source = pattern.source) {
  const group = INNERMOST_GROUP.exec(source);
  if (!group) return source === pattern.source ? [] : [new RegExp(source, pattern.flags)];
  const branches = group[1].split(/(?<!\\)\|/);
  if (group[2] === '?' || group[2] === '*') branches.push('');
  const head = source.slice(0, group.index);
  const tail = source.slice(group.index + group[0].length);
  return branches.flatMap((branch) => alternativesOf(pattern, `${head}${branch}${tail}`));
}
