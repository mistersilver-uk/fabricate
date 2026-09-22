/**
 * The pure presentation model behind the four COMPONENT screens of epic 1357 (issue 1371). It
 * decides nothing about persistence, renders nothing, and reads no Foundry global; every string
 * is built through a caller-supplied localizer.
 *
 * A category note branches on the WORLD VALUE and never on the switch: `applyInheritedSections`
 * applies an unauthored world default to nothing, so a switch-first note would describe a value
 * that does not exist. Shared-system counts clamp at zero.
 *
 * IT IMPORTS ONE LEAF AND MUST KEEP DOING SO: every mounted suite rendering `ComponentEditView`
 * copies this graph into a hand-rolled manifest, where an omission reads as `# cancelled`, never
 * `# fail`. `tests/components/scoped-shell-prop-contract.test.js` pins the import list.
 */

import { isGeneralComponentCategory } from '../../../../../utils/componentCategories.js';

/** The row's searchable text: name, description and the world tags authored on the entry. */
export function componentSearchText(entry) {
  const entity = entry?.entity ?? {};
  const tags = Array.isArray(entry?.defaults?.tags) ? entry.defaults.tags : [];
  return [entity.name ?? '', entity.description ?? '', ...tags]
    .join(' ')
    .toLowerCase()
    .trim();
}

/** How many systems actually HAVE this component: the membership count, not `systems.length`. */
export function componentMemberCount(entry) {
  return Number(entry?.membershipCount) || 0;
}

/**
 * WHAT KIND OF THING THIS COMPONENT IS BACKED BY, as a sentence: the SOURCE, never the category.
 * The compendium branch is read off the uuid's own shape, the only place it is recorded, and an
 * unreadable uuid reports as unlinked rather than guessed at.
 */
export function componentSourceLine(entry, text) {
  const uuid = String(
    entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || ''
  ).trim();
  if (!uuid || entry?.hasSourceLink !== true) {
    return text('FABRICATE.Admin.Manager.Scoped.Component.SourceNone', 'No source item');
  }
  if (uuid.startsWith('Compendium.')) {
    return text(
      'FABRICATE.Admin.Manager.Scoped.Component.SourceCompendium',
      'Linked Compendium entry'
    );
  }
  return text('FABRICATE.Admin.Manager.Scoped.Component.SourceWorld', 'Linked Foundry item');
}

/** The alias note under the inspector's uuid: how many other addresses import will match on. */
export function componentAliasNote(entry, phrase) {
  const aliases = Array.isArray(entry?.entity?.aliasItemUuids) ? entry.entity.aliasItemUuids : [];
  if (aliases.length === 0) {
    return phrase('FABRICATE.Admin.Manager.Scoped.Component.AliasNoneNote', 'No aliases recorded');
  }
  return phrase(
    aliases.length === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.AliasNoteOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.AliasNote',
    aliases.length === 1 ? '{count} alias recorded' : '{count} aliases recorded',
    { count: aliases.length }
  );
}

/**
 * The `Global tags` card's closing note: where the value LIVES, and how many rule sets exist. It
 * no longer claims inheritance — the tag merge is unconsumed, and `## GM World Component
 * Screens` forbids asserting its false half. `{n}` is the RULE-SET count, not the system count.
 */
export function componentGlobalTagNote(entry, phrase) {
  const members = componentMemberCount(entry);
  return phrase(
    members === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.GlobalTagNoteOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.GlobalTagNote',
    members === 1
      ? 'Set on the world record. {count} rule set holds this component.'
      : 'Set on the world record. {count} rule sets hold this component.',
    { count: members }
  );
}

/**
 * The catalogue's source filter: WHICH KIND of address a record names, and whether it dangles.
 * Four options, the reference's own (`proto:579`), routed through {@link componentSourceKind} and
 * {@link componentSourceBroken} so it holds no third opinion. It takes the Item roster because
 * resolution needs one; a call site with none hands `[]`, answering "not known to be broken".
 */
export function componentSourceFilters({ worldItems = [] } = {}, phrase) {
  return [
    {
      id: 'source-type',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterSource', 'Source item'),
      // BESIDE THE SEARCH FIELD (`proto:579`), stated because the membership descriptor states its own.
      toolbarRow: 'lead',
      options: [
        {
          value: 'all',
          label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterSourceAll', 'Any source'),
        },
        {
          value: 'world',
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterSourceWorld',
            'World items'
          ),
        },
        {
          value: 'compendium',
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterSourcePack',
            'Compendium'
          ),
        },
        {
          value: 'broken',
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterSourceBroken',
            'Broken link'
          ),
        },
      ],
      matches: (entry, value) => {
        if (value === 'broken') return componentSourceBroken(entry, worldItems);
        if (value === 'world') return componentSourceKind(entry) === 'world';
        if (value === 'compendium') return componentSourceKind(entry) === 'pack';
        return true;
      },
    },
  ];
}

/** The name a row ties back to, so the order is total and a re-project cannot shuffle rows. */
function nameOf(entry) {
  const name = entry?.entity?.name;
  return typeof name === 'string' && name.trim() ? name : String(entry?.id ?? '');
}

/**
 * THE ORDER THE THREE SOURCE KINDS SORT IN, as a rank rather than a string compare: comparing
 * LOCALIZED labels would make row order follow the client's language (`proto:5150`).
 */
const SOURCE_KIND_ORDER = Object.freeze({ pack: 0, world: 1, none: 2 });

/**
 * The catalogue's ONE lane sort, by the KIND of source address a record names (`proto:5228`). A
 * REVERSIBLE PAIR sharing one `optionId`, because the frame greys its direction toggle for a key
 * it holds a single descriptor for, and the reference pairs all three of its keys with one.
 */
export function componentSorts(phrase) {
  const label = phrase('FABRICATE.Admin.Manager.Scoped.Component.SortSource', 'Source type');
  /**
   * Compendium, then world Items, then the records naming nothing — or the reverse, with the NAME
   * tie-break running the same way either way, so reversing the key does not reshuffle equal rows.
   */
  const bySource = (direction) => (left, right) => {
    const order =
      (SOURCE_KIND_ORDER[componentSourceKind(left)] -
        SOURCE_KIND_ORDER[componentSourceKind(right)]) *
      direction;
    if (order !== 0) return order;
    return nameOf(left).localeCompare(nameOf(right));
  };
  return [
    { id: 'source-type-asc', optionId: 'source-type', label, compare: bySource(1) },
    { id: 'source-type-desc', optionId: 'source-type', label, compare: bySource(-1) },
  ];
}

/**
 * The row's two reach stats, as a VALUE over a LABEL rather than a sentence (`proto:606`-`608`):
 * a column of numerals is scannable where a run of sentences is not. Neither is a chip — a chip
 * beside a name reads as behaviour, and a component's behaviour is a membership fact.
 */
