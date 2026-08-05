/**
 * Container states that prove no container process can hold the bound data.
 */
const INACTIVE_CONTAINER_STATUSES = new Set(['created', 'dead', 'exited']);

/**
 * Stop an active or ambiguous cached container and prove it is inactive before
 * replacing its bound data.
 *
 * The stop collaborator is deliberately synchronous: a successful return is
 * followed by a fresh inspection before destructive setup can begin.
 *
 * @param {object} collaborators
 * @param {{ inspectStatus: () => string | null, stop: (status: string) => void }} collaborators.cachedContainer
 * @param {() => void | Promise<void>} collaborators.replaceBoundData
 * @returns {Promise<string | null>} The reusable container's post-preparation status.
 */
export async function prepareFoundryData({ cachedContainer, replaceBoundData }) {
  const initialStatus = cachedContainer.inspectStatus();

  if (initialStatus === null) {
    await replaceBoundData();
    return null;
  }

  if (!INACTIVE_CONTAINER_STATUSES.has(initialStatus)) {
    cachedContainer.stop(initialStatus);
  }

  const verifiedStatus = cachedContainer.inspectStatus();
  if (verifiedStatus !== null && !INACTIVE_CONTAINER_STATUSES.has(verifiedStatus)) {
    throw new Error(
      `Foundry container remained in unsafe state "${verifiedStatus}" after recovery; refusing to replace bound data.`
    );
  }

  await replaceBoundData();
  return verifiedStatus;
}

/**
 * Start the container selected by data preparation and later cache checks.
 *
 * @param {object} collaborators
 * @param {string | null} collaborators.cachedContainerStatus
 * @param {{ restart: (status: string) => void }} collaborators.cachedContainer
 * @param {() => void} collaborators.createContainer
 * @returns {void}
 */
export function startPreparedFoundryContainer({
  cachedContainerStatus,
  cachedContainer,
  createContainer,
}) {
  if (cachedContainerStatus) {
    cachedContainer.restart(cachedContainerStatus);
    return;
  }

  createContainer();
}
