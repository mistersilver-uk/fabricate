/**
 * Stop a running cached container before replacing its bound data.
 *
 * The stop collaborator is deliberately synchronous: a successful return is
 * the boundary that makes destructive setup safe to begin.
 *
 * @param {object} collaborators
 * @param {{ inspectStatus: () => string | null, stop: () => void }} collaborators.cachedContainer
 * @param {() => void | Promise<void>} collaborators.replaceBoundData
 * @returns {Promise<string | null>} The reusable container's post-preparation status.
 */
export async function prepareFoundryData({
  cachedContainer,
  replaceBoundData,
}) {
  const cachedContainerStatus = cachedContainer.inspectStatus();

  if (cachedContainerStatus === 'running') {
    cachedContainer.stop();
  }

  await replaceBoundData();
  return cachedContainerStatus === 'running' ? 'stopped' : cachedContainerStatus;
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
