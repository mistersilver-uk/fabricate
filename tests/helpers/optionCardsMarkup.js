/** The classes `RadioCardGroup` writes, read from its source, so a static copy of its DOM can be held to them (issue 2467). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');

/** What the chip's `Medallion` writes at `size={30}`, chosen (`tone`) or at rest (`ink`). */
const MEDALLION_CHIP_CLASSES = Object.freeze([
  'fab-medallion',
  'is-glyph-chip',
  'is-corner-7',
  'is-tone-accent',
  'is-ink-neutral',
]);

/** Every class token the component's markup can write, with `Field`'s root and `Medallion`'s chip classes. */
export function optionCardsClassesWritten() {
  const source = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/components/RadioCardGroup.svelte'),
    'utf8'
  );
  const markup = source.slice(source.indexOf('</script>'), source.lastIndexOf('<style>'));
  const written = new Set(['fabricate-field', ...MEDALLION_CHIP_CLASSES]);
  for (const [, plain, template] of markup.matchAll(/class=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const literal = (plain ?? template).replaceAll(/\$\{[^}]*\}/g, ' ');
    for (const token of literal.split(/\s+/)) if (token) written.add(token);
  }
  for (const [, token] of markup.matchAll(/'\s(is-[\w-]+)'/g)) written.add(token);
  for (const [, token] of markup.matchAll(/class:([\w-]+)/g)) written.add(token);
  return written;
}

/** The class tokens a fixture's markup carries that the component never writes; an option's icon is data. */
export function classesNotWritten(fixture) {
  const written = optionCardsClassesWritten();
  const carried = [...fixture.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) =>
    value.split(/\s+/)
  );
  const icon = /^(?:fa[srb]?|fa-[\w-]+)$/;
  return [...new Set(carried.filter((token) => token && !icon.test(token) && !written.has(token)))];
}
