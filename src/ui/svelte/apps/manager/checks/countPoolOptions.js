/** The fixed choice lists the success-counting pool fields offer, each option a key and fallback. */

const option = (value, labelKey, fallback) => Object.freeze({ value, labelKey, fallback });

const UNDER_TESTS = Object.freeze([
  option('meet', 'FABRICATE.Admin.Manager.Checks.Count.TestUnderMeet', 'At or under'),
  option('exceed', 'FABRICATE.Admin.Manager.Checks.Count.TestUnderExceed', 'Under'),
]);
const OVER_TESTS = Object.freeze([
  option('meet', 'FABRICATE.Admin.Manager.Checks.Count.TestOverMeet', 'At or above'),
  option('exceed', 'FABRICATE.Admin.Manager.Checks.Count.TestOverExceed', 'Above'),
]);

/** The per-die test choices, worded for the pool's direction. */
export function countTestOptions(under) {
  return under ? UNDER_TESTS : OVER_TESTS;
}

/** Where a +N lands on a counting roll. */
export const COUNT_DESTINATION_OPTIONS = Object.freeze([
  option(
    'threshold',
    'FABRICATE.Admin.Manager.Checks.Count.DestinationThreshold',
    'Move the threshold'
  ),
  option('pool', 'FABRICATE.Admin.Manager.Checks.Count.DestinationPool', 'Add dice to the pool'),
]);

/** Whether an exploding face keeps exploding or explodes once. */
export const COUNT_REPEAT_OPTIONS = Object.freeze([
  option('keeps', 'FABRICATE.Admin.Manager.Checks.Count.RepeatKeeps', 'Keeps exploding'),
  option('once', 'FABRICATE.Admin.Manager.Checks.Count.RepeatOnce', 'Once'),
]);
