/**
 * Cancel a legacy run on `engine` as the active-GM executor does for an admitted command, at
 * revision 0; `command` adds fields to the executor's call.
 */
export async function cancelAsAuthority(engine, actor, runId, command = {}) {
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: `cancel-${runId}` }),
  });
  return engine.cancelVersionedRun({
    actor,
    runId,
    expectedRevision: 0,
    executionGrant: 'grant',
    requestId: `cancel-${runId}`,
    ...command,
  });
}
