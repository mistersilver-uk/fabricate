/**
 * The GM Essence Studio's PRESENTATION adapter (issue 1036).
 *
 * A thin layer, and deliberately so. Everything decidable without a DOM — the offer list,
 * the validation checks, the browser pipeline, the bulk staging, the delete impact — lives
 * under `src/utils/`, because `npm run lint` and `format:check` do NOT cover
 * `src/ui/**\/*.js` while SonarCloud still indexes it. What is here is the mapping from
 * those pure results onto LABELS, ICONS and TONES, which needs the caller's localizer and
 * therefore cannot be a pure leaf.
 *
 * Every export takes `text` (and where needed `format`) as a parameter rather than
 * importing `foundryBridge`: the same functions are called from four components and from
 * unit tests, and a module that reached for a Foundry global could not be exercised by
 * either.
 */

import {
  ESSENCE_VALIDATION_CHECKS,
  essenceEditorValidation,
} from '../../../../../utils/essenceValidation.js';

/** The library toolbar's status segments, in render order. */
export const ESSENCE_STATUS_SEGMENTS = Object.freeze([
  Object.freeze({ value: 'all', labelKey: 'FABRICATE.Admin.Manager.Essence.Status.All', fallback: 'All' }),
  Object.freeze({
    value: 'enabled',
    labelKey: 'FABRICATE.Admin.Manager.Essence.Status.Enabled',
    fallback: 'Enabled',
  }),
  Object.freeze({
    value: 'disabled',
    labelKey: 'FABRICATE.Admin.Manager.Essence.Status.Disabled',
    fallback: 'Disabled',
  }),
]);

/** The list / grid presentation toggle, as `SegmentedControl` options. */
export const ESSENCE_VIEW_MODE_SEGMENTS = Object.freeze([
  Object.freeze({
    value: 'list',
    labelKey: 'FABRICATE.Admin.Manager.Essence.ViewList',
    fallback: 'List',
    icon: 'fas fa-list',
  }),
  Object.freeze({
    value: 'grid',
    labelKey: 'FABRICATE.Admin.Manager.Essence.ViewGrid',
    fallback: 'Grid',
    icon: 'fas fa-table-cells-large',
  }),
]);

/** The editor's three tabs, in render order: id, English fallback, glyph. */
export const ESSENCE_EDITOR_TABS = Object.freeze([
  Object.freeze({ id: 'identity', fallback: 'Identity', icon: 'fas fa-fingerprint' }),
  Object.freeze({ id: 'oncraft', fallback: 'On craft', icon: 'fas fa-wand-magic-sparkles' }),
  Object.freeze({ id: 'validation', fallback: 'Validation', icon: 'fas fa-clipboard-check' }),
]);

/**
 * The two CAPABILITY pills a row, a grid card and the inspector all render.
 *
 * They are never hidden for a disabled essence — hiding a pill removes state, and "this
 * essence transfers effects, but is currently suppressed" is a different fact from "this
 * essence transfers nothing". A disabled essence renders them in the MUTED tone beside the
 * Disabled badge instead.
 *
 * ## The Effects pill reports whether the source RESOLVES, not only that one is configured
 *
 * `hasEffectTransfer` is `sourceState !== 'none'` at the store — a CONFIGURED source, which
 * a `stale` or `missing` link still is. Rendered at one tone that makes a broken link
 * indistinguishable from a working one on the library row, and the row is the only place
 * most essences are ever looked at: the inspector shows one essence at a time and the
 * needs-attention filter is a search, not a signal. So a non-`linked` source keeps the pill
 * (the intention is still authored, and hiding it would remove state) and states the
 * breakage in its own tone, glyph and title — three channels, so it survives greyscale.
 *
 * @param {{hasEffectTransfer?: boolean, hasPropertyMacro?: boolean, enabled?: boolean,
 *   sourceState?: string}} essence
 * @param {{effectTransferEnabled?: boolean, propertyMacrosEnabled?: boolean}} features
 * @param {(key: string, fallback: string) => string} text
 * @returns {{id: string, icon: string, label: string, tone: string, title: string}[]}
 */
export function essenceCapabilityPills(essence, features = {}, text = (_key, fallback) => fallback) {
  const suppressed = essence?.enabled === false;
  const tone = suppressed ? 'neutral' : 'info';
  const pills = [];
  if (features.effectTransferEnabled === true && essence?.hasEffectTransfer === true) {
    const sourceBroken = essence?.sourceState !== 'linked';
    pills.push({
      id: 'effects',
      icon: sourceBroken ? 'fas fa-link-slash' : 'fas fa-wand-magic-sparkles',
      label: text('FABRICATE.Admin.Manager.Essence.Capability.Effects', 'Effects'),
      // The breakage outranks the suppression: a disabled essence with a working source is
      // a state the GM chose, and a broken link is one they have to repair either way.
      tone: sourceBroken ? 'warning' : tone,
      title: sourceBroken
        ? text(
            'FABRICATE.Admin.Manager.Essence.Capability.EffectsBroken',
            'The linked effect source no longer resolves, so no effect can transfer.'
          )
        : '',
    });
  }
  if (features.propertyMacrosEnabled === true && essence?.hasPropertyMacro === true) {
    pills.push({
      id: 'macro',
      icon: 'fas fa-code',
      label: text('FABRICATE.Admin.Manager.Essence.Capability.Macro', 'Macro'),
      tone,
      title: '',
    });
  }
  return pills;
}

