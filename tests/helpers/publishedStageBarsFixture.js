/**
 * The groups `tests/view-lab/fixtures/PublishedStageBars.svelte` mounts, read from its AST as
 * `[key, props]` pairs, so a test names what the fixture draws without restating it.
 */
import { componentAstOf } from './parsedSource.js';

const FIXTURE = 'tests/view-lab/fixtures/PublishedStageBars.svelte';

/** The value of a literal-only expression: an array, an object, a string, a number or a boolean. */
function literalOf(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literalOf);
  if (node.type !== 'ObjectExpression') {
    throw new Error(`The fixture's GROUPS holds a ${node.type}, which is not a literal`);
  }
  return Object.fromEntries(
    node.properties.map((property) => [
      property.key.name ?? property.key.value,
      literalOf(property.value),
    ])
  );
}

/** The fixture's `GROUPS`: `[key, props]` for each group, in the order it mounts them. */
export function stageBarsFixtureGroups() {
  const { instance } = componentAstOf(FIXTURE);
  const groups = instance.content.body
    .flatMap((node) => node.declarations ?? [])
    .find((declarator) => declarator.id.name === 'GROUPS');
  return literalOf(groups.init.arguments[0]);
}
