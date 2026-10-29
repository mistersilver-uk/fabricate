/**
 * The gathering environment list's error form, mounted (issues 2548, 2626): `ListState` replaces
 * the list body under the kept filter bar, and the `{shown} of {total}` chip, which would read a
 * false 0 of 0, is omitted. The list has no loading form: its settings read is synchronous.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, unmount } from 'svelte';

import {
  disposeManagerSuite,
  labCaseSelector,
  managerComponent,
} from './manager-mounted-shared.js';

const VIEW = 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte';
const FAILURE = '"fabricate.gatheringEnvironments" is not a registered game setting';

let View;
let mounted;
let target;

/** The view on its environments tab with no environments, plus `props`. */
function mountView(props = {}) {
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = mount(View, {
    target,
    props: { activeGatheringTab: 'environments', selectedSystemId: 'alchemy', ...props },
  });
  flushSync();
  return target;
}

const countChip = () =>
  target.querySelector(':scope .manager-environments-toolbar > .manager-chip');

describe('the environment list draws its load states through ListState (issue 2548)', () => {
  before(async () => {
    View = await managerComponent(VIEW);
  });

  afterEach(async () => {
    if (mounted) unmount(mounted);
    mounted = null;
    target?.remove();
    target = null;
    await new Promise((settled) => setImmediate(settled));
  });

  after(disposeManagerSuite);

  it('a ready empty list draws its empty panel and the count chip', () => {
    mountView();
    assert.ok(Boolean(target.querySelector(':scope .manager-table-scroll > .manager-empty')));
    assert.equal(countChip()?.textContent.trim(), '0 of 0');
    assert.ok(!target.querySelector(labCaseSelector('manager-environments-load-error')));
  });

  it('a failed load draws a polite danger notice and no empty claim under the filter bar', () => {
    mountView({ environmentsError: FAILURE });

    const notice = target.querySelector(':scope .manager-table-scroll > [data-environments-error]');
    assert.ok(Boolean(notice), 'the notice carries the hook, in the list body');
    assert.equal(notice.getAttribute('role'), 'status');
    assert.equal(notice.getAttribute('aria-live'), 'polite');
    assert.equal(notice.getAttribute('data-notice-tone'), 'danger');
    assert.equal(
      notice.querySelector('.fab-notice-title')?.textContent,
      'Could Not Load Environments'
    );
    assert.equal(
      notice.querySelector('.fab-notice-detail')?.textContent,
      `${FAILURE}\nClose and reopen this window to try again.`,
      'the raw error, then the next step on its own line'
    );
    assert.equal(target.querySelectorAll('.manager-empty').length, 0, 'no empty-state claim');
    assert.ok(
      Boolean(target.querySelector('.manager-environments-toolbar')),
      'the filter bar stays'
    );
    assert.ok(!countChip(), 'no count chip');
    assert.ok(Boolean(target.querySelector(labCaseSelector('manager-environments-load-error'))));
  });

  it('draws no busy region: the settings read is synchronous, so the list has no loading form', () => {
    // `environmentsLoading` is a deliberately stale prop: the view no longer reads it.
    mountView({ environmentsLoading: true, environmentsError: FAILURE });
    assert.ok(!target.querySelector('[aria-busy]'), 'no busy region');
    assert.ok(
      Boolean(target.querySelector('[data-environments-error]')),
      'the failure still draws'
    );
  });
});