/**
 * The EFFECTIVE BEHAVIOUR list — what this essence does to a crafted result.
 *
 * ONE projection, rendered by `EssenceBehaviorPreview`, which the editor's live preview and
 * `EssenceBrowserInspector`'s ON CRAFT section both render. They are the same list and
 * re-authoring it in the inspector is what one-implementation-per-meaning forbids.
 *
 * The arithmetic row is unconditional and comes FIRST, because it is the one thing a
 * disabled essence still does: its quantities match, accumulate and are consumed exactly as
 * before. The two behaviour rows state the SUPPRESSION in the same words when the essence
 * is disabled — the delta is explicit that this change does not claim the stacking outcome
 * is identical, so neither row says anything about stacking.
 *
 * @param {object} essence a projected essence card, or an editor draft.
 * @param {{effectTransferEnabled?: boolean, propertyMacrosEnabled?: boolean,
 *   sourceName?: string, macroName?: string}} context
 * @param {(key: string, fallback: string) => string} text
 * @param {(key: string, fallback: string, data: object) => string} format
 * @returns {{id: string, icon: string, title: string, subtitle: string, suppressed: boolean}[]}
 */
export function projectEssenceBehaviourFacts(
  essence,
  context = {},
  text = (_key, fallback) => fallback,
  format = (_key, fallback) => fallback
) {
  const disabled = essence?.enabled === false;
  const suppressedSub = text(
    'FABRICATE.Admin.Manager.Essence.Preview.Suppressed',
    'This essence is disabled — nothing it carries reaches a crafted result.'
  );
  const facts = [
    {
      id: 'counted',
      icon: 'fas fa-cubes',
      title: text('FABRICATE.Admin.Manager.Essence.Preview.Counted', 'Counted as an input'),
      subtitle: text(
        'FABRICATE.Admin.Manager.Essence.Preview.CountedHint',
        'Recipes can require a quantity of it, and a disabled essence still matches and is consumed.'
      ),
      suppressed: false,
    },
  ];

  if (context.effectTransferEnabled === true && essence?.hasEffectTransfer === true) {
    facts.push({
      id: 'effects',
      icon: 'fas fa-wand-magic-sparkles',
      // No effect COUNT. `_buildEssenceCards` produces `{id, name, img}` and no count, and
      // producing one needs an async `fromUuid` plus `doc.effects.size` — a number the
      // store cannot compute is not shipped.
      title: text(
        'FABRICATE.Admin.Manager.Essence.Preview.Transfers',
        'Transfers active effects'
      ),
      subtitle: disabled
        ? suppressedSub
        : format('FABRICATE.Admin.Manager.Essence.Preview.TransfersFrom', 'From {name}', {
            name:
              context.sourceName ||
              text('FABRICATE.Admin.Manager.Essence.SourceNoneShort', 'None'),
          }),
      suppressed: disabled,
    });
  }

  if (context.propertyMacrosEnabled === true && essence?.hasPropertyMacro === true) {
    facts.push({
      id: 'macro',
      icon: 'fas fa-code',
      title: format('FABRICATE.Admin.Manager.Essence.Preview.RunsMacro', 'Runs {name}', {
        name:
          context.macroName ||
          text('FABRICATE.Admin.Manager.Essence.Macro.Unnamed', 'the linked property macro'),
      }),
      subtitle: disabled
        ? suppressedSub
        : text(
            'FABRICATE.Admin.Manager.Essence.Preview.RunsMacroHint',
            'Runs once per craft against the item data, before the item is created.'
          ),
      suppressed: disabled,
    });
  }

  return facts;
}

/**
 * Per-check localization key, English label and owning group, keyed by the pure model's
 * check ids.
 *
 * The keys are FULLY LITERAL, not `` `…Validation.Check${id}` ``. `lang-keys-no-orphans`
 * credits a captured literal as a covering PREFIX, and an interpolation that stops
 * mid-segment yields `…Validation.Check`, which covers no leaf at all — so every one of
 * these seven would have been reported as a new orphan while rendering perfectly.
 */
const CHECK_PRESENTATION = Object.freeze({
  name: ['FABRICATE.Admin.Manager.Essence.Validation.CheckName', 'Has a name', 'identity'],
  icon: ['FABRICATE.Admin.Manager.Essence.Validation.CheckIcon', 'An icon is selected', 'identity'],
  colour: ['FABRICATE.Admin.Manager.Essence.Validation.CheckColour', 'A colour is set', 'identity'],
  description: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckDescription',
    'Has a description players can read the icon by',
    'identity',
  ],
  macro: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckMacro',
    'Property macro is resolvable',
    'oncraft',
  ],
  source: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckSource',
    'Active effect source resolves',
    'oncraft',
  ],
  usage: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckUsage',
    'Enabled state matches its use',
    'usage',
  ],
});