export function componentRowStats(entry, systemCount, phrase) {
  const members = componentMemberCount(entry);
  const recipes = Number(entry?.recipeCount) || 0;
  return {
    stats: [
      {
        id: 'recipes',
        value: String(recipes),
        label: phrase('FABRICATE.Admin.Manager.Scoped.Component.RecipeStatLabel', 'Recipes'),
      },
      {
        id: 'systems',
        value: phrase('FABRICATE.Admin.Manager.Scoped.Component.MemberRatio', '{members}/{systems}', {
          members,
          systems: Number(systemCount) || 0,
        }),
        label: phrase('FABRICATE.Admin.Manager.Scoped.Component.SystemStatLabel', 'Systems'),
      },
    ],
  };
}

/** The row's pill, in the reference's two words (`proto:601`); the inspector line's own states. */
export function componentSourceType(entry, text) {
  const kind = componentSourceKind(entry);
  if (kind === 'none') {
    return text('FABRICATE.Admin.Manager.Scoped.Component.SourceNone', 'No source item');
  }
  if (kind === 'pack') {
    return text('FABRICATE.Admin.Manager.Scoped.Component.SourceTypePack', 'Compendium');
  }
  return text('FABRICATE.Admin.Manager.Scoped.Component.SourceTypeWorld', 'Foundry item');
}

/**
 * WHICH KIND of source address a record names, written once because three surfaces ask it and
 * three copies of `registeredItemUuid || originItemUuid` would drift silently on a rename. `none`
 * is PRESENCE, the projection's answer; RESOLUTION is {@link componentSourceBroken}'s question.
 */
export function componentSourceKind(entry) {
  const uuid = String(
    entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || ''
  ).trim();
  if (!uuid || entry?.hasSourceLink !== true) return 'none';
  return uuid.startsWith('Compendium.') ? 'pack' : 'world';
}

/**
 * Does this record's source link DANGLE — a world address naming an Item the world no longer has?
 * Answered here because the catalogue page carries `worldItems` and the projection carries no
 * roster. A COMPENDIUM address is never reported broken: it is not in the world's items and never
 * will be, so `false` here means "not known to be broken", not "known to be sound".
 */
export function componentSourceBroken(entry, worldItems) {
  const roster = Array.isArray(worldItems) ? worldItems : [];
  // AN EMPTY ROSTER IS "NOT KNOWN", NEVER "ALL BROKEN": a call site whose roster was never extended
  // to this route hands `[]`, and testing every address against it would flag the whole screen.
  if (roster.length === 0) return false;
  if (entry?.hasSourceLink !== true) return false;
  const uuid = String(
    entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || ''
  ).trim();
  if (!uuid || uuid.startsWith('Compendium.')) return false;
  return !roster.some((item) => item?.uuid === uuid);
}

/**
 * The catalogue's SYSTEM-RELATIVE membership filter, as a lane descriptor. `proto:578`-`586`'s
 * four options are the UNION of the frame's two closed vocabularies, so they are a lane FILTER
 * rather than a third vocabulary. The system-relative pair is withheld with no system in scope.
 */
export function componentMembershipScopeFilter({ systemId, systemName }, phrase) {
  const addressed = String(systemId ?? '').trim();
  const named = String(systemName ?? '').trim() || addressed;
  const memberOf = (entry) =>
    (Array.isArray(entry?.systems) ? entry.systems : []).some(
      (row) => String(row?.systemId ?? '') === addressed && row?.member === true
    );
  const options = [
    {
      value: 'all',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.MembershipAny', 'Any system'),
    },
    ...(addressed
      ? [
          {
            value: 'in',
            label: phrase(
              'FABRICATE.Admin.Manager.Scoped.Component.MembershipIn',
              'Has rules in {system}',
              { system: named }
            ),
          },
          {
            value: 'out',
            label: phrase(
              'FABRICATE.Admin.Manager.Scoped.Component.MembershipOut',
              'No rules in {system}',
              { system: named }
            ),
          },
        ]
      : []),
    {
      value: 'orphan',
      label: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.MembershipOrphan',
        'In no system at all'
      ),
    },
  ];
  const label = phrase('FABRICATE.Admin.Manager.Scoped.Component.MembershipLabel', 'Membership');
  return [
    {
      id: 'membership',
      label,
      // THE REFERENCE LABELS THIS ONE VISIBLY (`proto:579`) and the source select not at all.
      microLabel: label,
      toolbarRow: 'filters',
      options,
      matches: (entry, value) => {
        if (value === 'orphan') return componentMemberCount(entry) === 0;
        if (!addressed) return true;
        if (value === 'in') return memberOf(entry);
        if (value === 'out') return !memberOf(entry);
        return true;
      },
    },
  ];
}

/** The inspector's two reach lines: how far the component reaches, and which systems it reaches. */
export function componentUseSummary(entry, systems, phrase) {
  const rows = Array.isArray(entry?.systems) ? entry.systems : [];
  const memberNames = rows
    .filter((row) => row?.member === true)
    .map((row) => String(row?.systemName || row?.systemId || ''));
  const total = Array.isArray(systems) ? systems.length : rows.length;
  if (memberNames.length === 0) {
    return {
      useText: phrase('FABRICATE.Admin.Manager.Scoped.Component.UseNone', 'No system uses it'),
      useDetail: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.UseNoneDetail',
        'Registered but unreferenced'
      ),
    };
  }
  const shown = memberNames.slice(0, 3).join(', ');
  const remainder = memberNames.length - 3;
  return {
    useText: phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.UseCount',
      'Rules in {members} of {systems} systems',
      { members: memberNames.length, systems: total }
    ),
    useDetail:
      remainder > 0
        ? phrase('FABRICATE.Admin.Manager.Scoped.Component.UseMore', '{names} +{count} more', {
            names: shown,
            count: remainder,
          })
        : shown,
  };
}

/** The entry's category note, stating the reach BEFORE the write lands; it counts MEMBERS ONLY. */
export function componentWorldCategoryNote(entry, phrase) {
  return componentWorldSectionNote(entry, 'category', phrase);
}

/** The entry's essence note (M31): the same two counted clauses over the `essences` section. */
export function componentWorldEssenceNote(entry, phrase) {
  return componentWorldSectionNote(entry, 'essences', phrase);
}

