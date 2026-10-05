/**
 * The published world corpus the scoped-entity routes read, the world entity an entry route is open
 * on, each entry editor's buffered edit, and the world records an Item drop creates or relinks.
 * Every root value is a thunk read at call time; a record opens through the root's
 * `openWorldScopedEntry`.
 */
import { resolveDropUuid } from '../../util/dropUtils.js';
import { notifyInfo, notifyWarn } from '../../util/foundryBridge.js';

import { interpolate } from './checks/checksCopy.js';
import { entryForSourceItem, isEmbeddedItemUuid } from './dropUuidClassification.js';
import { mergeAccessors } from './gatheringRouteModel.svelte.js';
import { mintEssenceId } from './scoped/essenceScoped.js';
import { scopedEntryRoute } from './scoped/scopedEntryRoutes.js';

/** What differs between a world Tool and a world component made or relinked from a drop. */
const SOURCE_KINDS = Object.freeze({
  tool: {
    entityType: 'tool',
    route: 'world-tool-entry',
    refuseEmbedded: false,
    create: (store, entity) => store?.worldScope?.tool?.createEntity?.(entity),
    update: (store, ...args) => store?.worldScope?.tool?.updateEntity?.(...args),
    existingMessage: (entry, { text }) => {
      const message =
        entry?.worldEnabled === false
          ? text(
              'FABRICATE.Admin.Manager.Scoped.Tool.DropExistingDisabled',
              '{name} already exists for that Item and is disabled at world scope. Opened it instead of creating a second.'
            )
          : text(
              'FABRICATE.Admin.Manager.Scoped.Tool.DropExisting',
              '{name} already exists for that Item. Opened it instead of creating a second.'
            );
      return message.replace('{name}', String(entry?.entity?.name || entry?.id || ''));
    },
  },
  component: {
    entityType: 'component',
    route: 'world-component-entry',
    refuseEmbedded: true,
    create: (store, entity) => store?.worldScope?.component?.createEntity?.(entity),
    update: (store, ...args) => store?.worldScope?.component?.updateEntity?.(...args),
    existingMessage: (entry, { format }) =>
      format(
        'FABRICATE.Admin.Manager.Scoped.Component.DropExisting',
        '{name} is already a world component, so this drop opened it instead of making a second one.',
        { name: String(entry?.entity?.name || entry?.id || '') }
      ),
  },
});

/** The published corpus, the rosters and tags read off it, and the essence inspector's join. */
function createCorpus({ viewState, selectedSystemId, selectedEssenceForInspector }) {
  const worldScopeState = $derived(viewState().worldScope || {});
  const worldScopedCounts = $derived({
    components: worldScopeState.component?.entities?.length ?? 0,
    essences: worldScopeState.essence?.entities?.length ?? 0,
    tools: worldScopeState.tool?.entities?.length ?? 0,
    vocabulary: worldScopeState.vocabulary?.total ?? 0,
  });
  const worldComponentOptions = $derived(
    (worldScopeState.component?.entries ?? []).map((entry) => ({
      id: entry.id,
      name: entry.entity?.name || entry.id,
      img: entry.entity?.img || '',
      // The drop target matches on these.
      ...(entry.entity?.registeredItemUuid && {
        registeredItemUuid: entry.entity.registeredItemUuid,
      }),
      ...(entry.entity?.originItemUuid && { originItemUuid: entry.entity.originItemUuid }),
    }))
  );
  // `enabled` withholds a world-disabled essence from the offer, as `selectableEssenceOptions` does.
  const worldEssenceOptions = $derived(
    (worldScopeState.essence?.entries ?? []).map((entry) => ({
      ...entry.entity,
      id: entry.id,
      enabled: entry.worldEnabled !== false,
    }))
  );
  const worldComponentTags = $derived(
    [
      ...new Set(
        (worldScopeState.component?.entries ?? []).flatMap((entry) =>
          Array.isArray(entry.defaults?.tags) ? entry.defaults.tags : []
        )
      ),
    ].sort((left, right) => String(left).localeCompare(String(right)))
  );
  const inspectedEssenceWorldEntry = $derived(
    (worldScopeState.essence?.entries ?? []).find(
      (candidate) => candidate?.id === selectedEssenceForInspector()?.id
    ) ?? null
  );
  const inspectedEssenceSystemRows = $derived(
    worldScopeState.essence?.available === true &&
      Array.isArray(inspectedEssenceWorldEntry?.systems)
      ? inspectedEssenceWorldEntry.systems
      : []
  );
  // `null` when the selected system has no membership record.
  const inspectedEssenceInherited = $derived(
    inspectedEssenceSystemRows.find((row) => row?.systemId === selectedSystemId())?.inherited ??
      null
  );

  return {
    get worldScopeState() {
      return worldScopeState;
    },
    get worldScopedCounts() {
      return worldScopedCounts;
    },
    get worldComponentOptions() {
      return worldComponentOptions;
    },
    get worldEssenceOptions() {
      return worldEssenceOptions;
    },
    get worldComponentTags() {
      return worldComponentTags;
    },
    get inspectedEssenceWorldEntry() {
      return inspectedEssenceWorldEntry;
    },
    get inspectedEssenceSystemRows() {
      return inspectedEssenceSystemRows;
    },
    get inspectedEssenceInherited() {
      return inspectedEssenceInherited;
    },
  };
}