const CHECK_GROUPS = Object.freeze([
  Object.freeze({
    id: 'identity',
    labelKey: 'FABRICATE.Admin.Manager.Essence.Tabs.Identity',
    fallback: 'Identity',
    icon: 'fas fa-fingerprint',
  }),
  Object.freeze({
    id: 'oncraft',
    labelKey: 'FABRICATE.Admin.Manager.Essence.Tabs.OnCraft',
    fallback: 'On craft',
    icon: 'fas fa-wand-magic-sparkles',
  }),
  Object.freeze({
    id: 'usage',
    labelKey: 'FABRICATE.Admin.Manager.Essence.Usage',
    fallback: 'Usage',
    icon: 'fas fa-cubes',
  }),
]);

/**
 * The Validation tab's grouped rows, in the shape `EditorValidationSurface` takes.
 *
 * The check SET, its order and every severity come from `essenceValidation.js`; this maps
 * them onto copy. A row that is informational reports `pass` and still renders, so
 * `passing + warnings + blocking` equals the number of checks and no row is uncounted.
 *
 * @param {object} essence
 * @param {object} context see `essenceEditorValidation`.
 * @param {(key: string, fallback: string) => string} text
 * @returns {{checks: object[], counts: object, groups: object[]}}
 */
export function essenceValidationPresentation(
  essence,
  context = {},
  text = (_key, fallback) => fallback
) {
  const { checks, counts } = essenceEditorValidation(essence, context);
  const byId = new Map(checks.map((check) => [check.id, check]));

  // A check the evaluator did not return is DROPPED, not rendered from a half-object. The
  // two lists come from one module today, so this never fires — but the previous form
  // dereferenced `check.state` unguarded behind a `.filter(Boolean)` that could not drop
  // anything (the `.map` always returned an object), so the first time the check list and
  // the evaluator covered different sets it would have thrown INSIDE a render rather than
  // degrading. The filter comes BEFORE the map, which is what makes it able to drop.
  const rows = (groupId) =>
    ESSENCE_VALIDATION_CHECKS.filter(
      (id) => CHECK_PRESENTATION[id][2] === groupId && byId.has(id)
    ).map((id) => {
      const check = byId.get(id);
      const [labelKey, fallback] = CHECK_PRESENTATION[id];
      return {
        id,
        status: checkStatus(check),
        title: text(labelKey, fallback),
        detail: essenceCheckDetail(id, check.state, text),
      };
    });

  return {
    checks,
    counts,
    groups: CHECK_GROUPS.map((group) => ({
      id: group.id,
      label: text(group.labelKey, group.fallback),
      icon: group.icon,
      rows: rows(group.id),
    })).filter((group) => group.rows.length > 0),
  };
}

/**
 * One check's row status. An informational row is a PASS by construction, so it can never
 * paint as a warning; the two failing severities paint as themselves. Written as an
 * early-return chain rather than a nested ternary (Sonar S3358).
 */
function checkStatus(check) {
  if (check.valid) return 'pass';
  return check.severity === 'blocking' ? 'block' : 'warn';
}

/** The one-line explanation under a check row, for the states that need one. */
function essenceCheckDetail(id, state, text) {
  if (id === 'colour' && state === 'unset') {
    return text(
      'FABRICATE.Admin.Manager.Essence.Validation.ColourUnset',
      'No colour is set, so this essence renders in the theme accent.'
    );
  }
  if (id === 'macro' && state === 'unresolved') {
    return text(
      'FABRICATE.Admin.Manager.Essence.Validation.MacroUnresolved',
      'The linked macro does not resolve, so it will be skipped at craft time.'
    );
  }
  if (id === 'source' && (state === 'stale' || state === 'missing')) {
    return text(
      'FABRICATE.Admin.Manager.Essence.Validation.SourceBroken',
      'The linked source component no longer resolves, so no effect can transfer.'
    );
  }
  if (id === 'usage' && state === 'disabled-in-use') {
    return text(
      'FABRICATE.Admin.Manager.Essence.Validation.UsageDisabledInUse',
      'Disabled while components carry it and recipes require it. Quantities still count; only its behaviour is suppressed.'
    );
  }
  if (id === 'description' && state === 'missing') {
    return text(
      'FABRICATE.Admin.Manager.Essence.Validation.DescriptionMissing',
      'Without a description the icon is the only thing a player can read this essence by.'
    );
  }
  return '';
}

/**
 * How many BEHAVIOURS the On-craft tab has configured — 0, 1 or 2.
 *
 * It is the tab badge, and it counts CONFIGURED behaviours rather than effects. It never
 * counted effects, so dropping the prototype's invented effect count does not delete it.
 * A gated-off capability cannot be configured from this tab, so it does not count.
 *
 * @param {object} essence
 * @param {{effectTransferEnabled?: boolean, propertyMacrosEnabled?: boolean}} features
 * @returns {number}
 */
export function essenceOnCraftCount(essence, features = {}) {
  let count = 0;
  if (features.effectTransferEnabled === true && essence?.hasEffectTransfer === true) count += 1;
  if (features.propertyMacrosEnabled === true && essence?.hasPropertyMacro === true) count += 1;
  return count;
}
