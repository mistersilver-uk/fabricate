/**
 * The Journal's synchronous read of a live gathering run's Tool readiness: execute's
 * `matchGatheringTools` presence match under the viewer's station. Tool prerequisite gates stay with
 * the command.
 */
import { matchGatheringTools } from '../gatheringToolRuntime.js';

/** True when execute would refuse the run for a Tool neither held nor supplied; false on any doubt. */
export function gatheringRunToolsMissing({
  engine,
  craftingSystemManager,
  actor,
  run,
  presentTools = null,
} = {}) {
  try {
    const resolved = engine?._resolveWaitingRunContext?.({ actor, run });
    if (!resolved || resolved.missingReference) return false;
    const resolvedTools = engine._resolveTaskTools(resolved);
    // Execute clears a run with a stale or disabled Tool reference instead of refusing it.
    if (engine._hasBlockedToolReferences(resolvedTools)) return false;
    const { tools } = resolvedTools;
    if (tools.length === 0) return false;
    const { system, task } = resolved;
    return (
      matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools })
        .missing.length > 0
    );
  } catch {
    return false;
  }
}
