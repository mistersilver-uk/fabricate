/**
 * Issue 2217: a derivative source, an Item built from a compendium entry and changed into another
 * thing, registers on its own uuid for every kind. Fixtures resolve per uuid, because one document
 * answering every uuid makes each Item its own compendium source and hides the gate.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getItemMatchUuids, resolveComponentForItem } from '../src/utils/sourceUuid.js';

import { createHarness, makeDocument, makePack } from './helpers/sourceIdentityCorpus.js';

const ENTRY_UUID = 'Compendium.kit.templates.Item.blank';
const ENTRY_NAME = 'Blank Scroll';
const SCROLL_PACK = 'world.scrolls';

/** A resolvable Item document. `storedName` is the `_source` name where it differs from the
 * prepared `name`; `id` is the pack document id. */
function item(spec) {
  const document = makeDocument(spec);
  document.documentName = 'Item';
  if (spec.id) document.id = spec.id;
  if (spec.storedName !== undefined) document._source = { name: spec.storedName };
  return document;
}

/** The compendium entry every derivative below records as its `_stats.compendiumSource`. */
function entry(overrides = {}) {
  return item({ uuid: ENTRY_UUID, name: ENTRY_NAME, pack: 'kit.templates', ...overrides });
}

/** A document of the scroll pack, shaped as core shapes one: a four-part uuid, `id` and `pack`. */
function packedScroll(id, overrides = {}) {
  return item({
    id,
    uuid: `Compendium.${SCROLL_PACK}.Item.${id}`,
    name: `Scroll of ${id}`,
    pack: SCROLL_PACK,
    compendiumSource: ENTRY_UUID,
    ...overrides,
  });
}

/** Three pack entries built from the one template, each renamed into a different scroll. */
function packedScrolls() {
  return ['fire', 'frost', 'storm'].map((id) => packedScroll(id));
}

/** The spelling of a pack document's uuid without the document-type segment. */
function typelessUuid(document) {
  return `Compendium.${document.pack}.${document.id}`;
}

/** A world Item built from the template: a derivative unless `name` is the entry's own. */
function worldScroll(id, overrides = {}) {
  return item({
    uuid: `Item.scroll-${id}`,
    name: `Scroll of ${id}`,
    compendiumSource: ENTRY_UUID,
    ...overrides,
  });
}

/** A real manager over one normalized system, resolving exactly `documents` by uuid; a pack
 * document resolves under both spellings of its uuid, as it does in core. */
function world({ documents = [], packs = [], ...libraries } = {}) {
  const resolve = {};
  for (const document of documents) {
    resolve[document.uuid] = document;
    if (document.pack && document.id) resolve[typelessUuid(document)] = document;
  }
  const { manager } = createHarness({ packs, resolve });
  manager.systems.set(
    'sys1',
    manager._normalizeSystem({ id: 'sys1', name: 'System', ...libraries })
  );
  return { manager, system: () => manager.getSystem('sys1') };
}

/** Register every uuid in order and answer the actions reported. */
async function registerAll(register, manager, uuids) {
  const actions = [];
  for (const uuid of uuids) actions.push((await register(manager, uuid)).action);
  return actions;
}

/** The definitions of `library` claiming `uuid` through any source reference. */
function claimants(system, library, uuid) {
  return system[library].filter((definition) => getItemMatchUuids(definition).includes(uuid));
}

/** The three registration entry points; `again` is what an unchanged re-registration reports. */
const KINDS = [
  {
    kind: 'component',
    library: 'components',
    again: 'skipped',
    register: (manager, uuid) => manager.addItemFromUuid('sys1', uuid),
  },
  {
    kind: 'recipe item',
    library: 'recipeItemDefinitions',
    again: 'skipped',
    register: (manager, uuid) => manager.addRecipeItemFromUuid('sys1', uuid),
  },
  {
    kind: 'tool',
    library: 'tools',
    again: 'updated',
    register: (manager, uuid) => manager.addToolFromUuid('sys1', uuid),
  },
];