/** The world entity an entry route is open on, and its record on each of the three routes. */
function createEntryRecords({ view }, corpus) {
  let worldScopedEntryId = $state('');
  const worldScopedEntryRoute = $derived(scopedEntryRoute(view()));
  let scopedEntryDraftIdentity = $state(null);
  const entryOn = (entityType) =>
    (corpus.worldScopeState[entityType]?.entries ?? []).find(
      (candidate) => candidate?.id === worldScopedEntryId
    ) ?? null;
  const worldEssenceEntryRecord = $derived.by(() => {
    const currentView = view();
    return currentView === 'world-essence-entry' ? entryOn('essence') : null;
  });
  const worldToolEntryRecord = $derived.by(() => {
    const currentView = view();
    return currentView === 'world-tool-entry' ? entryOn('tool') : null;
  });
  const worldComponentEntryRecord = $derived.by(() => {
    const currentView = view();
    return currentView === 'world-component-entry' ? entryOn('component') : null;
  });

  /** One buffered identity field as a string, or `null` when no editor is reporting one. */
  function scopedEntryDraftField(field) {
    if (!scopedEntryDraftIdentity) return null;
    const value = scopedEntryDraftIdentity[field];
    return typeof value === 'string' ? value : null;
  }

  return {
    get worldScopedEntryId() {
      return worldScopedEntryId;
    },
    set worldScopedEntryId(entityId) {
      worldScopedEntryId = entityId;
    },
    get worldScopedEntryRoute() {
      return worldScopedEntryRoute;
    },
    get worldEssenceEntryRecord() {
      return worldEssenceEntryRecord;
    },
    get worldToolEntryRecord() {
      return worldToolEntryRecord;
    },
    get worldComponentEntryRecord() {
      return worldComponentEntryRecord;
    },
    scopedEntryDraftField,
    handleScopedEntryDraftIdentity(identity) {
      scopedEntryDraftIdentity = identity && typeof identity === 'object' ? { ...identity } : null;
    },
  };
}