/** ONE sentence for both sections: the clauses never name one, so the two cards cannot drift. */
function componentWorldSectionNote(entry, section, phrase) {
  const members = componentMemberCount(entry);
  if (members === 0) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryNoneNote',
      'No system has rules for this yet.'
    );
  }
  const inheriting = Number(entry?.inheritCounts?.[section]) || 0;
  const overriding = members - inheriting;
  // TWO CLAUSES, PLURALISED INDEPENDENTLY: they pluralise on DIFFERENT counts (`members` and
  // `overriding`), so one key with one plural rule cannot be right for both, and a composed
  // sentence is one a translator cannot reorder.
  const left = phrase(
    members === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryInheritOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryInherit',
    members === 1 ? '{inheriting} of {members} system inherits it' : '{inheriting} of {members} systems inherit it',
    { inheriting, members }
  );
  const right = phrase(
    overriding === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryOverrideOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryOverride',
    overriding === 1 ? '{overriding} overrides locally.' : '{overriding} override locally.',
    { overriding }
  );
  return `${left} · ${right}`;
}

/**
 * The entry's tag note: how many world tags this record carries, and any mute against them. It
 * does NOT claim reach — the read union discards the merge, so a note asserting inheritance
 * invites tagging here instead of where a tag is read. The mute clause survives because it is a
 * statement about DATA: a migrated world can carry `mutedTags`, and nothing else shows them.
 */
export function componentWorldTagNote(entry, phrase) {
  const tags = Array.isArray(entry?.defaults?.tags) ? entry.defaults.tags : [];
  if (tags.length === 0) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsNoneNote',
      'No world tags. Each system relies on its own list.'
    );
  }
  const muting = (Array.isArray(entry?.systems) ? entry.systems : []).filter(
    (row) => row?.member === true && Array.isArray(row?.mutedTags) && row.mutedTags.length > 0
  ).length;
  // `WorldTagsSet`, not `…Applied`: a key still named for the claim the sentence dropped is how
  // that claim comes back.
  const applied = phrase(
    tags.length === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsSetOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsSet',
    tags.length === 1
      ? '{count} world tag set on this record'
      : '{count} world tags set on this record',
    { count: tags.length }
  );
  // NO `else` BRANCH. "Nothing is muted" is not news, and the sentence that filled this slot was
  // the false reach claim.
  const qualifier =
    muting > 0
      ? phrase(
          muting === 1
            ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsMutedOne'
            : 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsMuted',
          muting === 1 ? ' · muted in {count} system' : ' · muted in {count} systems',
          { count: muting }
        )
      : '';
  return `${applied}${qualifier}`;
}

/**
 * The system-scope category note, in its three branches. THE THIRD BRANCH IS `!worldCategory`,
 * NOT `!inheriting` — see the module header. The inheriting branch takes the INFO tone rather than
 * the prototype's raw hex, which has no token and would trip the colour gate.
 */
export function componentCategoryNote({ worldCategory, inheriting, systemName }, phrase) {
  const world = String(worldCategory ?? '').trim();
  if (!world) {
    return {
      state: 'unset',
      icon: 'fas fa-circle-info',
      tone: 'muted',
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.CatNoteUnset',
        'No world category is set, so this system supplies its own.'
      ),
    };
  }
  if (inheriting) {
    return {
      state: 'inherited',
      icon: 'fas fa-earth-americas',
      tone: 'info',
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.CatNoteInherited',
        'Following the world value. Change it in the catalogue entry and every inheriting system follows.'
      ),
    };
  }
  return {
    state: 'overridden',
    icon: 'fas fa-code-branch',
    tone: 'warning',
    text: phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.CatNoteOverridden',
      'Overriding the world value ({category}) for {system} only.',
      { category: world, system: systemName }
    ),
  };
}

/** Whether the `Inherit from world` OPTION is offered at all. */
export function componentCategoryInheritOffered(worldCategory) {
  return String(worldCategory ?? '').trim() !== '';
}

/** Whether a world essence map is AUTHORED; an EMPTY object is an authored "no essences". */
export function componentWorldEssencesAuthored(worldEssences) {
  return (
    worldEssences !== null && typeof worldEssences === 'object' && !Array.isArray(worldEssences)
  );
}

/**
 * Whether the rules editor's essence inherit choice is offered (M31): withheld over an unauthored
 * world, since the switch resolves the in-system map either way. An EMPTY map does offer it.
 */
export function componentEssenceInheritOffered(worldEssences) {
  return componentWorldEssencesAuthored(worldEssences);
}

/** The system-scope essence note (M31), in {@link componentCategoryNote}'s three branches. */
export function componentEssenceNote({ worldEssences, inheriting, systemName }, phrase) {
  if (!componentWorldEssencesAuthored(worldEssences)) {
    return {
      state: 'unset',
      icon: 'fas fa-circle-info',
      tone: 'muted',
      text: phrase(
        'FABRICATE.Admin.Manager.Component.EssencesEdit.NoteUnset',
        'No world essence values are set, so this system supplies its own.'
      ),
    };
  }
  if (inheriting) {
    return {
      state: 'inherited',
      icon: 'fas fa-earth-americas',
      tone: 'info',
      text: phrase(
        'FABRICATE.Admin.Manager.Component.EssencesEdit.NoteInherited',
        'Following the world values. Change them in the catalogue entry and every inheriting system follows.'
      ),
    };
  }
  return {
    state: 'overridden',
    icon: 'fas fa-code-branch',
    tone: 'warning',
    text: phrase(
      'FABRICATE.Admin.Manager.Component.EssencesEdit.NoteOverridden',
      'Overriding the world values for {system} only.',
      { system: systemName }
    ),
  };
}

/**
 * The catalogue attribution banner's sentence. TWO sentences: the rules LIST states where identity
 * comes from and the EDITOR adds what belongs to the system it edits. It claims identity is
 * AUTHORED there, not that the displayed name comes from there. The `entry` surface counts MEMBERS
 * directly, since "other" has no referent on the world entry.
 */
export function componentAttributionNote({ surface, memberCount, systemName = '' }, phrase) {
  const members = Number(memberCount) || 0;
  if (surface === 'entry') {
    if (members === 0) {
      return phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.SharedNoteEntryNone',
        'No system has rules for this component yet.'
      );
    }
    return phrase(
      members === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Component.SharedNoteEntryOne'
        : 'FABRICATE.Admin.Manager.Scoped.Component.SharedNoteEntry',
      members === 1
        ? 'Shared by the {count} system that has rules for this component.'
        : 'Shared by the {count} systems that have rules for this component.',
      { count: members }
    );
  }
  const others = Math.max(0, members - 1);
  const one = others === 1;
  if (surface === 'editor') {
    return phrase(
      one
        ? 'FABRICATE.Admin.Manager.Component.SharedNoteEditorOne'
        : 'FABRICATE.Admin.Manager.Component.SharedNoteEditor',
      one
        ? 'Name, image and description are authored in the world catalogue and shared with {count} other system. Everything below belongs to {system} alone.'
        : 'Name, image and description are authored in the world catalogue and shared with {count} other systems. Everything below belongs to {system} alone.',
      { count: others, system: systemName }
    );
  }
  return phrase(
    one
      ? 'FABRICATE.Admin.Manager.Component.SharedNoteListOne'
      : 'FABRICATE.Admin.Manager.Component.SharedNoteList',
    one
      ? 'Name, art and description are authored in the world catalogue and shared with {count} other system.'
      : 'Name, art and description are authored in the world catalogue and shared with {count} other systems.',
    { count: others }
  );
}

