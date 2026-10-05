// One drop behaviour (issue 1675): every drop target that is not a list reorder goes through
// `ItemDropZone` or the `dragDrop` action, so a raw `ondrop`/`ondragover` attribute in a template
// is a hand-rolled copy of the bookkeeping the action owns. Read off the PARSED template, not the
// source text, so a comment or a string naming the attribute is not a hit.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parse } from 'svelte/compiler';

import { parsedTemplates, walkElements } from './helpers/svelteTemplateScan.js';

const RAW_DROP_ATTRIBUTES = new Set(['ondrop', 'ondragover']);

// The two list reorders: `SortableList` is the shared primitive, and the player stage list is a
// hand-rolled reorder awaiting convergence on it.
const ALLOWED = new Set([
  'src/ui/svelte/components/SortableList.svelte',
  'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
]);

/** Every `{file, name, line}` raw drop attribute the scanned templates carry. */
function rawDropAttributes(templates) {
  const found = [];
  for (const { file, source, ast } of templates) {
    walkElements(ast.fragment, (element) => {
      for (const attribute of element.attributes || []) {
        if (attribute.type === 'Attribute' && RAW_DROP_ATTRIBUTES.has(attribute.name)) {
          found.push({
            file,
            name: attribute.name,
            line: source.slice(0, attribute.start).split('\n').length,
          });
        }
      }
    });
  }
  return found;
}

describe('drop targets (issue 1675)', () => {
  const templates = parsedTemplates();
  const found = rawDropAttributes(templates);

  it('scans a real template set', () => {
    assert.ok(templates.length > 100, `only ${templates.length} templates were scanned`);
  });

  it('carries no raw ondrop or ondragover outside the two list reorders', () => {
    const stray = found.filter(({ file }) => !ALLOWED.has(file));
    assert.deepEqual(
      stray.map(({ file, name, line }) => `${file}:${line} ${name}`),
      [],
      'route the drop through ItemDropZone or use:dragDrop'
    );
  });

  it('keeps the allowlist honest: every named file still carries both', () => {
    for (const file of ALLOWED) {
      for (const name of RAW_DROP_ATTRIBUTES) {
        assert.ok(
          found.some((hit) => hit.file === file && hit.name === name),
          `${file} no longer carries ${name}: drop it from the allowlist`
        );
      }
    }
  });

  it('can fail: the scanner finds an attribute in a synthetic template', () => {
    const synthetic = parsedTemplatesFrom('<div ondrop={() => {}}></div>');
    assert.equal(rawDropAttributes(synthetic).length, 1);
  });
});

function parsedTemplatesFrom(source) {
  return [{ file: 'synthetic.svelte', source, ast: parse(source, { modern: true }) }];
}
