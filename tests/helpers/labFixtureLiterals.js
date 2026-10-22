/**
 * The literal constants a View Lab fixture declares, read from its AST, so a test names what the
 * fixture draws without restating it.
 */
import { componentAstOf } from './parsedSource.js';

/** The value of a literal-only expression: an array, an object, a string, a number or a boolean. */
function literalOf(node, name) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') {
    return node.elements.map((element) => literalOf(element, name));
  }
  if (node.type !== 'ObjectExpression') {
    throw new Error(`The fixture's ${name} holds a ${node.type}, which is not a literal`);
  }
  return Object.fromEntries(
    node.properties.map((property) => [
      property.key.name ?? property.key.value,
      literalOf(property.value, name),
    ])
  );
}

/** The value of the fixture's top-level constant `name`, read through any `Object.freeze`. */
export function fixtureLiteral(fixture, name) {
  const { instance } = componentAstOf(fixture);
  const { init } = instance.content.body
    .flatMap((node) => node.declarations ?? [])
    .find((declarator) => declarator.id.name === name);
  const frozen = init.type === 'CallExpression' && init.callee.property?.name === 'freeze';
  return literalOf(frozen ? init.arguments[0] : init, name);
}

/** `PublishedStageBars.svelte`'s `GROUPS`: `[key, props]` for each group, in mount order. */
export const stageBarsFixtureGroups = () =>
  fixtureLiteral('tests/view-lab/fixtures/PublishedStageBars.svelte', 'GROUPS');
