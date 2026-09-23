/** Container states that prove no container process can hold the bound data. */
const INACTIVE_CONTAINER_STATUSES = new Set(['created', 'dead', 'exited']);

/**
 * Stop an active or ambiguous cached container and prove it is inactive before replacing its bound
 * data.
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

/** Start the container selected by data preparation and later cache checks. */
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
