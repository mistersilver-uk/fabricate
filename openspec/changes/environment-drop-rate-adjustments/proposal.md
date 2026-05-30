# Environment Drop Rate Adjustments

## Summary
Make the Environment Editor "Override" column indicate only whether the selected environment has a drop-rate adjustment for a library task or hazard. Persist those adjustments on the environment and apply them during gathering resolution.

## Motivation
The current "Override on" pill is driven by composition state, so manual inclusion, force inclusion, and exclusion are all presented as overrides. That is too vague. GMs need the override indicator to mean that a specific drop-rate value has been changed for this environment.

## Scope
- Add environment-local drop-rate adjustment fields for library task drop rows and hazards.
- Apply adjustments at runtime without modifying reusable library records.
- Update the Environment Editor list and inspector to show `On` / `Off` for drop-rate adjustments.
- Keep existing composition state labels and actions unchanged.