/** The delete control's sentence; the IN-USE branch refuses and names what to do instead. */
export function componentDeleteNote(systemNames, phrase) {
  const names = (Array.isArray(systemNames) ? systemNames : []).map((name) => String(name ?? ''));
  if (names.length === 0) {
    return {
      refused: false,
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.DeleteFree',
        'No system has rules for this entry, so nothing else is affected.'
      ),
    };
  }
  const shown = names.slice(0, 3).join(', ');
  const remainder = names.length - 3;
  const list =
    remainder > 0
      ? phrase('FABRICATE.Admin.Manager.Scoped.Component.DeleteReachMore', '{names} and {count} more', {
          names: shown,
          count: remainder,
        })
      : shown;
  return {
    refused: true,
    text: phrase(
      names.length === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Component.DeleteRefusedOne'
        : 'FABRICATE.Admin.Manager.Scoped.Component.DeleteRefused',
      names.length === 1
        ? '{count} system has rules for this component, so it cannot be deleted yet. Remove it from that system first: {systems}.'
        : '{count} systems have rules for this component, so it cannot be deleted yet. Remove it from each system first: {systems}.',
      { count: names.length, systems: list }
    ),
  };
}

/**
 * WHICH OF A BULK SELECTION CAN ACTUALLY BE DELETED, and which systems hold the rest. The panel
 * refuses the same members the entry does (epic decision 7), INDIVIDUALLY rather than refusing the
 * instruction, so the plan says what will go and what was skipped and by whom. Membership is read
 * off the JOIN ROWS, since the refusal has to NAME the systems and a count cannot.
 */
export function componentBulkDeletePlan(entries, entityIds) {
  const wanted = new Set((Array.isArray(entityIds) ? entityIds : []).map((id) => String(id ?? '')));
  const deletable = [];
  const blocked = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = String(entry?.id ?? '');
    if (!id || !wanted.has(id)) continue;
    const systemNames = (Array.isArray(entry?.systems) ? entry.systems : [])
      .filter((row) => row?.member === true)
      .map((row) => String(row?.systemName || row?.systemId || ''))
      .filter(Boolean);
    if (systemNames.length === 0) {
      deletable.push(id);
    } else {
      blocked.push({
        id,
        name: String(entry?.entity?.name ?? '').trim() || id,
        systemNames,
      });
    }
  }
  return { deletable, blocked };
}

/**
 * The bulk delete's consequence note, in the plan's three states. The held cases name the skipped
 * components and their systems, because "some were skipped" says the instruction failed without
 * saying what to do; capped at three, for {@link componentDeleteNote}'s reason.
 */
export function componentBulkDeleteNote(plan, phrase) {
  const deletable = Array.isArray(plan?.deletable) ? plan.deletable : [];
  const blocked = Array.isArray(plan?.blocked) ? plan.blocked : [];
  if (blocked.length === 0) {
    return {
      refused: false,
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteNote',
        'This removes the world record, its world defaults and every system’s rules for it. Recipes that reference it stop resolving.'
      ),
    };
  }
  const shown = blocked
    .slice(0, 3)
    .map((held) =>
      phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteHeldEntry', '{name} ({systems})', {
        name: held?.name ?? '',
        systems: (Array.isArray(held?.systemNames) ? held.systemNames : []).join(', '),
      })
    )
    .join('; ');
  const remainder = blocked.length - 3;
  const detail =
    remainder > 0
      ? phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.DeleteReachMore',
          '{names} and {count} more',
          { names: shown, count: remainder }
        )
      : shown;
  if (deletable.length === 0) {
    return {
      refused: true,
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteAllHeld',
        'Every selected component still has rules in at least one system, so none of them can be deleted: {detail}. Remove them from those systems first.',
        { detail }
      ),
    };
  }
  return {
    refused: false,
    text: phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteSkipping',
      'Deletes {deletable} of {count}. {skipped} are skipped because systems still have rules for them: {detail}. Remove them from those systems first. What is deleted goes with its world defaults and every system’s rules for it, and recipes that reference it stop resolving.',
      {
        deletable: deletable.length,
        count: deletable.length + blocked.length,
        skipped: blocked.length,
        detail,
      }
    ),
  };
}

/**
 * The rules list's cohort filter, as `SegmentedControl` options. TWO SEGMENTS (`proto:1558`): the
 * dropped `Overriding` was a PREDICATE over the member cohort, which is why it carried no count.
 * The count is the segment's `badge`, so a label with `({n})` cannot render the number twice.
 */
export function componentMembershipFilters({ members, world }) {
  return [
    {
      value: 'in',
      labelKey: 'FABRICATE.Admin.Manager.Component.FilterInSystem',
      fallback: 'In this system',
      badge: Number(members) || 0,
    },
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Component.FilterAllWorld',
      fallback: 'All world components',
      badge: Number(world) || 0,
    },
  ];
}

/**
 * The rules list's count line. TWO SENTENCES, because the reference writes two (`proto:1069`,
 * `proto:1556`): widened to the world corpus the shown count no longer means the same thing. It is
 * computed over the RENDERED cohort in both, since counting the member page read `0-0 of 0`.
 */
export function componentCohortCountText({ allWorld, shown, total, mine, all }, phrase) {
  if (!allWorld) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.CountCatalogueEntries',
      '{shown} of {total} catalogue entries',
      { shown: Number(shown) || 0, total: Number(total) || 0 }
    );
  }
  return phrase(
    'FABRICATE.Admin.Manager.Component.CountCohort',
    '{shown} shown · {mine} of {all} in this system',
    { shown: Number(shown) || 0, mine: Number(mine) || 0, all: Number(all) || 0 }
  );
}

/**
 * What one rules row says about the world default, or `null` when the world corpus holds no record
 * of this component: "Inherits world category" would claim a parent that does not exist. A
 * component draws ONE section, so the label names it directly.
 */
export function componentInheritState(systemRow, phrase) {
  if (!systemRow || systemRow.member !== true) return null;
  if (systemRow.inherited?.category === false) {
    return {
      state: 'overridden',
      label: phrase(
        'FABRICATE.Admin.Manager.Component.RowOverridesCategory',
        'Overrides world category'
      ),
    };
  }
  return {
    state: 'inherited',
    label: phrase(
      'FABRICATE.Admin.Manager.Component.RowInheritsCategory',
      'Inherits world category'
    ),
  };
}