describe('derivatives of one compendium entry register separately', () => {
  for (const { kind, library, again, register } of KINDS) {
    it(`three derivatives are three ${kind}s, and none claims the shared entry`, async () => {
      const scrolls = packedScrolls();
      const uuids = scrolls.map((scroll) => scroll.uuid);
      const { manager, system } = world({ documents: [entry(), ...scrolls] });

      assert.deepEqual(await registerAll(register, manager, uuids), ['added', 'added', 'added']);
      assert.equal(system()[library].length, 3);
      assert.deepEqual(claimants(system(), library, ENTRY_UUID), []);

      assert.deepEqual(await registerAll(register, manager, uuids), [again, again, again]);
      assert.equal(system()[library].length, 3, 'importing them again adds nothing');
      assert.deepEqual(claimants(system(), library, ENTRY_UUID), []);
    });
  }

  it('addItemsFromPack imports three derivative pack entries as three components', async () => {
    const scrolls = packedScrolls();
    const { manager, system } = world({
      documents: [entry(), ...scrolls],
      packs: [makePack(SCROLL_PACK, { documents: scrolls })],
    });

    const first = await manager.addItemsFromPack('sys1', SCROLL_PACK);
    assert.deepEqual(
      { added: first.added, updated: first.updated, skipped: first.skipped },
      { added: 3, updated: 0, skipped: 0 }
    );
    assert.equal(system().components.length, 3);
    assert.deepEqual(claimants(system(), 'components', ENTRY_UUID), []);

    const second = await manager.addItemsFromPack('sys1', SCROLL_PACK);
    assert.deepEqual(
      { added: second.added, updated: second.updated, skipped: second.skipped },
      { added: 0, updated: 0, skipped: 3 }
    );
  });

  it('leaves a derivative its recorded compendium source', async () => {
    const scroll = worldScroll('fire');
    const { manager } = world({ documents: [entry(), scroll] });

    await manager.addItemFromUuid('sys1', scroll.uuid);

    assert.equal(scroll._stats.compendiumSource, ENTRY_UUID);
    assert.deepEqual(
      scroll.journal.filter((write) => write.op === 'update'),
      [],
      'only a clone has its provenance stripped'
    );
  });

  it('an owned copy carrying only the shared entry resolves to no component', async () => {
    const scrolls = packedScrolls();
    const { manager, system } = world({ documents: [entry(), ...scrolls] });
    for (const scroll of scrolls) await manager.addItemFromUuid('sys1', scroll.uuid);

    const owned = makeDocument({ uuid: 'Actor.hero.Item.loot', compendiumSource: ENTRY_UUID });

    assert.equal(resolveComponentForItem(owned, system().components, 'sys1'), null);
  });

  it('a component that already absorbed derivatives keeps them, and a new sibling is added', async () => {
    const absorbed = ['fire', 'frost', 'storm'].map((id) => worldScroll(id));
    const sibling = worldScroll('acid');
    const { manager, system } = world({
      documents: [entry(), ...absorbed, sibling],
      components: [
        {
          id: 'comp-merged',
          name: 'Scroll of storm',
          registeredItemUuid: 'Item.scroll-storm',
          originItemUuid: ENTRY_UUID,
          aliasItemUuids: ['Item.scroll-fire', 'Item.scroll-frost'],
        },
      ],
    });

    for (const scroll of absorbed) {
      const result = await manager.addItemFromUuid('sys1', scroll.uuid);
      assert.equal(result.item.id, 'comp-merged', `${scroll.uuid} stays merged`);
    }
    assert.equal(system().components.length, 1);
    assert.deepEqual(
      new Set(getItemMatchUuids(system().components[0])),
      new Set([ENTRY_UUID, 'Item.scroll-fire', 'Item.scroll-frost', 'Item.scroll-storm']),
      'the merged component releases no claim'
    );

    assert.equal((await manager.addItemFromUuid('sys1', sibling.uuid)).action, 'added');
    assert.equal(system().components.length, 2);
  });
});

