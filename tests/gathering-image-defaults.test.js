/**
 * Source-of-truth coverage for the shared gathering default-image constants.
 *
 * `src/gatheringImageDefaults.js` is a layering-safe, import-free module so both
 * `src/systems/` and `src/ui/` can consume it. This test pins the three constant
 * VALUES and asserts that the entity default-image fallback sites import the
 * shared constants rather than re-declaring the literal — there must be a single
 * source of truth so GM and player surfaces never diverge.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_GATHERING_ENVIRONMENT_IMG,
  DEFAULT_GATHERING_EVENT_IMG,
  DEFAULT_GATHERING_TASK_IMG
} from '../src/gatheringImageDefaults.js';
import { DEFAULT_GATHERING_TASK_IMG as REEXPORTED_TASK_IMG } from '../src/ui/gatheringTaskDefaults.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
function read(relPath) {
  return readFileSync(resolve(__dirname, '..', relPath), 'utf8');
}

describe('gatheringImageDefaults constant values', () => {
  it('holds the canonical environment, task, and event default images', () => {
    assert.equal(
      DEFAULT_GATHERING_ENVIRONMENT_IMG,
      'icons/environment/wilderness/terrain-forest-gray.webp'
    );
    assert.equal(
      DEFAULT_GATHERING_TASK_IMG,
      'icons/containers/bags/pouch-leather-brown-green.webp'
    );
    assert.equal(
      DEFAULT_GATHERING_EVENT_IMG,
      'icons/magic/time/day-night-sunset-sunrise.webp'
    );
  });

  it('exposes the task default through the ui re-export (one source of truth)', () => {
    assert.equal(REEXPORTED_TASK_IMG, DEFAULT_GATHERING_TASK_IMG);
  });

  it('has no imports so it stays layering-safe for systems and ui consumers', () => {
    const source = read('src/gatheringImageDefaults.js');
    assert.equal(/(^|\n)[ \t]*import\b/.test(source), false, 'module must not import anything');
  });

  it('re-exports the task constant from gatheringTaskDefaults without re-declaring it', () => {
    const source = read('src/ui/gatheringTaskDefaults.js');
    assert.ok(
      source.includes("export { DEFAULT_GATHERING_TASK_IMG } from '../gatheringImageDefaults.js'"),
      'gatheringTaskDefaults should re-export from the shared module'
    );
    assert.equal(
      source.includes("'icons/svg/item-bag.svg'"),
      false,
      'gatheringTaskDefaults must not re-declare the old task literal'
    );
  });
});

describe('gathering default-image fallback sites use the shared constants', () => {
  // Each consumer must import the matching shared constant and must not embed the
  // old hardcoded literal at the entity default-image fallback. Component / drop /
  // tool / realm / actor images keep their own non-gathering defaults and are not
  // listed here.
  const environmentConsumers = [
    'src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte',
    'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
    'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    'src/ui/svelte/apps/gathering/EnvironmentCard.svelte'
  ];
  const taskConsumers = [
    'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
    'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte',
    'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    'src/ui/svelte/apps/gathering/GatheringTaskRow.svelte',
    'src/ui/svelte/apps/gathering/GatheringTaskDetail.svelte'
  ];
  const eventConsumers = [
    'src/ui/svelte/apps/manager/GatheringEventEditView.svelte',
    'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte',
    'src/ui/svelte/apps/gathering/GatheringEventRow.svelte',
    'src/ui/svelte/apps/gathering/GatheringEventDetail.svelte',
    'src/systems/GatheringEngine.js',
    'src/systems/GatheringChatCard.js'
  ];

  for (const relPath of environmentConsumers) {
    it(`${relPath} imports DEFAULT_GATHERING_ENVIRONMENT_IMG`, () => {
      const source = read(relPath);
      assert.ok(source.includes('DEFAULT_GATHERING_ENVIRONMENT_IMG'), 'imports the constant');
      assert.equal(source.includes("'icons/svg/direction.svg'"), false, 'no direction-SVG env literal');
    });
  }

  for (const relPath of taskConsumers) {
    it(`${relPath} uses DEFAULT_GATHERING_TASK_IMG for the task default`, () => {
      const source = read(relPath);
      assert.ok(source.includes('DEFAULT_GATHERING_TASK_IMG'), 'imports the constant');
    });
  }

  for (const relPath of eventConsumers) {
    it(`${relPath} uses DEFAULT_GATHERING_EVENT_IMG for the event default`, () => {
      const source = read(relPath);
      assert.ok(source.includes('DEFAULT_GATHERING_EVENT_IMG'), 'imports the constant');
    });
  }

  it('the player environment card falls back to the shared default, not the door-closed SVG', () => {
    const source = read('src/ui/svelte/apps/gathering/EnvironmentCard.svelte');
    assert.ok(source.includes('DEFAULT_GATHERING_ENVIRONMENT_IMG'), 'uses the shared env default');
    assert.equal(source.includes("'icons/svg/door-closed.svg'"), false, 'door-closed literal removed');
  });

  it('the gathering player event row/detail no longer embed the mystery-man literal', () => {
    for (const relPath of [
      'src/ui/svelte/apps/gathering/GatheringEventRow.svelte',
      'src/ui/svelte/apps/gathering/GatheringEventDetail.svelte'
    ]) {
      const source = read(relPath);
      assert.equal(source.includes("'icons/svg/mystery-man.svg'"), false, `${relPath} mystery-man literal removed`);
    }
  });
});