/**
 * The rules editor's tag merge note. `{effective}` is the IN-SYSTEM effective count and never the
 * additive merge, which the read union discards. Its four keys are `TagCount…`, not `TagMerge…`:
 * a key name is what the next author reads looking for "the string about the tag merge".
 */
export function componentTagMergeNote({ effective, muted }, phrase) {
  // BOTH COUNTS PLURALISE, INDEPENDENTLY, and on different counts; four keys rather than a shared
  // one, because a composed sentence cannot be reordered by a translator.
  const effectiveCount = Number(effective) || 0;
  const mutedCount = Number(muted) || 0;
  const left = phrase(
    effectiveCount === 1
      ? 'FABRICATE.Admin.Manager.Component.TagCountEffectiveOne'
      : 'FABRICATE.Admin.Manager.Component.TagCountEffective',
    effectiveCount === 1 ? '{count} tag in effect here' : '{count} tags in effect here',
    { count: effectiveCount }
  );
  const right = phrase(
    mutedCount === 1
      ? 'FABRICATE.Admin.Manager.Component.TagCountMutedOne'
      : 'FABRICATE.Admin.Manager.Component.TagCountMuted',
    mutedCount === 1 ? '{count} world tag muted' : '{count} world tags muted',
    { count: mutedCount }
  );
  return `${left} · ${right}`;
}

/**
 * The world category OPTIONS a picker may offer, with the reserved bucket removed by the shipped
 * CASE-INSENSITIVE predicate, never `!== 'general'`: ` GENERAL ` resolves as authored and is then
 * written onto every inheriting row. Trimmed, de-duplicated, sorted.
 */
export function offeredWorldComponentCategories(vocabulary) {
  const seen = new Set();
  const offered = [];
  for (const raw of Array.isArray(vocabulary) ? vocabulary : []) {
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (!label || isGeneralComponentCategory(label) || seen.has(label)) continue;
    seen.add(label);
    offered.push(label);
  }
  return offered.sort((left, right) => left.localeCompare(right));
}

/**
 * The world category NAMES the World Vocabulary store publishes (M18), from
 * `scope.worldVocabulary.categories`; a scope without the field offers nothing, the truthful
 * answer for an unknown vocabulary. The corpus union it replaced listed the SYSTEMS' categories.
 */
export function worldVocabularyComponentCategories(scope) {
  return offeredWorldComponentCategories(scope?.worldVocabulary?.categories);
}

/**
 * The world tag NAMES the store publishes (M18) — the twin of
 * {@link worldVocabularyComponentCategories}. The corpus union it replaced failed both ways: a
 * migrated record's tag read as the world's, and a world tag nothing applied was not offered.
 */
export function worldVocabularyComponentTags(scope) {
  const seen = new Set();
  const tags = scope?.worldVocabulary?.tags;
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    if (tag) seen.add(tag);
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

/** The membership group's two modes; the note names the DIRECTION, destructive in one of them. */
export function componentBulkMembershipModes(phrase) {
  return [
    {
      id: 'add',
      action: 'addToSystem',
      // THE DIRECTIONAL GLYPHS ARE THE MODEL'S (`proto:622`-`623`): direction is the one thing about
      // this control that must survive a monochrome render.
      icon: 'fas fa-arrow-right-to-bracket',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkAddTo', 'Add to'),
      note: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkAddNote',
        'Every selected component gains rules in each chosen system, inheriting the world category.'
      ),
    },
    {
      id: 'remove',
      action: 'removeFromSystem',
      icon: 'fas fa-arrow-right-from-bracket',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveFrom', 'Remove from'),
      note: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveNote',
        // THE CASCADE IS DISCLOSED, not just the overrides: `removeFromSystem` runs the in-system
        // delete through `deleteComponents`, which repairs references, disables recipes left
        // without a usable ingredient set or result, cleans salvage and reconciles alchemy.
        'Removing these components from the selected systems also rewrites every recipe in those systems that names them, and disables any recipe left without a usable ingredient set or result. The world record is untouched, and no other system changes.'
      ),
    },
  ];
}

/** How many writes an Apply will make, stated BEFORE it runs: N components by M systems. */
export function componentBulkWriteCount({ selected, systems, category, tags, essences = 0 }) {
  const rows = Number(selected) || 0;
  const systemCount = Number(systems) || 0;
  // The essence axis counts ONE world write per changed record (M31), the plan's own length.
  return (
    rows * systemCount + (category ? rows : 0) + (tags ? rows : 0) + (Number(essences) || 0)
  );
}

/**
 * The bulk dock's primary label, which NAMES THE WRITE rather than counting edits:
 * `design-system/spec.md:434` requires a bulk commit action to name the records it writes to. The
 * unstaged state is an instruction (`proto:685`). FLAT, with early returns, for the complexity gate.
 */
export function componentBulkApplyLabel(
  { count, mode, systems, category, tags, writes, essences = false },
  phrase
) {
  const selected = Number(count) || 0;
  const systemCount = Number(systems) || 0;
  const membership = systemCount > 0 && (mode === 'add' || mode === 'remove');
  // THE ESSENCE AXIS ALONE names its write the way the category axis does (M25); combined with
  // any other axis it falls through to the record count below.
  if (essences && !membership && !category && !tags) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyEssences',
      'Set essence values on {count} components',
      { count: selected }
    );
  }
  if (!membership && !category && !tags && !essences) {
    if (mode === 'add' || mode === 'remove') {
      return phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyPickSystems',
        'Pick systems to {verb} {count} components',
        {
          count: selected,
          verb: phrase(
            mode === 'add'
              ? 'FABRICATE.Admin.Manager.Scoped.Component.BulkVerbAdd'
              : 'FABRICATE.Admin.Manager.Scoped.Component.BulkVerbRemove',
            mode === 'add' ? 'add' : 'remove'
          ),
        }
      );
    }
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyIdle',
      'Stage a change to write it to {count} components',
      { count: selected }
    );
  }
  if (membership && !category && !tags && !essences) {
    return phrase(
      mode === 'add'
        ? 'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyAdd'
        : 'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyRemove',
      mode === 'add'
        ? 'Add {count} components to {systems} systems'
        : 'Remove {count} components from {systems} systems',
      { count: selected, systems: systemCount }
    );
  }
  if (!membership && category && !tags && !essences) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyCategory',
      'Set the world category on {count} components',
      { count: selected }
    );
  }
  if (!membership && !category && tags && !essences) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyTags',
      'Update world tags on {count} components',
      { count: selected }
    );
  }
  return phrase(
    'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyMixed',
    'Write {writes} records across {count} components',
    { writes: Number(writes) || 0, count: selected }
  );
}

