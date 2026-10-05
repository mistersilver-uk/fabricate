/** Whether a result is a choice group: `alternatives` present, whatever its length (issue 1773). */
export const isChoiceGroup = (result) => Array.isArray(result?.alternatives);
