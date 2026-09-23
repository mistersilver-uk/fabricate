/** MIGRATION TOASTS STAY CONCISE AND THEIR DETAIL GOES TO THE CONSOLE (issue 1737). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  composeMigrationNotice,
  finishMigrationNotice,
  inlineMigrationNoticeCopy,
  logMigrationNoticeDetail,
  MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE,
} from '../src/migration/migrationNoticeDetail.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LANG = JSON.parse(readFileSync(resolve(HERE, '..', 'lang', 'en.json'), 'utf8'));
const TOAST_CEILING = 160;

/** Resolve a dotted `FABRICATE.*` key against `lang/en.json`. */
function langString(key) {
  return key.split('.').reduce((node, segment) => node?.[segment], LANG);
}

/** `game.i18n.format` over `lang/en.json`, so a composition reads the shipped strings. */
function localizeLang(key, data) {
  const template = langString(key);
  if (typeof template !== 'string') return undefined;
  return Object.entries(data ?? {}).reduce(
    (text, [token, value]) => text.replaceAll(`{${token}}`, String(value)),
    template
  );
}

/** Every string leaf under `FABRICATE.Migration`, as `[relative path, value]`. */
function migrationLeaves(node = LANG.FABRICATE.Migration, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[path, value]] : migrationLeaves(value, path);
  });
}

/** Leaves that are not toast copy. */
function isToastLeaf(path) {
  return !path.startsWith('Recovery.') && !path.endsWith('Detail') && !path.startsWith('WorldScopeEntities.IdentityDrift');
}

test(`every migration toast string is at most ${TOAST_CEILING} characters before interpolation`, () => {
  const toasts = migrationLeaves().filter(([path]) => isToastLeaf(path));
  assert.ok(toasts.length >= 25, `the premise: the walk found the toast strings (${toasts.length})`);
  const over = toasts.filter(([, value]) => value.length > TOAST_CEILING);
  assert.deepEqual(
    over.map(([path, value]) => `${path} (${value.length})`),
    [],
    'move the explanation into a `…Detail` sibling key that the console carries'
  );
});

test('the ceiling can fail: the exempt detail strings are longer than it', () => {
  const details = migrationLeaves().filter(([path]) => path.endsWith('Detail'));
  assert.ok(
    details.some(([, value]) => value.length > TOAST_CEILING),
    'a walk that never meets a long string proves nothing about the ceiling'
  );
});

test('the pointer is appended ONCE, and only when the detail says more than the toast', () => {
  const pointer = LANG.FABRICATE.Migration.ConsoleDetails;
  const withDetail = finishMigrationNotice(['Short.', 'Two.'], ['Long one.', 'Long two.'], localizeLang);
  assert.equal(withDetail.message, `Short. Two. ${pointer}`);
  assert.equal(withDetail.detail, 'Long one.\nLong two.');

  const repeated = finishMigrationNotice(['Same.', 'Too.'], ['Same.', 'Too.'], localizeLang);
  assert.deepEqual(repeated, { message: 'Same. Too.', detail: '' }, 'no pointer to a repeat');
  assert.deepEqual(finishMigrationNotice(['Only.'], [], localizeLang), { message: 'Only.', detail: '' });
  assert.deepEqual(finishMigrationNotice([], ['Orphan detail.'], localizeLang), { message: '', detail: '' });
  assert.match(
    finishMigrationNotice(['A.'], ['B.'], () => undefined).message,
    /A\. Details are in the console \(F12\)\.$/,
    'the pointer falls back to English when the key does not resolve'
  );
});

test('each inline main.js notice fallback is its lang/en.json string verbatim', () => {
  const copies = Object.entries(inlineMigrationNoticeCopy());
  assert.equal(copies.length, 7, 'the premise: the table holds every inline notice');
  for (const [key, copy] of copies) {
    assert.equal(copy.fallback, langString(key), `${key} fallback`);
    if (copy.detailKey) {
      assert.equal(copy.detailFallback, langString(copy.detailKey), `${copy.detailKey} fallback`);
    }
  }
});

test('an inline notice composes the same toast and detail with or without the string table', () => {
  const data = { count: 2, systems: 'Alchemy', recipes: 'Brew, Tonic', entries: 'rank' };
  for (const key of Object.keys(inlineMigrationNoticeCopy())) {
    assert.deepEqual(
      composeMigrationNotice(key, data, () => undefined),
      composeMigrationNotice(key, data, localizeLang),
      key
    );
  }
  const aborted = composeMigrationNotice('FABRICATE.Migration.Aborted.Notice', undefined, localizeLang);
  assert.equal(aborted.detail, '', 'the runner already logs the recovery guidance');
  assert.doesNotMatch(aborted.message, /Details are in the console/, 'so no second pointer');
  assert.deepEqual(composeMigrationNotice('FABRICATE.Migration.Nope', {}, localizeLang), {
    message: '',
    detail: '',
  });
});

test('the collision toast counts the disabled recipes and the detail names them', () => {
  const notice = composeMigrationNotice(
    'FABRICATE.Migration.EssenceGroups.CollisionNotice',
    { count: 2, recipes: 'Brew, Tonic' },
    localizeLang
  );
  assert.match(notice.message, /disabled 2 alchemy recipe\(s\)/);
  assert.doesNotMatch(notice.message, /Brew/, 'the uncapped list stays out of the toast');
  assert.match(notice.detail, /Brew, Tonic/);
});

test('the detail is written once, at console.info, and nothing is written without one', (t) => {
  const info = t.mock.method(console, 'info', () => {});
  logMigrationNoticeDetail('1.34.0 equivalent essence merge', '');
  assert.equal(info.mock.callCount(), 0);
  logMigrationNoticeDetail('1.34.0 equivalent essence merge', 'the detail');
  assert.equal(info.mock.callCount(), 1);
  assert.deepEqual(info.mock.calls[0].arguments, [
    MIGRATION_NOTICE_DETAIL_CONSOLE_MESSAGE,
    '1.34.0 equivalent essence merge\nthe detail',
  ]);
});