// THE BULK PANEL'S ESSENCE AXIS (M25). A world component has NO world-level essence value under
// M25 — essences are each system's own rules — so this axis writes into every selected component's
// rules in every system holding it. The three helpers below are pure over the raw roster the root
// already hands the page, so the page never reaches into a system to decide what to write.

/** A system's rules record for one component, or `null` where the system has none. */
function componentRulesIn(system, componentId) {
  const components = Array.isArray(system?.components) ? system.components : [];
  return components.find((component) => String(component?.id ?? '') === componentId) ?? null;
}

/** The essence map a component's rules carry in one system, POSITIVE quantities only. */
function carriedEssencesOf(rules) {
  const out = {};
  const essences = rules?.essences;
  if (!essences || typeof essences !== 'object') return out;
  for (const [id, raw] of Object.entries(essences)) {
    const quantity = Number(raw);
    if (Number.isFinite(quantity) && quantity > 0) out[String(id)] = quantity;
  }
  return out;
}

/**
 * How many of the selection already carry each essence — the `n` of the inset's `n/N`, read off
 * each record's WORLD MAP (M31) through the same {@link componentWorldEssenceMap} the chips and
 * the filter read, so the count cannot disagree with the rows beside it.
 */
export function componentBulkEssenceCarried(entityIds, { entries = [], systems = [] } = {}) {
  const counts = {};
  for (const rawId of Array.isArray(entityIds) ? entityIds : []) {
    const map = componentWorldEssenceMap(componentEntryById(entries, rawId), systems);
    for (const essenceId of Object.keys(map)) counts[essenceId] = (counts[essenceId] ?? 0) + 1;
  }
  return counts;
}

/** The staged map merged into a record's current map (`proto:4239`): positive SETS, zero STRIPS. */
export function mergeStagedEssences(carried, staged) {
  const merged = { ...carried };
  for (const [id, raw] of Object.entries(staged ?? {})) {
    const quantity = Number(raw);
    if (!Number.isFinite(quantity)) continue;
    if (quantity > 0) merged[id] = quantity;
    else delete merged[id];
  }
  return merged;
}

/**
 * The writes an essence instruction makes: ONE `updateWorldDefaultSection(entityId, 'essences',
 * map)` per selected record whose world map would change, in selection order (M31). The world
 * record carries an `essences` SECTION (`data-models/spec.md` `### Component scope` requirement
 * 2a); M25's in-system route persisted where no world screen could read it. Each merge's base is
 * the record's CURRENT world map, and an unchanged record is skipped.
 */
export function componentBulkEssencePlan(entityIds, staged, { entries = [], systems = [] } = {}) {
  if (!staged || Object.keys(staged).length === 0) return [];
  const plan = [];
  for (const rawId of Array.isArray(entityIds) ? entityIds : []) {
    const entityId = String(rawId ?? '');
    if (!entityId) continue;
    const current = componentWorldEssenceMap(componentEntryById(entries, entityId), systems);
    const next = mergeStagedEssences(current, staged);
    if (essenceMapsEqual(current, next)) continue;
    plan.push({ entityId, essences: next });
  }
  return plan;
}

/** One projected entry by id, or a bare `{id}` so an unknown record reads empty rather than throws. */
function componentEntryById(entries, rawId) {
  const id = String(rawId ?? '');
  return (Array.isArray(entries) ? entries : []).find((entry) => entry?.id === id) ?? { id };
}

/** Whether two positive essence maps carry the same keys at the same values. */
function essenceMapsEqual(left, right) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => right[key] === left[key]);
}

/** The essence group's head hint: what is staged, in the words the sibling groups use. */
export function componentBulkEssenceHint(staged, phrase) {
  const count = Object.keys(staged ?? {}).length;
  if (count === 0) return phrase('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged');
  return phrase('FABRICATE.Admin.Manager.BulkEdit.EssenceStaged', '{count} staged', { count });
}

// THE WORLD CATALOGUE ENTRY'S OWN MODEL. Everything below answers a question the ENTRY screen asks
// and no other component surface does. It lives here rather than in the page for the reason the
// rest of this module does: a `.svelte` file's derivations are unreachable from a unit test.

/** The header band's subtitle: what the record IS, then how far it reaches — the GM's own order. */
export function componentEntryHeaderSubtitle(entry, text, phrase) {
  const rows = Array.isArray(entry?.systems) ? entry.systems : [];
  return phrase(
    'FABRICATE.Admin.Manager.Scoped.Component.Entry.HeaderSubtitle',
    '{source} · rules in {members} of {total} systems',
    {
      source: componentSourceLine(entry, text),
      members: rows.filter((row) => row?.member === true).length,
      total: rows.length,
    }
  );
}

/**
 * The resolution-mode labels the entry's rows carry, keyed off the roster's own `resolutionMode`.
 * SIX, not the reference's four: a mode it never drew would render an empty sub-line.
 */
const COMPONENT_SYSTEM_MODE_LABELS = Object.freeze({
  simple: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeSimple', 'Simple'],
  progressive: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeProgressive', 'Progressive'],
  routed: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeRouted', 'Routed'],
  routedByIngredients: [
    'FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeRoutedByIngredients',
    'Routed by ingredients',
  ],
  routedByCheck: [
    'FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeRoutedByCheck',
    'Routed by check',
  ],
  alchemy: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeAlchemy', 'Alchemy'],
});

/** One system's resolution mode; `Object.hasOwn`, never a plain index into the label map. */
export function componentSystemModeLabel(resolutionMode, text) {
  const token = String(resolutionMode ?? '');
  if (!Object.hasOwn(COMPONENT_SYSTEM_MODE_LABELS, token)) return '';
  const [key, fallback] = COMPONENT_SYSTEM_MODE_LABELS[token];
  return text(key, fallback);
}

/**
 * One system row's MIDDLE COLUMN: one ellipsised line saying what that system resolves. The
 * non-member branch names the CONSEQUENCE, not the absence. The member branch claims only what the
 * projection carries, so the category clause names the world value while the row inherits —
 * reading `row.category` would print `No world category` for an overriding system. THERE IS NO TAG
 * CLAUSE: no system resolves a tag count, and the system's own count is not published here.
 */
export function componentSystemRowSummary(row, { worldCategory, text, phrase }) {
  if (row?.member !== true) {
    return {
      member: false,
      text: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryNone',
        'No rules — invisible to recipes in this system'
      ),
    };
  }
  const recipes = Number(row?.recipeCount) || 0;
  const clauses = [
    componentRowCategoryClause(row, worldCategory, text),
    phrase(
      recipes === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryRecipesOne'
        : 'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryRecipes',
      recipes === 1 ? '{count} recipe' : '{count} recipes',
      { count: recipes }
    ),
  ];
  return { member: true, text: clauses.join(' · ') };
}

