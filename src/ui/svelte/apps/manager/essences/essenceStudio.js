/**
 * The GM Essence Studio's PRESENTATION adapter, deliberately thin: everything decidable without a
 * DOM lives under `src/utils/`, and this maps those results onto LABELS, ICONS and TONES. Every
 * export takes `text` (and where needed `format`) rather than importing `foundryBridge`.
 */

import {
  ESSENCE_VALIDATION_CHECKS,
  essenceEditorValidation,
} from '../../../../model/essenceValidation.js';

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

/**
 * The CREATE editor's three tabs, reached ONLY where there is no shared world definition to
 * contradict: `ui-integration/spec.md` `### GM World Essence Screens` requirement 10 makes identity
 * a WORLD field a system-scope screen may never edit.
 */
export const ESSENCE_EDITOR_TABS = Object.freeze([
  Object.freeze({ id: 'identity', fallback: 'Identity', icon: 'fas fa-fingerprint' }),
  Object.freeze({ id: 'oncraft', fallback: 'On craft', icon: 'fas fa-wand-magic-sparkles' }),
  Object.freeze({ id: 'validation', fallback: 'Validation', icon: 'fas fa-clipboard-check' }),
]);

/**
 * The SYSTEM ESSENCE RULES editor's two tabs. There is NO Identity tab, and its absence is the
 * requirement above; the route to those fields is the shared-definition callout. `rules` rather
 * than `oncraft`, because that tab carries the whole of what a system authors.
 */
export const ESSENCE_RULES_TABS = Object.freeze([
  Object.freeze({ id: 'rules', fallback: 'Essence rules', icon: 'fas fa-mortar-pestle' }),
  Object.freeze({ id: 'validation', fallback: 'Validation', icon: 'fas fa-clipboard-check' }),
]);

