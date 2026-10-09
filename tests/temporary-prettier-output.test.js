// TEMPORARY CI diagnostic: removed after extracting canonical Prettier output.
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as prettier from 'prettier/standalone';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';

test('print exactly formatted new JS sources for the current PR', async () => {
  for (const path of ['src/systems/descriptionEmbeds.js', 'tests/description-embeds.test.js']) {
    const input = await readFile(path, 'utf8');
    const formatted = await prettier.format(input, {
      parser: 'babel',
      plugins: [babel, estree],
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      quoteProps: 'as-needed',
      trailingComma: 'es5',
      bracketSpacing: true,
      arrowParens: 'always',
      endOfLine: 'lf',
    });
    console.log('FABRICATE_PRETTIER_DIAGNOSTIC=' + JSON.stringify({ path, content: formatted }));
  }
});