/** The category half of a member row's summary, in its three branches. */
function componentRowCategoryClause(row, worldCategory, text) {
  if (row?.inherited?.category === false) {
    return text(
      'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryOwnCategory',
      'Its own category'
    );
  }
  const authored = String(worldCategory ?? '').trim();
  if (authored) return authored;
  return text('FABRICATE.Admin.Manager.Scoped.Component.NoWorldCategory', 'No world category');
}

/** The systems card's three segments, counted over the SAME arrays the rows are filtered from. */
export function componentEntrySystemFilters({ total, members }) {
  const all = Number(total) || 0;
  const withRules = Number(members) || 0;
  return [
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Entry.FilterAll',
      fallback: 'All',
      badge: all,
    },
    {
      value: 'with',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Entry.FilterWith',
      fallback: 'With rules',
      badge: withRules,
    },
    {
      value: 'without',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Entry.FilterWithout',
      fallback: 'Without',
      badge: Math.max(0, all - withRules),
    },
  ];
}

/**
 * The preview rail's two kickered fact groups. The badges are `Ingredient` / `Recipe` /
 * `Gathering`: the usage leg publishes no salvage producer, so a `Salvage` badge would name nothing.
 */
export function componentEntryPreviewGroups(entry, text) {
  const required = Array.isArray(entry?.requiredBy) ? entry.requiredBy : [];
  const produced = Array.isArray(entry?.producedBy) ? entry.producedBy : [];
  return [
    {
      kicker: text('FABRICATE.Admin.Manager.Scoped.Component.Entry.UsedByKicker', 'Used by'),
      hookAttribute: 'data-world-component-required-by',
      emptyNote: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.UsedByEmpty',
        'No recipe requires it yet.'
      ),
      rows: required.map((reference) =>
        componentEntryPreviewRow(
          reference,
          text('FABRICATE.Admin.Manager.Scoped.Component.Entry.BadgeIngredient', 'Ingredient')
        )
      ),
    },
    {
      kicker: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.ProducedByKicker',
        'Produced by'
      ),
      hookAttribute: 'data-world-component-produced-by',
      emptyNote: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.ProducedByEmpty',
        'Nothing produces it yet.'
      ),
      rows: produced.map((reference) =>
        componentEntryPreviewRow(
          reference,
          reference?.kind === 'gathering'
            ? text('FABRICATE.Admin.Manager.Scoped.Component.Entry.BadgeGathering', 'Gathering')
            : text('FABRICATE.Admin.Manager.Scoped.Component.Entry.BadgeRecipe', 'Recipe')
        )
      ),
    },
  ];
}

/** One fact row; its id carries the KIND and SYSTEM, since a colliding key drops a row. */
function componentEntryPreviewRow(reference, badge) {
  const kind = String(reference?.kind ?? 'recipe');
  return {
    id: `${kind}-${reference?.systemId ?? ''}-${reference?.id ?? ''}`,
    icon: kind === 'gathering' ? 'fas fa-leaf' : 'fas fa-scroll',
    title: String(reference?.name ?? reference?.id ?? ''),
    subtitle: String(reference?.systemName ?? reference?.systemId ?? ''),
    badge,
    badgeTone: kind === 'gathering' ? 'info' : 'neutral',
  };
}

/**
 * How many OTHER catalogue entries name the same source item — the state an import run twice
 * leaves behind. EVERY address a record answers to counts (registered, origin, aliases), because
 * import matches on the union, so two entries collide the moment any pair intersects.
 */
export function componentDuplicateSourceCount(entry, scope) {
  const mine = componentSourceAddresses(entry?.entity);
  if (mine.size === 0) return 0;
  let duplicates = 0;
  for (const candidate of Array.isArray(scope?.entries) ? scope.entries : []) {
    if (!candidate || candidate.id === entry?.id) continue;
    for (const address of componentSourceAddresses(candidate.entity)) {
      if (mine.has(address)) {
        duplicates += 1;
        break;
      }
    }
  }
  return duplicates;
}

/** Every item address one world component answers to. */
function componentSourceAddresses(entity) {
  const addresses = new Set();
  for (const raw of [
    entity?.registeredItemUuid,
    entity?.originItemUuid,
    ...(Array.isArray(entity?.aliasItemUuids) ? entity.aliasItemUuids : []),
  ]) {
    const uuid = typeof raw === 'string' ? raw.trim() : '';
    if (uuid) addresses.add(uuid);
  }
  return addresses;
}

/** The inspector's identity subline; both clauses pluralise INDEPENDENTLY, on their own counts. */
export function componentInspectorSubline({ tags, essences }, phrase) {
  const tagCount = Number(tags) || 0;
  const essenceCount = Number(essences) || 0;
  const left = phrase(
    tagCount === 1
      ? 'FABRICATE.Admin.Manager.Component.InspectorTagsOne'
      : 'FABRICATE.Admin.Manager.Component.InspectorTags',
    tagCount === 1 ? '{count} tag' : '{count} tags',
    { count: tagCount }
  );
  const right = phrase(
    essenceCount === 1
      ? 'FABRICATE.Admin.Manager.Component.InspectorEssencesOne'
      : 'FABRICATE.Admin.Manager.Component.InspectorEssences',
    essenceCount === 1 ? '{count} essence' : '{count} essences',
    { count: essenceCount }
  );
  return left + ' · ' + right;
}

/** The `Tags in effect` SPLIT, not a total: it says which chips the GM can change from here. */
export function componentTagSplitText({ world, system }, phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Component.InspectorTagSplit',
    '{world} world · {system} system',
    { world: Number(world) || 0, system: Number(system) || 0 }
  );
}

/** The inspector's `Category` source line; `''` where the world corpus holds no record. */
export function componentCategorySourceText(systemRow, phrase) {
  if (!systemRow || systemRow.member !== true) return '';
  return systemRow.inherited?.category === false
    ? phrase('FABRICATE.Admin.Manager.Component.InspectorCategorySet', 'set in this system')
    : phrase(
        'FABRICATE.Admin.Manager.Component.InspectorCategoryInherited',
        'inherited from world'
      );
}

/**
 * The `Salvage in {system}` heading, split around its token so the view can wrap the system name
 * as its own node (`proto:1263`). The parts JOIN to the string the single-string form produced, so
 * a screen reader hears the same sentence and a translation may reorder or drop the token.
 */
export function componentSalvageInLabel(systemName, text) {
  const template = text('FABRICATE.Admin.Manager.Component.SalvageIn', 'Salvage in {system}');
  const at = template.indexOf('{system}');
  if (at < 0) return { lead: `${template} `, name: systemName, trail: '' };
  return {
    lead: template.slice(0, at),
    name: systemName,
    trail: template.slice(at + '{system}'.length),
  };
}

