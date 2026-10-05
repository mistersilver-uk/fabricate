/**
 * The Results tab's notice titles (issue 1522), shared by the notices and the tab strip's marks so
 * each mark is named by the notice it stands for. `text(key, fallback)` is the editor's localizer.
 */
export function resultNoticeCopy(text) {
  return {
    validation: (count) =>
      count === 1
        ? text(
            'FABRICATE.Admin.Manager.Environment.Tasks.Results.ValidationBlocksSaveOne',
            '1 result issue blocks save'
          )
        : text(
            'FABRICATE.Admin.Manager.Environment.Tasks.Results.ValidationBlocksSave',
            '{count} result issues block save'
          ).replace('{count}', String(count)),
    noRoutedTiers: () =>
      text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Results.NoRoutedTiers',
        'Define outcome tiers in the gathering check before routing result sets.'
      ),
    rewardRule: () =>
      text(
        'FABRICATE.Admin.Manager.Environment.Tasks.RewardRuleNotice',
        'Multiple drop rows use this component. Current drop rules may award only one matching row.'
      ),
  };
}
