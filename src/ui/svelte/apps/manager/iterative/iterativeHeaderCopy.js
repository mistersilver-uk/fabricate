/**
 * What the page header says on the three iterative library routes: its title, its lede and the
 * name of its action group. `null` for any other route, so the header model asks this first.
 * Every key is a literal, because `lang-keys-no-orphans` cannot see a built one.
 */
import { interpolate } from '../checks/checksCopy.js';

/** The Crafting Action editor's lede, in the wording for how many effects and whether it rolls. */
function editorLede(text, system, heading) {
  const count = heading?.effectCount ?? 0;
  const one = count === 1;
  let sentence;
  if (heading?.rollsCheck) {
    sentence = one
      ? text(
          'FABRICATE.Admin.Manager.Iterative.ActionSubtitleRollsOne',
          'Action in {system} · rolls the crafting check · 1 effect'
        )
      : text(
          'FABRICATE.Admin.Manager.Iterative.ActionSubtitleRolls',
          'Action in {system} · rolls the crafting check · {count} effects'
        );
  } else {
    sentence = one
      ? text(
          'FABRICATE.Admin.Manager.Iterative.ActionSubtitleNoCheckOne',
          'Action in {system} · no check · 1 effect'
        )
      : text(
          'FABRICATE.Admin.Manager.Iterative.ActionSubtitleNoCheck',
          'Action in {system} · no check · {count} effects'
        );
  }
  return interpolate(sentence, { system, count });
}

/** @returns {{ title: string, subtitle: string, actionsLabel: string } | null} */
export function iterativeHeaderCopy({ currentView, selectedSystem, text, iterativeRoute }) {
  const system = selectedSystem?.name || '';
  const actionsLabel = () =>
    text('FABRICATE.Admin.Manager.Iterative.HeaderActions', 'Counter and action actions');
  if (currentView === 'iterative-counters') {
    return {
      title: text('FABRICATE.Admin.Manager.Iterative.CountersTitle', 'Counters'),
      subtitle: interpolate(
        text(
          'FABRICATE.Admin.Manager.Iterative.CountersSubtitle',
          'The numbers every {system} workpiece can track. Recipes choose which ones they use.'
        ),
        { system }
      ),
      actionsLabel: actionsLabel(),
    };
  }
  if (currentView === 'iterative-actions') {
    return {
      title: text('FABRICATE.Admin.Manager.Iterative.ActionsTitle', 'Actions'),
      subtitle: interpolate(
        text(
          'FABRICATE.Admin.Manager.Iterative.ActionsSubtitle',
          'The choices players make at the workbench. Every action is offered in every {system} session, subject to its prerequisites.'
        ),
        { system }
      ),
      actionsLabel: actionsLabel(),
    };
  }
  if (currentView !== 'iterative-action-edit') return null;
  return {
    title: text('FABRICATE.Admin.Manager.Iterative.ActionEditTitle', 'Edit action'),
    subtitle: editorLede(text, system, iterativeRoute?.actionHeading),
    actionsLabel: actionsLabel(),
  };
}

/** The identity heading the page header draws on the Crafting Action editor once it holds an action, else `null`. */
export function iterativeHeadingVariant({ currentView, iterativeRoute }) {
  return currentView === 'iterative-action-edit' && iterativeRoute?.actionHeading
    ? 'iterative-action-edit'
    : null;
}