describe('the derivative test compares names, and errs toward the existing rule', () => {
  /** What the resolver answers for one source registered beside the given entry document. */
  async function resolved(source, entryDocument = entry()) {
    const documents = entryDocument ? [entryDocument, source] : [source];
    const { manager } = world({ documents });
    return manager._resolveImportedComponentSourceData(source.uuid, source);
  }

  const OWN_KEYED = { canonicalUuid: 'Item.scroll-x', references: ['Item.scroll-x'] };
  const ENTRY_KEYED = { canonicalUuid: ENTRY_UUID, references: ['Item.scroll-x', ENTRY_UUID] };
  // What a translation module records on an entry, and `fromCompendium` copies to its copies.
  const TRANSLATED = { babele: { originalName: ENTRY_NAME } };

  const ROWS = [
    ['a renamed copy is a derivative', worldScroll('x'), entry(), OWN_KEYED],
    [
      'a copy keeping the name is not',
      worldScroll('x', { name: ENTRY_NAME }),
      entry(),
      ENTRY_KEYED,
    ],
    [
      'case and spacing do not make a derivative',
      worldScroll('x', { name: '\tblank \n SCROLL ' }),
      entry(),
      ENTRY_KEYED,
    ],
    [
      'a derivative of a translated entry is one despite the original name it inherited',
      worldScroll('x', { flags: TRANSLATED }),
      entry({ name: 'Parchemin vierge', flags: TRANSLATED }),
      OWN_KEYED,
    ],
    [
      'and stays one against the untranslated entry, with the translation module disabled',
      worldScroll('x', { flags: TRANSLATED }),
      entry(),
      OWN_KEYED,
    ],
    [
      'a same-name copy matches a translated entry through the original name the entry records',
      worldScroll('x', { name: ENTRY_NAME }),
      entry({ name: 'Parchemin vierge', flags: TRANSLATED }),
      ENTRY_KEYED,
    ],
    [
      'the stored name decides, not a prepared rewrite of it',
      worldScroll('x', { name: 'Unidentified Scroll', storedName: ENTRY_NAME }),
      entry(),
      ENTRY_KEYED,
    ],
    [
      'a prepared name equal to the entry does not hide a stored rename',
      worldScroll('x', { name: ENTRY_NAME, storedName: 'Scroll of x' }),
      entry(),
      OWN_KEYED,
    ],
    [
      "the entry's stored name decides too",
      worldScroll('x', { name: ENTRY_NAME }),
      entry({ name: 'Parchemin vierge', storedName: ENTRY_NAME }),
      ENTRY_KEYED,
    ],
    ['an empty name is no evidence', worldScroll('x', { name: ' \t ' }), entry(), ENTRY_KEYED],
    [
      'an entry with an empty name is no evidence either',
      worldScroll('x'),
      entry({ name: '' }),
      ENTRY_KEYED,
    ],
  ];

  for (const [title, source, entryDocument, expected] of ROWS) {
    it(title, async () => {
      const { canonicalUuid, references, aliasItemUuids, sourceFallbacks } = await resolved(
        source,
        entryDocument
      );
      assert.deepEqual({ canonicalUuid, references }, expected);
      assert.deepEqual(
        { aliasItemUuids, sourceFallbacks },
        { aliasItemUuids: [], sourceFallbacks: [] }
      );
    });
  }

  it('a source whose entry no longer resolves is not a derivative', async () => {
    const { canonicalUuid, references, aliasItemUuids } = await resolved(worldScroll('x'), null);
    assert.deepEqual(
      { canonicalUuid, references, aliasItemUuids },
      {
        canonicalUuid: 'Item.scroll-x',
        references: ['Item.scroll-x', ENTRY_UUID],
        aliasItemUuids: [ENTRY_UUID],
      },
      'the broken-source fallback still claims the recorded entry'
    );
  });

  it('two copies keeping the entry name, one differing in case and spacing, are one component', async () => {
    const first = worldScroll('a', { name: ENTRY_NAME });
    const second = worldScroll('b', { name: 'blank \t SCROLL' });
    const { manager, system } = world({ documents: [entry(), first, second] });

    const added = await manager.addItemFromUuid('sys1', first.uuid);
    const again = await manager.addItemFromUuid('sys1', second.uuid);

    assert.equal(again.item.id, added.item.id);
    assert.equal(system().components.length, 1);
    assert.equal(system().components[0].originItemUuid, ENTRY_UUID);
  });
});

describe('a clone still keys on its own uuid when it keeps the entry name', () => {
  for (const { kind, library, register } of KINDS.slice(0, 2)) {
    it(`a same-name clone registers as a new ${kind}`, async () => {
      const original = worldScroll('blank', { name: ENTRY_NAME });
      const clone = worldScroll('blank-copy', { name: ENTRY_NAME, duplicateSource: original.uuid });
      const { manager, system } = world({ documents: [entry(), original, clone] });

      const first = await register(manager, original.uuid);
      const second = await register(manager, clone.uuid);

      assert.equal(second.action, 'added');
      assert.notEqual(second.item.id, first.item.id);
      assert.equal(system()[library].length, 2);
      assert.equal(second.item.originItemUuid, clone.uuid);
    });
  }
});