/** The entry header's name, glyph, tint, image and subtitle; a heading names the open draft. */
function createEntryHeadings({ text }, records) {
  const draftOr = (record, field) =>
    record ? (records.scopedEntryDraftField(field) ?? record.entity?.[field] ?? '') : '';
  const worldEssenceEntryName = $derived(draftOr(records.worldEssenceEntryRecord, 'name'));
  const worldEssenceEntryIcon = $derived(draftOr(records.worldEssenceEntryRecord, 'icon'));
  const worldEssenceEntryTint = $derived(draftOr(records.worldEssenceEntryRecord, 'colorToken'));
  const worldToolEntryName = $derived(draftOr(records.worldToolEntryRecord, 'name'));
  const worldComponentEntryName = $derived(draftOr(records.worldComponentEntryRecord, 'name'));
  const worldComponentEntryImage = $derived(draftOr(records.worldComponentEntryRecord, 'img'));
  // `count` is the projection's member total; `total` is the roster the entry was built against.
  const worldEssenceEntrySubtitle = $derived(
    records.worldEssenceEntryRecord
      ? interpolate(
          text(
            'FABRICATE.Admin.Manager.Scoped.EssenceEntryIdentitySubtitle',
            'World definition · used by {count} of {total} systems'
          ),
          {
            count: Number(records.worldEssenceEntryRecord.membershipCount) || 0,
            total: Array.isArray(records.worldEssenceEntryRecord.systems)
              ? records.worldEssenceEntryRecord.systems.length
              : 0,
          }
        )
      : ''
  );

  return {
    get worldEssenceEntryName() {
      return worldEssenceEntryName;
    },
    get worldEssenceEntryIcon() {
      return worldEssenceEntryIcon;
    },
    get worldEssenceEntryTint() {
      return worldEssenceEntryTint;
    },
    get worldEssenceEntrySubtitle() {
      return worldEssenceEntrySubtitle;
    },
    get worldToolEntryName() {
      return worldToolEntryName;
    },
    get worldComponentEntryName() {
      return worldComponentEntryName;
    },
    get worldComponentEntryImage() {
      return worldComponentEntryImage;
    },
  };
}

/** One entry editor's buffered edit and the subline its page reports, held for the header. */
function createEntryEditor() {
  let handle = null;
  let dirty = $state(false);
  let saving = $state(false);
  let subline = $state('');

  async function saveEntry() {
    if (!handle) return false;
    saving = true;
    try {
      return (await handle.save()) !== false;
    } finally {
      saving = false;
    }
  }

  return {
    get dirty() {
      return dirty;
    },
    get saving() {
      return saving;
    },
    get subline() {
      return subline;
    },
    onDraft(next) {
      handle = next ?? null;
      if (!next) {
        dirty = false;
        subline = '';
      }
    },
    onDirty(next) {
      dirty = next === true;
    },
    onSubline(next) {
      subline = typeof next === 'string' ? next : '';
    },
    save: saveEntry,
    isDirty: () => handle?.isDirty() === true,
    discard: () => handle?.discard?.(),
  };
}

/** The world Tool entry's header Delete: the page's descriptor and which token is armed. */
function createToolEntryDelete() {
  let worldToolEntryDelete = $state(null);
  let worldToolEntryDeleteArmed = $state('');

  return {
    get worldToolEntryDelete() {
      return worldToolEntryDelete;
    },
    get worldToolEntryDeleteArmed() {
      return worldToolEntryDeleteArmed;
    },
    set worldToolEntryDeleteArmed(token) {
      worldToolEntryDeleteArmed = token;
    },
    handleWorldToolEntryDelete(descriptor) {
      worldToolEntryDelete = descriptor ?? null;
      if (!descriptor) worldToolEntryDeleteArmed = '';
    },
  };
}

