# UI Integration Delta

## MODIFIED Requirements

### Requirement: Gathering app blind-environment player labels

Blind-environment secrecy overrides the canonical player-facing task-name display contract for blind gathering only.

1. In targeted environments, the player gathering app MAY show visible task names as defined by the canonical UI spec.
2. In blind environments, the player gathering app MUST use localized generic labels instead of real task names across:
   - selection and start surfaces
   - duplicate-run blockers
   - active runs
   - history rows
   - notifications
   - terminal feedback
3. Real blind-environment task names remain GM-only in player-facing flows.
4. If the UI needs a blind generic label for an active run or history row, it SHOULD derive that label from the environment/task selection mode at render time rather than depending on extra persisted blind-summary snapshot fields.
