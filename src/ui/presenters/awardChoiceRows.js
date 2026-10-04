/**
 * The award face's rows (issue 1773): an owed choice as one `award` slot of `RequirementChooser`,
 * its alternatives as tiles with caller-formatted pips, an unclaimable one disabled with its reason
 * and, under up to N, every unpicked tile disabled once the ceiling is picked.
 */
import { RESULT_KIND_GLYPHS } from './resultKindGlyphs.js';

/** Whole literal keys, so the lang-key guard sees every reason a tile can state. */
const UNCLAIMABLE_KEYS = Object.freeze({
  alreadyKnown: 'FABRICATE.App.Journal.AwardChoice.Unclaimable.alreadyKnown',
  recipeMissing: 'FABRICATE.App.Journal.AwardChoice.Unclaimable.recipeMissing',
  knowledgeNotObservable: 'FABRICATE.App.Journal.AwardChoice.Unclaimable.knowledgeNotObservable',
  componentMissing: 'FABRICATE.App.Journal.AwardChoice.Unclaimable.componentMissing',
  currencyDisabled: 'FABRICATE.App.Journal.AwardChoice.Unclaimable.currencyDisabled',
  unitMissing: 'FABRICATE.App.Journal.AwardChoice.Unclaimable.unitMissing',
});
const UNCLAIMABLE_OTHER = 'FABRICATE.App.Journal.AwardChoice.Unclaimable.other';

const list = (value) => (Array.isArray(value) ? value : []);
const key = (name) => `FABRICATE.App.Journal.AwardChoice.${name}`;

/** The sentence an unclaimable alternative's tile states, for any blocker the settle can name. */
export const unclaimableText = (reason, localize) =>
  localize(UNCLAIMABLE_KEYS[reason] ?? UNCLAIMABLE_OTHER);

/** A tile's pip: a component's amount or its expression, a credit's amount, a recipe none. */
export function awardPip(alternative) {
  if (alternative?.kind === 'knowledge') return '';
  if (alternative?.kind === 'currency') return String(alternative.amountText ?? '');
  return alternative?.quantityFormula || `×${alternative?.quantity ?? 1}`;
}

/** The ids of the alternatives a player may pick now. */
export const claimableIds = (choice) =>
  list(choice?.alternatives)
    .filter((alternative) => !alternative.unclaimable)
    .map((alternative) => alternative.id);

/**
 * `picks` after pressing `alternativeId`: under any one of the press moves the pick; under up to
 * N it toggles, and a press past the ceiling or on an unclaimable tile changes nothing.
 */
export function nextAwardPicks(choice, picks, alternativeId) {
  if (!claimableIds(choice).includes(alternativeId)) return picks;
  if (choice.awardStrategy === 'anyOne') return [alternativeId];
  if (picks.includes(alternativeId)) return picks.filter((id) => id !== alternativeId);
  return picks.length >= choice.ceiling ? picks : [...picks, alternativeId];
}

/** The Well's kicker: one reward, or up to N with a rolled N stated as its roll. */
export function awardKicker(choice, localize) {
  if (choice.awardStrategy === 'anyOne') return localize(key('ChooseOne'));
  const { formula } = choice.countRoll ?? {};
  if (!formula) return localize(key('ChooseUpTo'), { count: choice.ceiling });
  return localize(key('ChooseUpToRolled'), {
    count: choice.ceiling,
    rolled: choice.count,
    formula,
  });
}

/** What confirming claims: the one pick by name, the count, or a settle with nothing to claim. */
export function confirmLabel(choice, picks, localize) {
  if (claimableIds(choice).length === 0) return localize(key('Forfeit'));
  if (picks.length === 0) return localize(key('ClaimNone'));
  if (picks.length > 1) return localize(key('ClaimMany'), { count: picks.length });
  const picked = list(choice.alternatives).find((alternative) => alternative.id === picks[0]);
  return localize(key('ClaimOne'), { name: picked?.name ?? '' });
}

/** Whether confirming would send a settle the command can accept. */
export function canConfirm(choice, picks) {
  return claimableIds(choice).length === 0 ? picks.length === 0 : picks.length > 0;
}

/** One owed choice as `RequirementChooser`'s `award` slot under the picks the caller holds. */
export function awardSlot(choice, picks, localize) {
  const atCeiling = choice.awardStrategy === 'upTo' && picks.length >= choice.ceiling;
  const alternatives = list(choice.alternatives).map((alternative) => {
    const pip = awardPip(alternative);
    const selected = picks.includes(alternative.id);
    return {
      id: alternative.id,
      name: alternative.name,
      label: pip
        ? localize(key('TileLabel'), { name: alternative.name, amount: pip })
        : alternative.name,
      art: alternative.img ?? '',
      icon: RESULT_KIND_GLYPHS[alternative.kind] ?? 'fas fa-box',
      pip,
      selected,
      disabled: Boolean(alternative.unclaimable) || (atCeiling && !selected),
      reading: alternative.unclaimable ? unclaimableText(alternative.unclaimable, localize) : '',
      wrapperProps: { 'data-award-alternative': alternative.id },
    };
  });
  return {
    key: `award-${choice.stepIndex}-${choice.choiceId}`,
    slotId: choice.choiceId,
    kind: 'award',
    name: awardKicker(choice, localize),
    status: atCeiling
      ? localize(key('Ceiling'), { picked: picks.length, count: choice.ceiling })
      : '',
    alternatives,
  };
}