describe('replacing a component source', () => {
  const COMPONENTS = [
    {
      id: 'comp-entry',
      name: ENTRY_NAME,
      registeredItemUuid: ENTRY_UUID,
      originItemUuid: ENTRY_UUID,
    },
    { id: 'comp-other', name: 'Other', registeredItemUuid: 'Item.other' },
  ];

  it('accepts a derivative of an entry another component claims', async () => {
    const scroll = worldScroll('fire');
    const { manager, system } = world({ documents: [entry(), scroll], components: COMPONENTS });

    const { item: replaced } = await manager.replaceItemSource('sys1', 'comp-other', scroll.uuid);

    assert.equal(replaced.registeredItemUuid, scroll.uuid);
    assert.equal(replaced.originItemUuid, scroll.uuid);
    assert.deepEqual(
      claimants(system(), 'components', ENTRY_UUID).map((component) => component.id),
      ['comp-entry']
    );
  });

  it('still refuses a copy that keeps the entry name', async () => {
    const copy = worldScroll('copy', { name: ENTRY_NAME });
    const { manager } = world({ documents: [entry(), copy], components: COMPONENTS });

    await assert.rejects(
      () => manager.replaceItemSource('sys1', 'comp-other', copy.uuid),
      /already belongs to "Blank Scroll"/
    );
  });
});

describe('a re-registration neither adds nor releases a compendium-source claim', () => {
  const ENTRY_DEFINITION = {
    id: 'def-entry',
    name: ENTRY_NAME,
    registeredItemUuid: ENTRY_UUID,
    originItemUuid: ENTRY_UUID,
  };

  for (const { kind, library, register } of KINDS) {
    it(`a ${kind} registered from a derivative before the gate moves to its own uuid and keeps the entry`, async () => {
      const scroll = worldScroll('fire');
      const copy = worldScroll('copy', { name: ENTRY_NAME });
      const { manager, system } = world({
        documents: [entry(), scroll, copy],
        [library]: [
          {
            id: 'def-fire',
            name: scroll.name,
            registeredItemUuid: scroll.uuid,
            originItemUuid: ENTRY_UUID,
          },
        ],
      });

      const again = await register(manager, scroll.uuid);
      assert.equal(again.action, 'updated');
      assert.equal(again.item.id, 'def-fire');
      assert.equal(again.item.originItemUuid, scroll.uuid);
      assert.deepEqual(again.item.aliasItemUuids, [ENTRY_UUID]);

      const merged = await register(manager, copy.uuid);
      assert.equal(merged.action, 'updated', 'a same-name copy still joins the definition');
      assert.equal(merged.item.id, 'def-fire');
      assert.equal(system()[library].length, 1);
    });

    const ENTRY_STATES = [
      ['resolves', (scroll) => [entry(), scroll]],
      ['no longer resolves', (scroll) => [scroll]],
    ];
    for (const [state, documentsFor] of ENTRY_STATES) {
      it(`a ${kind} from a derivative renamed to the entry name stays on its own uuid while the entry ${state}`, async () => {
        const scroll = worldScroll('fire', { name: ENTRY_NAME });
        const { manager, system } = world({
          documents: documentsFor(scroll),
          [library]: [
            ENTRY_DEFINITION,
            {
              id: 'def-fire',
              name: 'Scroll of fire',
              registeredItemUuid: scroll.uuid,
              originItemUuid: scroll.uuid,
            },
          ],
        });
        const entryBefore = structuredClone(system()[library][0]);

        const result = await register(manager, scroll.uuid);

        assert.equal(result.item.id, 'def-fire');
        const [entryDefinition, fireDefinition] = system()[library];
        assert.deepEqual(
          entryDefinition,
          entryBefore,
          'the definition claiming the entry is untouched'
        );
        assert.deepEqual(getItemMatchUuids(fireDefinition), [scroll.uuid]);
        assert.equal(system()[library].length, 2);
      });
    }
  }
});

describe('a withheld compendium claim reports no broken-source fallback', () => {
  it('re-importing an own-keyed component whose entry no longer resolves warns of nothing', async () => {
    const scroll = worldScroll('fire');
    const { manager } = world({
      documents: [scroll],
      components: [
        {
          id: 'comp-fire',
          name: scroll.name,
          img: 'icons/svg/item-bag.svg',
          registeredItemUuid: scroll.uuid,
          originItemUuid: scroll.uuid,
        },
      ],
    });

    const result = await manager.addItemFromUuid('sys1', scroll.uuid);

    assert.equal(result.action, 'skipped');
    assert.deepEqual(result.sourceFallbacks, []);
  });

  it('a first import whose entry does not resolve still reports the fallback it took', async () => {
    const scroll = worldScroll('fire');
    const { manager } = world({ documents: [scroll] });

    const result = await manager.addItemFromUuid('sys1', scroll.uuid);

    assert.deepEqual(result.item.aliasItemUuids, [ENTRY_UUID]);
    assert.deepEqual(result.sourceFallbacks, [
      { itemName: scroll.name, brokenUuid: ENTRY_UUID, fallbackUuid: scroll.uuid },
    ]);
  });
});