/**
 * The two CAPABILITY pills a row, a grid card and the inspector all render, MUTED rather than hidden
 * for a disabled essence: "transfers effects but is suppressed" is a different fact from "transfers
 * nothing". The Effects pill reports whether the source RESOLVES, so a non-`linked` one KEEPS the
 * pill and states the breakage in tone, glyph and title — three channels, surviving greyscale.
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
      // BOTH states carry a title, so the pill's two meanings are legible without a colour or
      // glyph the reader must already decode. There is no separate linked/unlinked chip.
      title: sourceBroken
        ? text(
            'FABRICATE.Admin.Manager.Essence.Capability.EffectsBroken',
            'The linked effect source no longer resolves, so no effect can transfer.'
          )
        : text(
            'FABRICATE.Admin.Manager.Essence.Capability.EffectsLinked',
            'Transfers active effects from a linked source that currently resolves.'
          ),
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
 * The EFFECTIVE BEHAVIOUR list — what this essence does to a crafted result — as ONE projection
 * `EssenceBehaviorPreview` renders. The arithmetic row is unconditional and FIRST, being the one
 * thing a disabled essence still does; neither behaviour row says anything about stacking.
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

  const world = context.scope === 'world';

  // AT SYSTEM SCOPE WITH A MEMBERSHIP RECORD, THE TWO ROWS ARE THE ON-CRAFT CARDS, named after the
  // VALUE each section resolves to and ending in the layer — the same question the rules LIST
  // inspector answers one click away. The ARITHMETIC row is a stated divergence.
  if (!world && context.inherited && typeof context.inherited === 'object') {
    for (const card of projectEssenceOnCraftCards(essence, context, text, format)) {
      // ONLY A CONFIGURED SECTION: this rail describes what the essence DOES. The inspector's own
      // panel lists both unconditionally, being a readout of rules rather than of behaviour.
      const configured =
        card.id === 'effects'
          ? essence?.hasEffectTransfer === true
          : essence?.hasPropertyMacro === true;
      if (configured) facts.push(card);
    }
    return facts;
  }

  const sourceName =
    context.sourceName || text('FABRICATE.Admin.Manager.Essence.SourceNoneShort', 'None');
  const macroName =
    context.macroName ||
    text('FABRICATE.Admin.Manager.Essence.Macro.Unnamed', 'the linked property macro');

  // AN UNSET WORLD DEFAULT IS NAMED, NOT INTERPOLATED: `{name}` over an empty value reads as a
  // source called "None". The world catalogue's cards already have the phrases for this state.
  const worldEffectsTitle = context.sourceName
    ? format(
        'FABRICATE.Admin.Manager.Essence.Preview.DefaultEffects',
        'Default effects from {name}',
        { name: sourceName }
      )
    : text('FABRICATE.Admin.Manager.Scoped.Essence.CardEffectsUnset', 'No default effect source');
  const worldMacroTitle = context.macroName
    ? format('FABRICATE.Admin.Manager.Essence.Preview.DefaultMacro', 'Default macro {name}', {
        name: macroName,
      })
    : text('FABRICATE.Admin.Manager.Scoped.Essence.CardMacroUnset', 'No default macro');

  if (context.effectTransferEnabled === true && essence?.hasEffectTransfer === true) {
    facts.push({
      id: 'effects',
      icon: 'fas fa-wand-magic-sparkles',
      // No effect COUNT: producing one needs an async `fromUuid` plus `doc.effects.size`.
      title: world
        ? worldEffectsTitle
        : text('FABRICATE.Admin.Manager.Essence.Preview.Transfers', 'Transfers active effects'),
      subtitle: worldOrSystemSub({
        disabled,
        world,
        suppressedSub,
        // An UNSET default states its consequence, not its reach. Both sentences are the world
        // VALIDATION rows' own, so the panel and the check agree word for word.
        worldKey: context.sourceName
          ? 'FABRICATE.Admin.Manager.Essence.Preview.DefaultEffectsHint'
          : 'FABRICATE.Admin.Manager.Essence.Validation.WorldEffectSourceUnset',
        worldFallback: context.sourceName
          ? 'Systems that inherit copy these onto anything crafted with it.'
          : 'Systems that inherit gain no active effects on craft.',
        systemKey: 'FABRICATE.Admin.Manager.Essence.Preview.TransfersFrom',
        systemFallback: 'From {name}',
        name: sourceName,
        text,
        format,
      }),
      suppressed: disabled,
    });
  }

  if (context.propertyMacrosEnabled === true && essence?.hasPropertyMacro === true) {
    facts.push({
      id: 'macro',
      icon: 'fas fa-code',
      title: world
        ? worldMacroTitle
        : format('FABRICATE.Admin.Manager.Essence.Preview.RunsMacro', 'Runs {name}', {
            name: macroName,
          }),
      subtitle: worldOrSystemSub({
        disabled,
        world,
        suppressedSub,
        worldKey: context.macroName
          ? 'FABRICATE.Admin.Manager.Essence.Preview.DefaultMacroHint'
          : 'FABRICATE.Admin.Manager.Essence.Validation.WorldMacroUnset',
        worldFallback: context.macroName
          ? 'Runs on craft in every system that inherits.'
          : 'Nothing runs on craft for systems that inherit.',
        systemKey: 'FABRICATE.Admin.Manager.Essence.Preview.RunsMacroHint',
        systemFallback: 'Runs once per craft against the item data, before the item is created.',
        name: macroName,
        text,
        format,
      }),
      suppressed: disabled,
    });
  }

  return facts;
}

/** One row's SUBTITLE in its three states, extracted so the two rows stay literal descriptions. */
function worldOrSystemSub(spec) {
  if (spec.disabled) return spec.suppressedSub;
  if (spec.world) return spec.text(spec.worldKey, spec.worldFallback);
  return spec.format(spec.systemKey, spec.systemFallback, { name: spec.name });
}

/**
 * THE `ON CRAFT IN <SYSTEM>` CARDS: the RESOLVED rules and the layer each came from. Deliberately
 * NOT {@link projectEssenceBehaviourFacts}, which answers what the essence DOES at every scope in
 * the same words; the card here is titled after the VALUE and its note ends in the layer, omitted
 * when a non-member has nothing to attribute.
 */
