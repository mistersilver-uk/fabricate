/**
 * Guard: `lang/en.json` must have no duplicate sibling keys.
 *
 * `JSON.parse` silently keeps the LAST of two same-level duplicate keys and
 * discards the earlier one, so a duplicate is invisible to every consumer that
 * reads the parsed object — and any JSON round-trip (formatter, codemod, agent)
 * can rewrite the survivor into the dead one's slot and delete the other. This
 * happened during issue 651 (`Locked`, `StepLabel`). We therefore parse the RAW
 * text with a minimal structural tokenizer (NOT `JSON.parse`) and flag any key
 * that repeats within the same object.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Tokenize JSON into structural tokens plus string/literal leaves. Numbers,
// booleans, and null collapse to a single opaque `literal` token — we only need
// object structure and the string keys, not scalar values.
function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      let value = '';
      while (j < src.length) {
        if (src[j] === '\\') {
          value += src[j] + (src[j + 1] ?? '');
          j += 2;
          continue;
        }
        if (src[j] === '"') break;
        value += src[j];
        j += 1;
      }
      tokens.push({ type: 'string', value });
      i = j + 1;
    } else if ('{}[]:,'.includes(c)) {
      tokens.push({ type: c });
      i += 1;
    } else if (/\s/.test(c)) {
      i += 1;
    } else {
      let j = i;
      while (j < src.length && !'{}[]:,"'.includes(src[j]) && !/\s/.test(src[j])) j += 1;
      tokens.push({ type: 'literal' });
      i = j;
    }
  }
  return tokens;
}

function findDuplicateKeys(tokens) {
  const duplicates = [];
  let pos = 0;

  function parseValue(path) {
    const token = tokens[pos];
    if (!token) return;
    if (token.type === '{') return parseObject(path);
    if (token.type === '[') return parseArray(path);
    pos += 1; // string or literal leaf
  }

  function parseObject(path) {
    pos += 1; // consume '{'
    const seen = new Set();
    while (tokens[pos] && tokens[pos].type !== '}') {
      const keyToken = tokens[pos];
      pos += 1; // consume key
      if (tokens[pos] && tokens[pos].type === ':') pos += 1; // consume ':'
      const keyName = keyToken.value;
      const fullPath = path ? `${path}.${keyName}` : keyName;
      if (seen.has(keyName)) duplicates.push(fullPath);
      seen.add(keyName);
      parseValue(fullPath);
      if (tokens[pos] && tokens[pos].type === ',') pos += 1; // consume ','
    }
    pos += 1; // consume '}'
  }

  function parseArray(path) {
    pos += 1; // consume '['
    let index = 0;
    while (tokens[pos] && tokens[pos].type !== ']') {
      parseValue(`${path}[${index}]`);
      index += 1;
      if (tokens[pos] && tokens[pos].type === ',') pos += 1; // consume ','
    }
    pos += 1; // consume ']'
  }

  parseValue('');
  return duplicates;
}

test('lang/en.json has no duplicate sibling keys', () => {
  const raw = readFileSync(join(ROOT, 'lang', 'en.json'), 'utf8');

  // Sanity-check the tokenizer against JSON.parse: the raw walk and the parsed
  // object must agree the file is structurally valid JSON.
  assert.doesNotThrow(() => JSON.parse(raw), 'lang/en.json must be valid JSON');

  const duplicates = findDuplicateKeys(tokenize(raw)).sort();
  assert.deepEqual(duplicates, [], `duplicate sibling keys in lang/en.json: ${duplicates.join(', ')}`);
});