describe('a durable leaf at find-existing', () => {
  const leaf = (role, id) => ({ fabricate: { fabricate: { roles: { sys1: { [role]: id } } } } });
  const stamped = (document, role) => document.flags.fabricate.fabricate.roles.sys1[role];
  const LEAVES = [
    { ...KINDS[1], role: 'recipeItemDefinitionId' },
    { ...KINDS[2], role: 'toolId' },
  ];

  for (const { kind, library, register, role } of LEAVES) {
    const entryDefinition = {
      id: 'def-entry',
      name: ENTRY_NAME,
      registeredItemUuid: ENTRY_UUID,
      originItemUuid: ENTRY_UUID,
    };

    it(`a derivative whose inherited leaf names the entry's ${kind} registers as a new one`, async () => {
      const scroll = worldScroll('fire', { flags: leaf(role, 'def-entry') });
      const { manager, system } = world({
        documents: [entry(), scroll],
        [library]: [entryDefinition],
      });

      const result = await register(manager, scroll.uuid);

      assert.equal(result.action, 'added');
      assert.notEqual(result.item.id, 'def-entry');
      assert.equal(system()[library].length, 2);
      assert.equal(
        stamped(scroll, role),
        result.item.id,
        'the leaf is overwritten with its own id'
      );
    });

    it(`a clone whose inherited leaf names the entry's ${kind} registers as a new one`, async () => {
      const clone = worldScroll('blank-copy', {
        name: ENTRY_NAME,
        duplicateSource: 'Item.scroll-blank',
        flags: leaf(role, 'def-entry'),
      });
      const { manager, system } = world({
        documents: [entry(), clone],
        [library]: [entryDefinition],
      });

      const result = await register(manager, clone.uuid);

      assert.equal(result.action, 'added');
      assert.equal(system()[library].length, 2);
      assert.equal(stamped(clone, role), result.item.id);
    });

    it(`a copy that is neither still re-links to the ${kind} its leaf names`, async () => {
      const copy = worldScroll('copy', { name: ENTRY_NAME, flags: leaf(role, 'def-linked') });
      const { manager, system } = world({
        documents: [entry(), copy],
        [library]: [
          {
            id: 'def-linked',
            name: ENTRY_NAME,
            registeredItemUuid: 'Item.elsewhere',
            originItemUuid: 'Item.elsewhere',
          },
        ],
      });

      const result = await register(manager, copy.uuid);

      assert.equal(result.item.id, 'def-linked');
      assert.equal(system()[library].length, 1);
    });

    it(`a derivative already registered as the ${kind} its leaf names stays on it`, async () => {
      const scroll = worldScroll('fire', { flags: leaf(role, 'def-fire') });
      const { manager, system } = world({
        documents: [entry(), scroll],
        [library]: [
          entryDefinition,
          {
            id: 'def-fire',
            name: scroll.name,
            registeredItemUuid: scroll.uuid,
            originItemUuid: scroll.uuid,
          },
        ],
      });

      const result = await register(manager, scroll.uuid);

      assert.equal(result.item.id, 'def-fire');
      assert.equal(system()[library].length, 2);
    });
  }
});