export function projectEssenceOnCraftCards(
  essence,
  context = {},
  text = (_key, fallback) => fallback,
  format = (_key, fallback) => fallback
) {
  const cards = [];
  if (context.effectTransferEnabled === true) {
    cards.push(
      onCraftCard({
        id: 'effects',
        icon: 'fas fa-wand-magic-sparkles',
        configured: essence?.hasEffectTransfer === true,
        name: context.sourceName || '',
        unsetTitle: text(
          'FABRICATE.Admin.Manager.Essence.OnCraftCard.NoEffects',
          'No effect source'
        ),
        setNote: text(
          'FABRICATE.Admin.Manager.Essence.OnCraftCard.EffectsNote',
          'Copied onto anything crafted with this essence here.'
        ),
        unsetNote: text(
          'FABRICATE.Admin.Manager.Essence.OnCraftCard.NoEffectsNote',
          'Nothing is transferred on craft here.'
        ),
        section: 'effectSource',
        essence,
        context,
        text,
        format,
      })
    );
  }
  if (context.propertyMacrosEnabled === true) {
    cards.push(
      onCraftCard({
        id: 'macro',
        icon: 'fas fa-code',
        configured: essence?.hasPropertyMacro === true,
        name: context.macroName || '',
        unsetTitle: text('FABRICATE.Admin.Manager.Essence.OnCraftCard.NoMacro', 'No macro'),
        setNote: text(
          'FABRICATE.Admin.Manager.Essence.OnCraftCard.MacroNote',
          'Runs against the item data before it reaches the character.'
        ),
        unsetNote: text(
          'FABRICATE.Admin.Manager.Essence.OnCraftCard.NoMacroNote',
          'Nothing runs on craft here.'
        ),
        section: 'macro',
        essence,
        context,
        text,
        format,
      })
    );
  }
  return cards;
}

/** One `ON CRAFT IN <SYSTEM>` card, extracted so its caller stays two literal descriptions. */
function onCraftCard(spec) {
  const { id, icon, configured, name, unsetTitle, setNote, unsetNote, section, essence, context, text, format } =
    spec;
  const disabled = essence?.enabled === false;
  const title = configured && name ? name : unsetTitle;
  if (configured && disabled) {
    return {
      id,
      icon,
      title,
      subtitle: text(
        'FABRICATE.Admin.Manager.Essence.Preview.Suppressed',
        'This essence is disabled — nothing it carries reaches a crafted result.'
      ),
      suppressed: true,
    };
  }
  const note = configured ? setNote : unsetNote;
  const layer = onCraftLayerClause(section, context.inherited, text);
  return {
    id,
    icon,
    title,
    subtitle: layer ? format('FABRICATE.Admin.Manager.Essence.OnCraftCard.Layered', '{note} · {layer}', { note, layer }) : note,
    suppressed: false,
  };
}

/** Which layer a section resolved from, or `''` with no membership record to attribute it to. */
function onCraftLayerClause(section, inherited, text) {
  if (!inherited || typeof inherited !== 'object') return '';
  return inherited[section] === false
    ? text('FABRICATE.Admin.Manager.Scoped.Essence.SuffixOverridden', 'overridden here')
    : text('FABRICATE.Admin.Manager.Scoped.Essence.SuffixWorldDefault', 'world default');
}

/**
 * Per-check localization key, English label and owning group, keyed by the model's check ids. The
 * keys are FULLY LITERAL, because an interpolation stopping mid-segment covers no leaf at all.
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
  // THE WORLD-DEFAULTS GROUP: one title per check, with the STATE in the detail line. The
  // prototype's two-titles-per-check wording is deliberately not reproduced — a title that changes
  // with the state makes the row unfindable by its own name.
  worldEffectSource: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckWorldEffectSource',
    'A default effect source is set',
    'world',
  ],
  worldMacro: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckWorldMacro',
    'A default property macro is set',
    'world',
  ],
  worldUsage: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckWorldUsage',
    'A crafting system has rules for it',
    'world',
  ],
  // ── THE SYSTEM-SCOPE GROUP (issue 1372) ────────────────────────────────────────────────
  systemRules: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckSystemRules',
    'This system has rules for it',
    'system',
  ],
  systemEnabled: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckSystemEnabled',
    'Enabled in this system',
    'system',
  ],
  systemEffectSource: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckSystemEffectSource',
    'Effect source resolves here',
    'system',
  ],
  systemMacro: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckSystemMacro',
    'Property macro resolves here',
    'system',
  ],
  systemCarrier: [
    'FABRICATE.Admin.Manager.Essence.Validation.CheckSystemCarrier',
    'A component in this system carries it',
    'system',
  ],
});

/**
 * WHICH PART OF THE EDITOR EACH CHECK IS ABOUT — the ZONE half of a validation row's address. A ZONE
 * rather than a tab id, because this editor has TWO tab sets with different spellings. THE THREE
 * WORLD-SCOPE CHECKS ARE ABSENT ON PURPOSE, being answered on the world entry page.
 */
