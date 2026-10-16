/** `localizeOr` (issue 1521): one replacer fills whichever template was chosen, never core `format`. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { localizeOr } from '../../src/ui/svelte/util/localizeOr.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';

const TRANSLATIONS = {
  'T.Plain': 'Plain text',
  'T.Hello': 'Hello {name}',
  'T.Partial': 'Hi {name}, {k}',
};

/** Core's `I18n#format`: an unsupplied placeholder becomes `"undefined"`, unlike the lang double. */
function coreFormat(key, data = {}) {
  return coreLocalize(key).replaceAll(/{[^}]+}/g, (token) => data[token.slice(1, -1)]);
}

function coreLocalize(key) {
  return TRANSLATIONS[key] ?? key;
}

let env;
before(() => {
  env = installFoundryBridgeEnv({ labels: { localize: coreLocalize, format: coreFormat } });
});
after(() => env.restore());

describe('localizeOr', () => {
  it('returns the translation of a resolved key', () => {
    assert.equal(localizeOr('T.Plain', 'Fallback'), 'Plain text');
  });

  it('returns the fallback for an unresolved key, and the key when there is none', () => {
    assert.equal(localizeOr('T.Missing', 'Fallback'), 'Fallback');
    assert.equal(localizeOr('T.Missing'), 'T.Missing');
  });

  it('returns either template verbatim when no data is given', () => {
    assert.equal(localizeOr('T.Hello', 'Hi {name}'), 'Hello {name}');
    assert.equal(localizeOr('T.Missing', 'Hi {name}'), 'Hi {name}');
  });

  it('fills supplied placeholders and keeps an unsupplied one verbatim on both paths', () => {
    assert.equal(localizeOr('T.Partial', 'unused', { name: 'A' }), 'Hi A, {k}');
    assert.equal(localizeOr('T.Missing', 'Hi {name}, {k}', { name: 'A' }), 'Hi A, {k}');
  });

  it('inserts a value literally, with no replacement-pattern expansion', () => {
    assert.equal(localizeOr('T.Hello', 'unused', { name: 'A$&B' }), 'Hello A$&B');
    assert.equal(localizeOr('T.Missing', 'Hi {name}', { name: 'A$&B' }), 'Hi A$&B');
  });

  it('returns the fallback for an empty key, and an empty string when there is none', () => {
    assert.equal(localizeOr('', 'X'), 'X');
    assert.equal(localizeOr(''), '');
  });
});
