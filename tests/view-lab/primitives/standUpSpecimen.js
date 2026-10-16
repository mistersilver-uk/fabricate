/**
 * One specimen's whole mount-and-act step (issue 2339): mount the row through `LiveSpecimen`, and,
 * for a fixture that exports `act`, run it in the parent's act turn under a time limit and refuse
 * to report a state its `reached` denies. Every failure throws, naming the fixture, into the
 * specimen's existing error path.
 */
import { flushSync, mount } from 'svelte';

import LiveSpecimen from './LiveSpecimen.svelte';
import { readSpecimenSnippets } from './specimenSnippets.js';

/** How long an `act` may run before the specimen fails instead of hanging the page. */
export const ACT_LIMIT_MS = 5000;

/** The turn a lone specimen takes when no parent page grants one. */
const ACT_NOW = async () => () => {};

/** Settle as `work` does, or reject naming the fixture once `limitMs` passes. */
function withinLimit(work, limitMs, name) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`fixture ${name}: its act did not settle within ${limitMs}ms`)),
      limitMs
    );
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** Run the fixture's act in a granted turn, ending the turn whether it settles or fails. */
async function runAct(fixture, root, row, { requestActTurn, actLimitMs }) {
  flushSync();
  const release = await requestActTurn();
  const acting = Promise.resolve()
    .then(() => fixture.act(root, row.data ?? {}))
    .catch((error) => {
      throw new Error(`fixture ${row.fixture}: its act threw: ${error?.message ?? error}`, {
        cause: error,
      });
    });
  try {
    await withinLimit(acting, actLimitMs, row.fixture);
  } finally {
    release();
  }
  if (!fixture.reached(root)) {
    throw new Error(`fixture ${row.fixture}: its act ran and \`reached\` does not hold`);
  }
}

/**
 * @param {object} stage
 * @param {Element} stage.target The specimen root `LiveSpecimen` mounts into.
 * @param {object} stage.row The catalogue row.
 * @param {unknown} stage.component The row's component.
 * @param {{default: unknown, act?: Function, reached?: Function}|null} [stage.fixture] The fixture
 *   module `loadFixture` resolved, or null for a plain row.
 * @param {() => Promise<() => void>} [stage.requestActTurn] Resolves with the turn's release.
 * @param {number} [stage.actLimitMs]
 * @returns {Promise<void>} Settles once the specimen stands in its drawn state.
 */
export async function standUpSpecimen({
  target,
  row,
  component,
  fixture = null,
  requestActTurn = ACT_NOW,
  actLimitMs = ACT_LIMIT_MS,
}) {
  if (fixture?.act && typeof fixture.reached !== 'function') {
    throw new Error(`fixture ${row.fixture}: it exports \`act\` and no \`reached\``);
  }
  mount(LiveSpecimen, {
    target,
    props: {
      path: row.path,
      component,
      props: row.props ?? {},
      content: row.content ?? null,
      snippets: readSpecimenSnippets(row),
      fixture: fixture?.default ?? null,
      data: row.data ?? {},
    },
  });
  if (!fixture) return;
  if (fixture.act) await runAct(fixture, target, row, { requestActTurn, actLimitMs });
  if (!target.querySelector('.pl-specimen')?.firstElementChild) {
    throw new Error(`fixture ${row.fixture}: it rendered nothing into the specimen`);
  }
}
