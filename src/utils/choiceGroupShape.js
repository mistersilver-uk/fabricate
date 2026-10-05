/** Whether a result is a choice group: `alternatives` present, whatever its length (issue 1773). */
export const isChoiceGroup = (result) => Array.isArray(result?.alternatives);

/** What one result entry can award: a choice group's alternatives, else the entry itself. */
export const awardedResults = (result) => (isChoiceGroup(result) ? result.alternatives : [result]);
