/** The roll prompt's closure, shared by every suite that mounts it through the real host. */
import { FOUNDRY_BRIDGE_RAW_MODULES } from './foundryBridgeModules.js';
import { CHECK_TARGET_RAW_MODULES } from './svelte-component-harness.js';

export const ROLL_PROMPT_PATH = 'src/ui/svelte/apps/crafting/RollPrompt.svelte';

export const ROLL_PROMPT_RAW_MODULES = Object.freeze([
  ...FOUNDRY_BRIDGE_RAW_MODULES,
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/util/listboxNavigation.js',
  'src/ui/svelte/util/overlayBounds.js',
  'src/ui/svelte/util/overlayHost.js',
  'src/ui/svelte/util/pickerOptionModel.js',
  'src/ui/svelte/apps/crafting/rollPromptTarget.js',
  // The footer note measures its own clipping (issue 2007).
  'src/ui/svelte/apps/crafting/noteOverflow.js',
  // The count line settles through the router and the pool's own floor (issue 2006).
  'src/systems/checkModifierRouter.js',
  'src/systems/countEvaluation.js',
  // The additional-dice control reads its reach through the prompt-safe leaf (issue 2008).
  'src/ui/presenters/additionalDicePrompt.js',
  'src/systems/additionalDiceReach.js',
  'src/systems/countTriggerReach.js',
  ...CHECK_TARGET_RAW_MODULES,
  'src/utils/fillPlaceholders.js',
  'src/ui/svelte/apps/manager/checks/checkAdjustmentLabel.js',
  'src/utils/checkAdjustmentFormat.js',
  'src/utils/scalars.js',
]);

export const ROLL_PROMPT_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Field.svelte',
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/EmptyState.svelte',
  'src/ui/svelte/components/Notice.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  // The roll mode is the shared `Select`, which renders the popover pair behind it.
  'src/ui/svelte/components/SearchablePopover.svelte',
  'src/ui/svelte/components/SearchablePopoverPanel.svelte',
  'src/ui/svelte/components/Select.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/ManagerModal.svelte',
  'src/ui/svelte/apps/crafting/RollPromptTarget.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/Well.svelte',
  'src/ui/svelte/apps/crafting/RollPromptAdditionalDice.svelte',
  'src/ui/svelte/apps/crafting/RollPromptFooter.svelte',
  ROLL_PROMPT_PATH,
]);