describe('a pack Item owns both spellings of its uuid', () => {
  const ENTRY_COMPONENT = {
    id: 'comp-entry',
    name: ENTRY_NAME,
    registeredItemUuid: ENTRY_UUID,
    originItemUuid: ENTRY_UUID,
  };
  const stampedComponentId = (document) =>
    document.flags.fabricate?.fabricate.roles.sys1.componentId;

  /** A world holding the scroll pack and the entry's own component, listed first. */
  function packWorld(components = []) {
    const scrolls = packedScrolls();
    const built = world({
      documents: [entry(), ...scrolls],
      packs: [makePack(SCROLL_PACK, { documents: scrolls })],
      components: [ENTRY_COMPONENT, ...components],
    });
    return { ...built, scrolls };
  }

  /** The component a pack document was registered as before both spellings were read. */
  function typelessComponent(document) {
    return {
      id: `comp-${document.id}`,
      name: document.name,
      registeredItemUuid: typelessUuid(document),
      originItemUuid: typelessUuid(document),
    };
  }

  it('editing a bulk-imported entry refreshes its component', async () => {
    const { manager, system, scrolls } = packWorld();
    await manager.addItemsFromPack('sys1', SCROLL_PACK);
    const [fire] = scrolls;
    fire.name = 'Scroll of embers';

    const result = await manager.refreshComponentMetadataForUpdatedItem(fire, { name: fire.name });

    assert.equal(result.updated, 1);
    assert.deepEqual(
      system().components.map((component) => component.name),
      [ENTRY_NAME, 'Scroll of embers', 'Scroll of frost', 'Scroll of storm']
    );
  });

  it('Repair Item Data stamps a bulk-registered derivative with its own component id', async () => {
    const { manager, system, scrolls } = packWorld();
    await manager.addItemsFromPack('sys1', SCROLL_PACK);

    await manager.repairItemData();

    for (const scroll of scrolls) {
      const own = system().components.find((component) => component.name === scroll.name);
      assert.equal(stampedComponentId(scroll), own.id, `${scroll.uuid} carries its own id`);
    }
  });

  it('a single drop of the document uuid after a bulk import adds nothing, and neither route moves the registered uuid', async () => {
    const { manager, system, scrolls } = packWorld();
    await manager.addItemsFromPack('sys1', SCROLL_PACK);

    for (const scroll of scrolls) {
      const result = await manager.addItemFromUuid('sys1', scroll.uuid);
      assert.equal(result.action, 'skipped', scroll.uuid);
    }
    const again = await manager.addItemsFromPack('sys1', SCROLL_PACK);

    assert.equal(again.skipped, 3);
    assert.equal(system().components.length, 4);
    assert.deepEqual(
      system()
        .components.slice(1)
        .map((component) => component.registeredItemUuid),
      scrolls.map((scroll) => scroll.uuid)
    );
  });

  const SPELLINGS = [
    ['type-less', typelessUuid],
    ['four-part', (document) => document.uuid],
  ];
  for (const [spelling, uuidOf] of SPELLINGS) {
    it(`a component registered under the type-less spelling is found by an import of the ${spelling} uuid`, async () => {
      const fire = packedScroll('fire');
      const { manager, system } = world({
        documents: [entry(), fire],
        components: [ENTRY_COMPONENT, typelessComponent(fire)],
      });

      const result = await manager.addItemFromUuid('sys1', uuidOf(fire));

      assert.equal(result.item.id, 'comp-fire');
      assert.equal(system().components.length, 2);
    });
  }

  it('a component registered under the type-less spelling is found by a bulk import', async () => {
    const { manager, system } = packWorld(packedScrolls().map(typelessComponent));

    const summary = await manager.addItemsFromPack('sys1', SCROLL_PACK);

    assert.equal(summary.added, 0);
    assert.deepEqual(
      system().components.map((component) => component.id),
      ['comp-entry', 'comp-fire', 'comp-frost', 'comp-storm']
    );
  });

  it('a component registered under the type-less spelling is refreshed and repaired as it stands', async () => {
    const { manager, scrolls } = packWorld(packedScrolls().map(typelessComponent));
    const [fire] = scrolls;
    fire.name = 'Scroll of embers';

    const refreshed = await manager.refreshComponentMetadataForUpdatedItem(fire, {
      name: fire.name,
    });
    await manager.repairItemData();

    assert.equal(refreshed.updated, 1);
    assert.deepEqual(scrolls.map(stampedComponentId), ['comp-fire', 'comp-frost', 'comp-storm']);
  });

  it('a component registered under the four-part uuid, listed after the entry component, is found by the type-less uuid', async () => {
    const copy = packedScroll('blank', { name: ENTRY_NAME });
    const { manager, system } = world({
      documents: [entry(), copy],
      components: [
        ENTRY_COMPONENT,
        {
          id: 'comp-copy',
          name: ENTRY_NAME,
          registeredItemUuid: copy.uuid,
          originItemUuid: copy.uuid,
        },
      ],
    });
    const entryBefore = structuredClone(system().components[0]);

    const result = await manager.addItemFromUuid('sys1', typelessUuid(copy));

    assert.equal(result.item.id, 'comp-copy');
    assert.equal(system().components.length, 2);
    assert.deepEqual(system().components[0], entryBefore);
  });
});