/**
 * The `Salvage in {system}` note: what this component's salvage rules ARE, without opening the
 * editor. THREE BRANCHES — a system with salvage off stores none, a component with salvage off
 * yields nothing, and only the third has a mode, a DC and a result count to state.
 */
export function componentSalvageSummary(
  { featureEnabled, componentEnabled, modeLabel, dc, resultCount },
  phrase
) {
  if (!featureEnabled) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.InspectorSalvageFeatureOff',
      'Salvage is switched off for this system, so these rules store none.'
    );
  }
  if (!componentEnabled) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.InspectorSalvageOff',
      'Salvage is disabled for this component.'
    );
  }
  const count = Number(resultCount) || 0;
  const results = phrase(
    count === 1
      ? 'FABRICATE.Admin.Manager.Component.InspectorSalvageResultsOne'
      : 'FABRICATE.Admin.Manager.Component.InspectorSalvageResults',
    count === 1 ? '{count} ordered result' : '{count} ordered results',
    { count }
  );
  const numericDc = Number(dc);
  if (Number.isFinite(numericDc) && numericDc >= 1) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.InspectorSalvageWithDc',
      '{mode} · these rules’ DC is {dc} · {results}.',
      { mode: modeLabel, dc: numericDc, results }
    );
  }
  return phrase('FABRICATE.Admin.Manager.Component.InspectorSalvageNoDc', '{mode} · {results}.', {
    mode: modeLabel,
    results,
  });
}

/**
 * The rules LIST header's subtitle — this system's own posture. IT NAMES THE CATEGORY AND NOT THE
 * TAGS, because only one of the two resolves: the read union resolves an inherited world category,
 * while `resolveComponentTags`' answer is consumed by nothing (`## GM World Component Screens`).
 */
export function componentListSubtitle({ systemName, salvageModeLabel }, phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Component.ListSubtitle',
    'Component rules in {system} · {mode} salvage · the world category resolves in; tags, essences, salvage and overrides are this system’s own.',
    { system: systemName, mode: salvageModeLabel }
  );
}

/** The rules EDITOR header's subtitle — `{system} rules · {category} · {mode}`. */
export function componentRulesSubtitle({ systemName, category, salvageModeLabel }, phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Component.RulesSubtitle',
    '{system} rules · {category} · {mode}',
    { system: systemName, category, mode: salvageModeLabel }
  );
}

// THE ROW'S ESSENCES AND THE TOOLBAR'S ESSENCE FILTER (M30) both read ONE map per world component,
// {@link componentWorldEssenceMap}, so the filter and the chips can never disagree. THE MAP IS THE
// WORLD RECORD'S `essences` SECTION (M31): values beside `category`, inherited by every system
// with rules unless it overrides, `undefined` while unauthored and `{}` as an authored "none". A
// record with no section falls back to the union of its per-system values.

/**
 * The essence filter's two PREDICATE values (`proto:5533`). The per-essence values are the world
 * catalogue's IDS, so these take a form no authored id can spell; `all` is the frame's own neutral.
 */
export const COMPONENT_ESSENCE_FILTER_ANY = '__any';
export const COMPONENT_ESSENCE_FILTER_NONE = '__none';

/** The catalogue's essence map for one component; the WORLD SECTION wins, else the union's max. */
export function componentWorldEssenceMap(entry, systems) {
  const componentId = String(entry?.id ?? '');
  const map = {};
  if (!componentId) return map;
  const world = entry?.defaults?.essences;
  if (world && typeof world === 'object' && !Array.isArray(world)) {
    return carriedEssencesOf({ essences: world });
  }
  for (const system of Array.isArray(systems) ? systems : []) {
    const carried = carriedEssencesOf(componentRulesIn(system, componentId));
    for (const [essenceId, quantity] of Object.entries(carried)) {
      map[essenceId] = Math.max(map[essenceId] ?? 0, quantity);
    }
  }
  return map;
}

/**
 * The row's essence chips, in the WORLD essence catalogue's order, with the roster's name, glyph
 * and colour token. AN ESSENCE THE CATALOGUE DOES NOT LIST DRAWS NO CHIP: a dropped id has neither
 * name nor glyph. The glyph fallback is the rules row's own, so both rows draw the same chip.
 */
export function componentRowEssenceChips(entry, { systems = [], essences = [] } = {}) {
  return componentEssenceChips(componentWorldEssenceMap(entry, systems), essences);
}

/** One essence map as chips over the WORLD essence catalogue, in its order; POSITIVE values only. */
export function componentEssenceChips(map, essences) {
  const values = map && typeof map === 'object' ? map : {};
  const chips = [];
  for (const essence of Array.isArray(essences) ? essences : []) {
    const id = String(essence?.id ?? '');
    const quantity = Number(values[id]);
    if (!id || !(quantity > 0)) continue;
    chips.push({
      id,
      name: String(essence?.name ?? '').trim() || id,
      icon: String(essence?.icon ?? '').trim() || 'fas fa-mortar-pestle',
      colorToken: String(essence?.colorToken ?? '').trim(),
      quantity,
    });
  }
  return chips;
}

/**
 * The catalogue's essence filter: the rules list's option set (`proto:5533`) over the WORLD essence
 * catalogue, applying its predicates (`proto:5477`-`5479`). WITHHELD over an empty roster, and it
 * reads the same list the chips draw, so a row with no chip never passes `Carries any essence`.
 */
export function componentEssenceFilter({ essences = [], systems = [] } = {}, phrase) {
  const roster = Array.isArray(essences) ? essences.filter((essence) => essence?.id) : [];
  if (roster.length === 0) return [];
  const carriedIds = (entry) =>
    componentRowEssenceChips(entry, { systems, essences: roster }).map((chip) => chip.id);
  return [
    {
      id: 'essence',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterEssence', 'Essence'),
      toolbarRow: 'lead',
      options: [
        {
          value: 'all',
          label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterEssenceAll', 'All essences'),
        },
        {
          value: COMPONENT_ESSENCE_FILTER_ANY,
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterEssenceAny',
            'Carries any essence'
          ),
        },
        {
          value: COMPONENT_ESSENCE_FILTER_NONE,
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterEssenceNone',
            'No essences'
          ),
        },
        ...roster.map((essence) => ({
          value: String(essence.id),
          label: String(essence.name ?? '').trim() || String(essence.id),
        })),
      ],
      matches: (entry, value) => {
        if (value === 'all') return true;
        const ids = carriedIds(entry);
        if (value === COMPONENT_ESSENCE_FILTER_ANY) return ids.length > 0;
        if (value === COMPONENT_ESSENCE_FILTER_NONE) return ids.length === 0;
        return ids.includes(String(value));
      },
    },
  ];
}
