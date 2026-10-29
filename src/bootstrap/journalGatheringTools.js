/**
 * The Journal's read of a live gathering run's Tool readiness (issue 2745): the same
 * `matchGatheringTools` presence match execute's availability check starts from, over the tools the
 * run's execute resolves, with the viewer's station standing in for a held copy. Tool prerequisite
 * gates are asynchronous and stay with the command.
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
    const { tools } = engine._resolveTaskTools(resolved);
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