const CHECK_ZONE = Object.freeze({
  name: 'identity',
  icon: 'identity',
  colour: 'identity',
  description: 'identity',
  usage: 'identity',
  macro: 'oncraft',
  source: 'oncraft',
  systemRules: 'oncraft',
  systemEnabled: 'oncraft',
  systemEffectSource: 'oncraft',
  systemMacro: 'oncraft',
  systemCarrier: 'oncraft',
});

/**
 * WHICH CONTROL EACH CHECK NAMES — the `data-validation-target` half, split between
 * `EssenceIdentityTab.svelte` and `EssenceOnCraftTab.svelte`. ROUTE-ONLY IS A STATED OUTCOME: the
 * four record-level checks emit a route and no control, so the row action changes tab without
 * moving focus, and the two system-scope section checks reuse the on-craft addresses.
 */
const CHECK_CONTROL = Object.freeze({
  name: 'essence-name',
  description: 'essence-description',
  icon: 'essence-icon',
  colour: 'essence-colour',
  macro: 'essence-macro',
  source: 'essence-source',
  systemEffectSource: 'essence-source',
  systemMacro: 'essence-macro',
});

/**
 * One zone onto a tab id THIS editor renders, or `''` when it cannot reach it. `oncraft` falls back
 * to `rules`, whose single authoring tab carries the on-craft cards; `identity` has NO fallback,
 * because on the rules screen its route out is the shared-definition callout rather than a tab.
 */
function zoneRoute(zone, tabIds) {
  if (zone === 'identity') return tabIds.includes('identity') ? 'identity' : '';
  if (zone !== 'oncraft') return '';
  if (tabIds.includes('oncraft')) return 'oncraft';
  return tabIds.includes('rules') ? 'rules' : '';
}

/**
 * The validation row addresses this editor can honour, keyed by the TAB SET rather than fixed: a
 * check whose zone this screen does not render gets NO entry, so its row draws no View button
 * rather than one changing to a tab the strip lacks. An empty address produces no key either.
 */
export function essenceIssueAddresses(tabIds = []) {
  const rendered = Array.isArray(tabIds) ? tabIds : [];
  const addresses = {};
  for (const [id, zone] of Object.entries(CHECK_ZONE)) {
    const target = zoneRoute(zone, rendered);
    if (!target) continue;
    const control = CHECK_CONTROL[id];
    addresses[id] = control ? { target, focusTarget: control } : { target };
  }
  return addresses;
}

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
  // The two SCOPED groups render only on the screen that owns them, because the presentation drops
  // a group with no rows and the evaluator returns no world check in system scope or vice versa.
  Object.freeze({
    id: 'world',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.Essence.WorldDefaults',
    fallback: 'World defaults',
    icon: 'fas fa-globe',
  }),
  Object.freeze({
    id: 'system',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.Essence.ThisSystem',
    fallback: 'This system',
    icon: 'fas fa-screwdriver-wrench',
  }),
]);

/**
 * The Validation tab's grouped rows in the shape `EditorValidationSurface` takes; the check SET, its
 * order and every severity come from `essenceValidation.js`. An informational row reports `pass` and
 * still renders, so `passing + warnings + blocking` equals the check count. `format` DEFAULTS to
 * token replacement over `text`, so three-argument call sites keep working.
 */
