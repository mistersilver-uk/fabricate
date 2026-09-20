/**
 * The manager browsers' crafting-system switch contract, as one parameterised run of cases
 * (issue 1716). Six views share one sentinel over the lifted `systemId`, so the contract is
 * stated once and instantiated per view: SonarCloud's new-code duplication gate counts
 * `tests/**` and `sonar.cpd.exclusions` is inert under Automatic Analysis, so six hand-copied
 * runs are exactly the block it refuses.
 *
 * The switch is driven with `harness.setProps({ selectedSystemId })` on a live mount, never a
 * remount: a remount re-initialises every component-local `$state` to the same default the
 * switch writes, so a remount-based assertion about a local draft is vacuous by construction.
 * It is the real path too — switching the crafting system does not unmount the browser.
 *
 * The lifted object a case passes is plain, so the view reads it at first render rather than
 * tracking it; the assertions read that object, which is where every reset is written.
 *
 * @typedef {object} BrowserListStateView
 * @property {string} label the view's name, for the describe block.
 * @property {object} harness a `createMountedComponentHarness` instance.
 * @property {(args: {rowCount: number, selectedSystemId: string, browserState: object}) => object}
 *   props the full mount props for a corpus of `rowCount` rows.
 * @property {Record<string, [unknown, unknown]>} resetAxes one entry per axis the view's shipped
 *   effect resets, as `[the value a GM set, the value a switch must restore]`.
 * @property {Record<string, unknown>} preservedAxes the axes the effect deliberately does not
 *   reset. Seeded before the mount, because a page position has to be in range for the clamp
 *   effect to leave it alone.
 * @property {boolean} [clampsPage] true for a view that adopts the page window.
 * @property {{props: Function, selector: string, typed: string, why: string}} [localDraft] a
 *   component-local draft input the switch must clear, with the props that render it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SWITCHED_TO = 'sys-switched';

/** Register the crafting-system switch cases against one browser view. */
export function describeBrowserListState(view) {
  const { harness, resetAxes, preservedAxes } = view;
  const dirtyAxes = Object.entries(resetAxes).map(([axis, [dirty]]) => [axis, dirty]);
  const restoredAxes = Object.entries(resetAxes).map(([axis, [, restored]]) => [axis, restored]);

  /** A lifted state seeded with the preferences a switch must keep, plus a starting system. */
  const liftedState = (selectedSystemId, extra = {}) => ({
    systemId: selectedSystemId,
    ...preservedAxes,
    ...extra,
  });

  /** Mount at `sys-first` with the lifted object already naming it, so no switch fires yet. */
  async function mountSettled({ rowCount = 4, browserState, props = view.props } = {}) {
    return harness.mount(
      props({ rowCount, selectedSystemId: 'sys-first', browserState })
    );
  }

  const axisValues = (browserState, axes) => axes.map(([axis]) => [axis, browserState[axis]]);

  describe(`${view.label} crafting-system switch (issue 1716)`, () => {
    it('resets the axes the new system does not share, and moves the sentinel', async () => {
      const browserState = liftedState('sys-first');
      await mountSettled({ browserState });
      for (const [axis, dirty] of dirtyAxes) browserState[axis] = dirty;

      await harness.setProps({ selectedSystemId: SWITCHED_TO });

      assert.deepEqual(
        axisValues(browserState, restoredAxes),
        restoredAxes,
        'every axis the shipped effect resets is back at its default'
      );
      assert.equal(browserState.systemId, SWITCHED_TO, 'and the sentinel names the new system');
    });

    it('keeps the axes it treats as preferences across that switch', async () => {
      const browserState = liftedState('sys-first');
      await mountSettled({ browserState });

      await harness.setProps({ selectedSystemId: SWITCHED_TO });

      assert.deepEqual(
        Object.fromEntries(Object.keys(preservedAxes).map((axis) => [axis, browserState[axis]])),
        preservedAxes,
        'a factory that reset every axis it could see would silently widen this effect'
      );
    });

    it('does not read an editor round-trip at the same system as a switch', async () => {
      // Issue 806's shape: the sentinel is persisted on the lifted state precisely so returning
      // from an editor, which remounts the view, is not mistaken for a system switch.
      const browserState = liftedState('sys-first');
      await mountSettled({ browserState });
      const [axis, dirty] = dirtyAxes[0];
      browserState[axis] = dirty;

      harness.remount();
      await mountSettled({ browserState });

      assert.equal(
        browserState[axis],
        dirty,
        'a sentinel the effect never wrote would make every remount look like a switch'
      );
    });

    if (view.clampsPage) {
      it('drops to the first page when the corpus narrows under it', async () => {
        const browserState = liftedState('sys-first', { pageIndex: 1, pageSize: 2 });
        await mountSettled({ rowCount: 4, browserState });
        assert.equal(browserState.pageIndex, 1, 'the control: that page still holds rows');

        await harness.setProps(
          view.props({ rowCount: 1, selectedSystemId: 'sys-first', browserState })
        );

        assert.equal(browserState.pageIndex, 0, 'the page the GM was reading no longer exists');
      });
    }

    if (view.localDraft) {
      it('clears the component-local draft the switch invalidates', async () => {
        const { selector, typed, why } = view.localDraft;
        const browserState = liftedState('sys-first');
        const root = await mountSettled({ browserState, props: view.localDraft.props });

        const input = root.querySelector(selector);
        assert.ok(Boolean(input), 'the control: the draft input renders');
        input.value = typed;
        input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
        assert.equal(root.querySelector(selector).value, typed, 'and it holds what was typed');

        await harness.setProps({ selectedSystemId: SWITCHED_TO });

        assert.equal(root.querySelector(selector).value, '', why);
      });
    }
  });
}