/** Create, relink and unlink a world Tool or component from a dropped Item. */
function createSourceDrops(inputs, corpus, records) {
  const { store, services, text, openWorldScopedEntry } = inputs;

  function refusedAsEmbedded(kind, uuid) {
    if (!kind.refuseEmbedded || !isEmbeddedItemUuid(uuid, inputs.parseUuid())) return false;
    notifyWarn(
      text(
        'FABRICATE.Admin.Manager.Scoped.Component.DropEmbeddedRefused',
        'That Item belongs to an actor, so it cannot be a world component. Drop the Item from the Items directory or a compendium instead.'
      )
    );
    return true;
  }

  // `data` arrives unresolved, so the drop shape is normalised before anything reads it.
  async function sourceOf(kind, data) {
    const uuid = resolveDropUuid(data);
    if (!uuid || refusedAsEmbedded(kind, uuid)) return null;
    const source = await services()?.resolveToolSource?.(uuid);
    return source ? { source, sourceUuid: source.uuid || uuid } : null;
  }

  async function createFromItemDrop(kind, data) {
    if (!data) return false;
    const resolved = await sourceOf(kind, data);
    if (!resolved) return false;
    const { source, sourceUuid } = resolved;
    const entries = corpus.worldScopeState[kind.entityType]?.entries ?? [];
    const existing = entryForSourceItem(entries, sourceUuid);
    if (existing) {
      notifyInfo(kind.existingMessage(existing, inputs));
      openWorldScopedEntry(kind.route, existing.id);
      return true;
    }
    const entityId = String(store()?.randomID?.() || '');
    if (!entityId) return false;
    const created = await kind.create(store(), {
      id: entityId,
      name: source.name || '',
      img: source.img || '',
      description: source.description || '',
      originItemUuid: sourceUuid,
      registeredItemUuid: sourceUuid,
    });
    if (created !== true) return false;
    openWorldScopedEntry(kind.route, entityId);
    return true;
  }

  async function relinkSource(kind, data) {
    const entityId = records.worldScopedEntryId;
    if (!entityId || !data) return false;
    const resolved = await sourceOf(kind, data);
    if (!resolved) return false;
    const { source, sourceUuid } = resolved;
    const patched = await kind.update(store(), entityId, {
      name: source.name || '',
      img: source.img || '',
      description: source.description || '',
      originItemUuid: sourceUuid,
      registeredItemUuid: sourceUuid,
      aliasItemUuids: [],
    });
    return patched === true;
  }

  async function unlinkSource(kind, entityId) {
    if (!entityId) return false;
    const patched = await kind.update(store(), entityId, {
      originItemUuid: null,
      registeredItemUuid: null,
      aliasItemUuids: [],
    });
    return patched === true;
  }

  const { tool, component } = SOURCE_KINDS;
  return {
    createWorldToolFromItemDrop: (data) => createFromItemDrop(tool, data),
    relinkWorldToolSource: (data) => relinkSource(tool, data),
    unlinkWorldToolSource: (entityId) => unlinkSource(tool, entityId),
    createWorldComponentFromItemDrop: (data) => createFromItemDrop(component, data),
    relinkWorldComponentSource: (data) => relinkSource(component, data),
    unlinkWorldComponentSource: (entityId) => unlinkSource(component, entityId),
  };
}

/** The player characters the world Tool entry's `Preview as` region offers, and their roll data. */
function createToolPreview({ viewState, view, store }) {
  const worldToolPreviewActors = $derived.by(() => {
    const currentView = view();
    return currentView === 'world-tool-entry'
      ? (viewState().actorOptions || [])
          .filter((actor) => actor?.uuid && actor.isPlayerCharacter === true)
          .map((actor) => ({
            id: String(actor.uuid),
            name: String(actor.name ?? actor.uuid),
            img: typeof actor.img === 'string' ? actor.img : '',
          }))
      : [];
  });

  return {
    get worldToolPreviewActors() {
      return worldToolPreviewActors;
    },
    worldToolPreviewRollData(actorUuid) {
      if (!actorUuid) return null;
      return store()?.getActorRollData?.(actorUuid) ?? null;
    },
  };
}

export function createWorldScopeModel(inputs) {
  const { store, text, openWorldScopedEntry } = inputs;
  const corpus = createCorpus(inputs);
  const records = createEntryRecords(inputs, corpus);

  async function createWorldEssence() {
    const { worldScopeState } = corpus;
    const name = text('FABRICATE.Admin.Manager.Scoped.Essence.NewName', 'New essence');
    // The retired leg is required here (issue 1654): this mints from a fixed placeholder name.
    const id = mintEssenceId(
      name,
      worldScopeState.essence?.entities ?? [],
      worldScopeState.essence?.retiredIds ?? []
    );
    const created = await store()?.worldScope?.essence?.createEntity?.({
      id,
      name,
      icon: 'fas fa-flask-vial',
      colorToken: '',
      description: '',
    });
    if (created === false) return;
    openWorldScopedEntry('world-essence-entry', id);
  }

  return mergeAccessors(
    corpus,
    records,
    createEntryHeadings(inputs, records),
    createToolEntryDelete(),
    createSourceDrops(inputs, corpus, records),
    createToolPreview(inputs),
    {
      essenceEntry: createEntryEditor(),
      toolEntry: createEntryEditor(),
      componentEntry: createEntryEditor(),
      createWorldEssence,
    }
  );
}