export function essenceValidationPresentation(
  essence,
  context = {},
  text = (_key, fallback) => fallback,
  format = (key, fallback, data) =>
    Object.entries(data ?? {}).reduce(
      (copy, [token, value]) => copy.replaceAll(`{${token}}`, String(value)),
      text(key, fallback)
    )
) {
  const { checks, counts } = essenceEditorValidation(essence, context);
  const byId = new Map(checks.map((check) => [check.id, check]));

  // A check the evaluator did not return is DROPPED rather than rendered from a half-object; the
  // filter comes BEFORE the map, which is what makes it able to drop at all.
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
        detail:
          essenceCheckDetail(id, check.state, text) ||
          scopedCheckDetail(id, check.state, context, format),
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

/** One check's row status; an informational row is a PASS by construction. Sonar S3358: no ternary. */
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
 * The detail line under one SCOPED check row, SEPARATE from `essenceCheckDetail`, which answers from
 * `(id, state)` alone: these rows need a count and a name only the world entry holds, and folding
 * the context in would give five of seven cases a parameter they never read. Keys FULLY LITERAL.
 */
function scopedCheckDetail(id, state, context, format) {
  const inheriting = Number(context?.memberSystemCount) || 0;
  if (id === 'worldEffectSource') {
    return state === 'authored'
      ? format(
          'FABRICATE.Admin.Manager.Essence.Validation.WorldEffectSourceSet',
          '{name} — {count} systems inherit it.',
          { name: context?.worldEffectSourceName || '', count: inheriting }
        )
      : format(
          'FABRICATE.Admin.Manager.Essence.Validation.WorldEffectSourceUnset',
          'Systems that inherit gain no active effects on craft.',
          {}
        );
  }
  if (id === 'worldMacro') {
    return state === 'authored'
      ? format(
          'FABRICATE.Admin.Manager.Essence.Validation.WorldMacroSet',
          '{name} — {count} systems inherit it.',
          { name: context?.worldMacroName || '', count: inheriting }
        )
      : format(
          'FABRICATE.Admin.Manager.Essence.Validation.WorldMacroUnset',
          'Nothing runs on craft for systems that inherit.',
          {}
        );
  }
  if (id === 'worldUsage') {
    return state === 'used'
      ? format('FABRICATE.Admin.Manager.Essence.Validation.WorldUsed', 'Used by {count} systems.', {
          count: inheriting,
        })
      : format(
          'FABRICATE.Admin.Manager.Essence.Validation.WorldUnused',
          'No system has rules for it, so nothing reads its values yet.',
          {}
        );
  }
  return systemCheckDetail(id, state, context, format);
}

/**
 * The detail line under one SYSTEM-SCOPE check row, split from {@link scopedCheckDetail} so neither
 * is a chain of eight branches, which SonarCloud reports as cognitive complexity.
 */
function systemCheckDetail(id, state, context, format) {
  const system = context?.systemName || '';
  if (id === 'systemRules' && state === 'missing') {
    return format(
      'FABRICATE.Admin.Manager.Essence.Validation.NoRulesInSystem',
      'No rules in {system}. Add it there to give it values this system reads.',
      { system }
    );
  }
  if (id === 'systemEnabled' && state === 'disabled') {
    return format(
      'FABRICATE.Admin.Manager.Essence.Validation.DisabledHere',
      'Disabled here — quantities still match and are consumed; only its behaviour is suppressed.',
      {}
    );
  }
  if (id === 'systemEffectSource' || id === 'systemMacro') {
    return sectionOriginDetail(state, system, format);
  }
  if (id === 'systemCarrier' && state === 'missing') {
    return format(
      'FABRICATE.Admin.Manager.Essence.Validation.NoCarrier',
      'Enabled here, and no component carries it — recipes requiring it can never be satisfied.',
      {}
    );
  }
  return '';
}

/** Which scope a resolved section came from, in one sentence. */
function sectionOriginDetail(state, system, format) {
  if (state === 'inherited') {
    return format(
      'FABRICATE.Admin.Manager.Essence.Validation.SectionInherited',
      'Inherited from the world default.',
      {}
    );
  }
  if (state === 'overridden') {
    return format(
      'FABRICATE.Admin.Manager.Essence.Validation.SectionOverridden',
      'Overridden for {system}.',
      { system }
    );
  }
  return format(
    'FABRICATE.Admin.Manager.Essence.Validation.SectionUnresolved',
    'Neither the world default nor this system sets one.',
    {}
  );
}

/**
 * How many BEHAVIOURS the On-craft tab has configured — 0, 1 or 2. It is the tab badge, and it
 * counts CONFIGURED behaviours rather than effects; a gated-off capability cannot be configured
 * from this tab, so it does not count.
 */
export function essenceOnCraftCount(essence, features = {}) {
  let count = 0;
  if (features.effectTransferEnabled === true && essence?.hasEffectTransfer === true) count += 1;
  if (features.propertyMacrosEnabled === true && essence?.hasPropertyMacro === true) count += 1;
  return count;
}
