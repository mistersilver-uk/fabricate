// TEMPORARY CI diagnostic: removed after extracting canonical Prettier output.
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import prettier from 'prettier';

test('print exactly formatted new JS sources for the current PR', async () => {
  for (const path of ['src/systems/descriptionEmbeds.js', 'tests/description-embeds.test.js']) {
    const input = await readFile(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    const formatted = await prettier.format(input, { ...options, filepath: path });
    console.log('FABRICATE_PRETTIER_DIAGNOSTIC=' + JSON.stringify({ path, content: formatted }));
  }
});
