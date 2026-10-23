/**
 * The publishable-subset ratchet (issue 2455): every design-system candidate that passes the
 * static rules is published or listed in `scripts/lib/publishedComponentExclusions.json` with a
 * reason, a listed path is not stale, and the list only shrinks against the merge base, except for
 * a path that failed a static rule there. The per-item spreads a published closure draws are held
 * against `STRIPPED_ITEM_MEMBERS` both ways.
 * Limit: a PR that makes a listed component fail a static rule, or stops it being a candidate,
 * drops it from the list unreviewed.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';
import { STRIPPED_ITEM_MEMBERS } from '../src/ui/publishedComponentProps.js';

import { MANIFEST_PATH } from './helpers/designSystemRatchet.js';
import {
  REPO_ROOT,
  compareToBase,
  readHeadFile,
  reportComparison,
} from './helpers/mergeBaseRatchet.js';
import { syntheticReader } from './helpers/publishedComponentGate.js';
import {
  EXCLUSIONS_PATH,
  PUBLISHED_MANIFEST_PATH,
  REMEDY,
  contextAt,
  contextOf,
  exclusionFailures,
  itemSpreadIds,
  publishableFaults,
  ratchetReport,
  strippedMemberFaults,
} from './helpers/publishedComponentPublishable.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const FAMILY = 'published-component';

const inCorpus = (file) =>
  file === EXCLUSIONS_PATH ||
  file === MANIFEST_PATH ||
  file === PUBLISHED_MANIFEST_PATH ||
  (file.startsWith('src/ui/svelte/') && file.endsWith('.svelte')) ||
  (file.startsWith('src/') && file.endsWith('.js'));

const GUIDANCE =
  `A component that is publishable at the base cannot be added to the exclusion list: publish it instead. ` +
  `This family has no ratchet-exempt marker: the list is JSON, so a row's reason is the exemption channel, ` +
  `and a row may be added only for a component that failed a static rule at the base.`;

/**
 * A measure of the exclusion list's rows on each side of the comparison: the base's own, and the
 * head's less a row for a path that failed a static rule at the base (a new row for it is allowed).
 * With no list at the base nothing is compared, which seeds the list. Called base first, then head.
 */
function exclusionMeasure() {
  const sides = [];
  return (readFile) => {
    const context = contextOf(readFile);
    sides.push(context);
    if (sides.length > 2) throw new Error('exclusionMeasure measures one base and one head');
    const [base] = sides;
    if (sides.length === 2 && base.exclusions === null) return [];
    const baseListed = new Set((base.exclusions ?? []).map((row) => row.path));
    const kept = (row) =>
      sides.length === 1 ||
      baseListed.has(row.path) ||
      publishableFaults(row.path, base).length === 0;
    return (context.exclusions ?? [])
      .filter((row) => kept(row))
      .map((row) => ({ file: EXCLUSIONS_PATH, id: row.path }));
  };
}

/** The comparison with the base, and every failure at the head that no base can excuse. */
function runRatchet({ cwd = REPO_ROOT, base } = {}) {
  const result = compareToBase({
    family: FAMILY,
    corpusRoot: '.',
    include: inCorpus,
    measure: exclusionMeasure(),
    scope: 'corpus',
    cwd,
    base,
  });
  const head = contextAt(cwd);
  const report = ratchetReport(head);
  return { result, head, report, failures: exclusionFailures(head, report) };
}

describe('the publishable subset', () => {
  let ran;
  const ratchet = () => (ran ??= runRatchet());

  it('holds every publishable candidate published or listed, and no stale row', () => {
    assert.deepEqual(ratchet().failures, [], REMEDY);
  });

  it('prints the report, and holds its invariants rather than its totals', (t) => {
    const { report } = ratchet();
    const { staticFailures, ...counted } = report;
    t.diagnostic(
      JSON.stringify({
        ...Object.fromEntries(Object.entries(counted).map(([name, paths]) => [name, paths.length])),
        staticFailures: Object.keys(staticFailures).length,
      })
    );
    const published = new Set(report.published);
    assert.ok(report.candidates.length > 0 && report.published.length > 0, 'a scan, not nothing');
    assert.deepEqual(
      report.listed.filter((path) => published.has(path)),
      [],
      'published and listed are disjoint'
    );
    const candidates = new Set(report.candidates);
    assert.deepEqual(
      [...report.listed, ...report.published].filter((path) => !candidates.has(path)),
      [],
      'every listed and published path is a candidate'
    );
  });

  it('only shrinks against the merge base', (t) => {
    reportComparison(t, ratchet().result, GUIDANCE, { markers: false });
  });

  it('keeps the exclusion list to decisions only: no totals', () => {
    const list = JSON.parse(readHeadFile(REPO_ROOT, EXCLUSIONS_PATH));
    assert.deepEqual(Object.keys(list), ['exclusions']);
    for (const row of list.exclusions) assert.deepEqual(Object.keys(row), ['path', 'reason']);
  });

  it('holds STRIPPED_ITEM_MEMBERS against the per-item spreads the published closures draw', () => {
    assert.deepEqual(strippedMemberFaults(ratchet().head, STRIPPED_ITEM_MEMBERS), []);
  });
});

const COMPONENT = (script = '', body = '<div>x</div>') => `<script>${script}</script>\n${body}\n`;
const PUBLISHED = (...names) =>
  `export const PUBLISHED_COMPONENT_MANIFEST = Object.freeze([${names
    .map(
      (name) =>
        `Object.freeze({ name: '${name}', path: 'src/ui/svelte/components/${name}.svelte', version: 1, props: Object.freeze({}), rest: false, root: 'any' })`
    )
    .join(',')}]);\n`;
const ROWS = (...names) =>
  JSON.stringify({
    designSystemPrimitives: names.map((name) => ({
      path: `src/ui/svelte/components/${name}.svelte`,
      scope: 'shared',
    })),
    notAPrimitive: [],
  });
const LIST = (...rows) =>
  JSON.stringify({
    exclusions: rows.map(([name, reason = 'no-consumer: nothing draws it.']) => ({
      path: `src/ui/svelte/components/${name}.svelte`,
      reason,
    })),
  });
const path = (name) => `src/ui/svelte/components/${name}.svelte`;
const FOUNDRY_READ = COMPONENT('const user = game.user;');

describe('the ratchet against a base commit', () => {
  const repos = [];
  after(() => {
    for (const repo of repos) repo.dispose();
  });

  /** A repository whose base commit holds `base` and whose working tree then holds `head`. */
  function repoWith(base, head) {
    const repo = createTempGitRepo('fab-published-ratchet-');
    repos.push(repo);
    repo.write({ [MANIFEST_PATH]: ROWS('Alpha'), [PUBLISHED_MANIFEST_PATH]: PUBLISHED(), ...base });
    const sha = repo.commitAll('base');
    repo.write(head);
    return { repo, sha };
  }
  const ratchetOf = ({ repo, sha }) => runRatchet({ cwd: repo.dir, base: sha });
  const files = (extra = {}) => ({
    [path('Alpha')]: COMPONENT(),
    ...extra,
  });

  it('fails a publishable candidate that is neither published nor listed', () => {
    const outcome = ratchetOf(
      repoWith(
        { [EXCLUSIONS_PATH]: LIST(), ...files() },
        { [path('Alpha')]: COMPONENT('', '<p>y</p>') }
      )
    );
    assert.deepEqual(outcome.failures, [
      `${path('Alpha')} is publishable and neither published nor listed: ${REMEDY}`,
    ]);
  });

  it('passes a candidate that is published, and one that is listed', () => {
    const base = {
      [MANIFEST_PATH]: ROWS('Alpha', 'Beta'),
      [path('Beta')]: COMPONENT(),
      [EXCLUSIONS_PATH]: LIST(['Beta']),
      [PUBLISHED_MANIFEST_PATH]: PUBLISHED('Alpha'),
      ...files(),
    };
    const outcome = ratchetOf(repoWith(base, { [path('Alpha')]: COMPONENT('', '<p>y</p>') }));
    assert.deepEqual(outcome.failures, []);
    assert.deepEqual(outcome.result.failures, []);
  });

  it('seeds the list: no comparison when the base has none', () => {
    const outcome = ratchetOf(repoWith(files(), { [EXCLUSIONS_PATH]: LIST(['Alpha']) }));
    assert.deepEqual(outcome.result.failures, []);
    assert.deepEqual(outcome.failures, []);
  });

  it('measures one base and one head, and throws on a third side', () => {
    const measure = exclusionMeasure();
    const read = (file) => readHeadFile(REPO_ROOT, file);
    measure(read);
    measure(read);
    assert.throws(() => measure(read), /one base and one head/);
  });

  it('fails a list that is missing at the head', () => {
    const repoState = repoWith({ [EXCLUSIONS_PATH]: LIST(['Alpha']), ...files() }, {});
    repoState.repo.git('rm', '-q', EXCLUSIONS_PATH);
    const outcome = ratchetOf(repoState);
    assert.deepEqual(outcome.failures, [`${EXCLUSIONS_PATH} is missing`]);
  });

  it('fails a path added to the list that was publishable at the base', () => {
    const outcome = ratchetOf(
      repoWith({ [EXCLUSIONS_PATH]: LIST(), ...files() }, { [EXCLUSIONS_PATH]: LIST(['Alpha']) })
    );
    assert.deepEqual(outcome.result.failures, [`${EXCLUSIONS_PATH}: ${path('Alpha')} is new (1)`]);
  });

  it('fails a path added to the list that was publishable at the base though no candidate there', () => {
    const outcome = ratchetOf(
      repoWith(
        { [MANIFEST_PATH]: ROWS(), [EXCLUSIONS_PATH]: LIST(), ...files() },
        { [MANIFEST_PATH]: ROWS('Alpha'), [EXCLUSIONS_PATH]: LIST(['Alpha']) }
      )
    );
    assert.deepEqual(outcome.result.failures, [`${EXCLUSIONS_PATH}: ${path('Alpha')} is new (1)`]);
  });

  it('reports a regression without offering a ratchet-exempt marker', () => {
    const { result } = ratchetOf(
      repoWith({ [EXCLUSIONS_PATH]: LIST(), ...files() }, { [EXCLUSIONS_PATH]: LIST(['Alpha']) })
    );
    assert.throws(
      () => reportComparison({}, result, GUIDANCE, { markers: false }),
      (error) => error.message.includes('is new (1)') && !/ratchet-exempt\(/.test(error.message)
    );
    assert.throws(
      () => reportComparison({}, result, GUIDANCE),
      /ratchet-exempt\(published-component\)/
    );
  });

  it('allows a path to be added that did not pass the static rules at the base', () => {
    const outcome = ratchetOf(
      repoWith(
        { [EXCLUSIONS_PATH]: LIST(), [path('Alpha')]: FOUNDRY_READ },
        { [EXCLUSIONS_PATH]: LIST(['Alpha']), [path('Alpha')]: COMPONENT() }
      )
    );
    assert.deepEqual(outcome.result.failures, []);
    assert.deepEqual(outcome.failures, []);
  });

  it('allows a path to be added that did not exist at the base', () => {
    const outcome = ratchetOf(
      repoWith(
        { [EXCLUSIONS_PATH]: LIST() },
        { [MANIFEST_PATH]: ROWS('Alpha'), [EXCLUSIONS_PATH]: LIST(['Alpha']), ...files() }
      )
    );
    assert.deepEqual(outcome.result.failures, []);
  });

  it('passes a shrink, and reports it as shrank', () => {
    const state = repoWith(
      {
        [MANIFEST_PATH]: ROWS('Alpha', 'Beta'),
        [path('Beta')]: COMPONENT(),
        [EXCLUSIONS_PATH]: LIST(['Alpha'], ['Beta']),
        ...files(),
      },
      { [EXCLUSIONS_PATH]: LIST(['Alpha']), [PUBLISHED_MANIFEST_PATH]: PUBLISHED('Beta') }
    );
    const notes = [];
    const outcome = ratchetOf(state);
    reportComparison(
      {
        diagnostic: (line) => {
          notes.push(line);
        },
      },
      outcome.result,
      GUIDANCE,
      { markers: false }
    );
    assert.equal(notes.length, 1);
    assert.match(notes[0], new RegExp(`^shrank: .*${path('Beta')}`));
    assert.deepEqual(outcome.failures, []);
  });

  it('fails an empty reason, a repeated path and a stale path', () => {
    const base = {
      [MANIFEST_PATH]: ROWS('Alpha', 'Beta', 'Gamma'),
      [path('Beta')]: COMPONENT(),
      [path('Gamma')]: FOUNDRY_READ,
      [PUBLISHED_MANIFEST_PATH]: PUBLISHED('Beta'),
      ...files(),
    };
    const head = {
      [EXCLUSIONS_PATH]: LIST(['Alpha', ' '.repeat(3)], ['Alpha'], ['Beta'], ['Gamma'], ['Delta']),
    };
    const outcome = ratchetOf(repoWith({ ...base, [EXCLUSIONS_PATH]: LIST() }, head));
    assert.deepEqual(outcome.failures, [
      `${path('Alpha')} has no reason of the form "<code>: <text>"`,
      `${path('Alpha')} is listed twice`,
      `${path('Beta')} is listed and published`,
      `${path('Gamma')} is listed and fails a static rule: ${path('Gamma')}: reads game`,
      `${path('Delta')} is listed and is no design-system candidate`,
    ]);
  });

  it('fails a reason outside the closed set, and a part-of naming no row', () => {
    const rows = [
      ['Alpha', 'because: it is hard.'],
      ['Beta', 'part-of:src/Nowhere.svelte: held inside it.'],
      ['Gamma', 'pending:2601: a number without the hash.'],
    ];
    const state = repoWith(
      {
        [MANIFEST_PATH]: ROWS('Alpha', 'Beta', 'Gamma'),
        [path('Beta')]: COMPONENT(),
        [path('Gamma')]: COMPONENT(),
        [EXCLUSIONS_PATH]: LIST(),
        ...files(),
      },
      { [EXCLUSIONS_PATH]: LIST(...rows) }
    );
    const { failures } = ratchetOf(state);
    assert.deepEqual(failures, [
      `${path('Alpha')} has no reason of the form "<code>: <text>"`,
      `${path('Beta')} is part of src/Nowhere.svelte, which is no design-system row`,
      `${path('Gamma')} has no reason of the form "<code>: <text>"`,
    ]);
  });
});

describe('the static rules of a publishable component', () => {
  const faultsOf = (sources, root, manifest = []) =>
    publishableFaults(root, { manifest, reader: syntheticReader(sources) });

  it('accepts a plain component, and rejects a Foundry read anywhere in its closure', () => {
    const plain = { 'src/A.svelte': COMPONENT() };
    assert.deepEqual(faultsOf(plain, 'src/A.svelte'), []);
    const sources = {
      'src/A.svelte': COMPONENT("import { read } from './read.js';"),
      'src/read.js': 'export const read = () => game.i18n;',
    };
    assert.deepEqual(faultsOf(sources, 'src/A.svelte'), ['src/read.js: reads game']);
  });

  it('rejects a control that rule 9 does not admit, and an unpinned svelte:element', () => {
    assert.deepEqual(
      faultsOf(
        { 'src/A.svelte': COMPONENT('', '<button type="button">go</button>') },
        'src/A.svelte'
      ),
      ['src/A.svelte: button does not state data-keyboard-focus="true"']
    );
    assert.deepEqual(
      faultsOf(
        { 'src/A.svelte': COMPONENT('let { host } = $props();', '<svelte:element this={host} />') },
        'src/A.svelte'
      ),
      ['src/A.svelte: svelte:element has no pinned tags']
    );
  });

  it('rejects a required prop no shipped kind carries, and accepts a default', () => {
    const faults = (script, body = '<div>x</div>') =>
      faultsOf({ 'src/A.svelte': COMPONENT(script, body) }, 'src/A.svelte');
    assert.deepEqual(faults('let { row } = $props();', '{@render row(1)}'), [
      'src/A.svelte: required prop "row" is a snippet called with arguments',
    ]);
    assert.deepEqual(faults('let { Icon } = $props();', '<Icon />'), [
      'src/A.svelte: required prop "Icon" is a component',
    ]);
    assert.deepEqual(faults('let { row = null } = $props();', '{@render row?.(1)}'), []);
    assert.deepEqual(faults('let { body } = $props();', '{@render body()}'), []);
  });

  it('rejects a closure that resolves the overlay host outside the chain', () => {
    const sources = {
      'src/A.svelte': COMPONENT("import { resolveOverlayHost } from './overlayHost.js';"),
      'src/overlayHost.js': 'export const resolveOverlayHost = () => null;',
    };
    assert.deepEqual(faultsOf(sources, 'src/A.svelte'), [
      'src/A.svelte imports resolveOverlayHost, which ignores the overlay chain',
    ]);
  });

  it('answers a path the side does not hold as one that does not exist', () => {
    const reader = { ...syntheticReader({}), has: () => false };
    assert.deepEqual(publishableFaults('src/Gone.svelte', { manifest: [], reader }), [
      'src/Gone.svelte does not exist',
    ]);
  });

  it('holds the shipped closures to the rules they publish under', () => {
    const { manifest, reader } = contextAt(REPO_ROOT);
    assert.deepEqual(manifest, JSON.parse(JSON.stringify(PUBLISHED_COMPONENT_MANIFEST)));
    for (const entry of manifest) {
      assert.deepEqual(publishableFaults(entry.path, { manifest, reader }), [], entry.name);
    }
  });
});

describe('the per-item spreads of a published closure', () => {
  const ENTRY = {
    name: 'Fx',
    path: 'src/Fx.svelte',
    props: { items: { kind: 'data' }, tone: { kind: 'text' } },
  };
  const idsOf = (script, body, extra = {}) =>
    itemSpreadIds(ENTRY, syntheticReader({ 'src/Fx.svelte': COMPONENT(script, body), ...extra }));
  const PROPS = 'let { items = [], tone = "", ...rest } = $props();';

  it('names a spread off an each item by its entry, key and member', () => {
    assert.deepEqual(idsOf(PROPS, '{#each items as item}<span {...item.props}></span>{/each}'), [
      'Fx.items.props',
    ]);
  });

  it('follows nested each blocks and a spread off a published data local', () => {
    assert.deepEqual(
      idsOf(
        PROPS,
        '{#each items as tier}{#each tier.yields as item}<i {...item.props}></i>{/each}{/each}<b {...items.extra}></b>'
      ),
      ['Fx.items.extra', 'Fx.items.yields.props']
    );
  });

  it('ignores the rest spread and a text key', () => {
    assert.deepEqual(idsOf(PROPS, '<div {...rest}></div><u {...tone.x}></u>'), []);
  });

  it('ignores a spread of a script-level local', () => {
    assert.deepEqual(
      idsOf(
        `${PROPS} const attrs = $derived({ a: 1 }); const { b, ...others } = $derived(rest);`,
        '<div {...rest}></div><u {...attrs}></u><s {...others}></s><i {...b.x}></i>'
      ),
      []
    );
  });

  it('cannot name a spread off an item of a collection the entry does not publish', () => {
    assert.deepEqual(idsOf(PROPS, '{#each [1, 2] as item}<span {...item.props}></span>{/each}'), [
      'src/Fx.svelte: a spread of an item the entry does not publish',
    ]);
  });

  describe('fails closed on a spread of', () => {
    const UNNAMED = 'src/Fx.svelte: a spread of an item the entry does not publish';
    const WHOLE = 'src/Fx.svelte: a spread of a whole item of Fx.items';
    const cases = {
      'a whole item': ['{#each items as item}<i {...item}></i>{/each}', [WHOLE]],
      'a published data local': ['<i {...items}></i>', [WHOLE]],
      'a destructured each context': [
        '{#each items as { props }}<i {...props}></i>{/each}',
        ['Fx.items.props'],
      ],
      'a nested destructured member': [
        '{#each items as { props: { extra } }}<i {...extra}></i>{/each}',
        ['Fx.items.props.extra'],
      ],
      'an @const alias': [
        '{#each items as item}{@const p = item.props}<i {...p}></i>{/each}',
        ['Fx.items.props'],
      ],
      'a nullish fallback': [
        '{#each items as item}<i {...(item.props ?? {})}></i>{/each}',
        [UNNAMED],
      ],
      'a call': ['{#each items as item}<i {...pick(item)}></i>{/each}', [UNNAMED]],
      'an each over a script-level derived': [
        '{#each mapped as m}<i {...m.attrs}></i>{/each}',
        [UNNAMED],
      ],
      'a snippet parameter rendered with an item': [
        '{#snippet row(o)}<i {...o.props}></i>{/snippet}{#each items as item}{@render row(item)}{/each}',
        ['Fx.items.props'],
      ],
      'a snippet parameter rendered with an optional call': [
        '{#snippet row(o)}<i {...o.props}></i>{/snippet}{#each items as item}{@render row?.(item)}{/each}',
        ['Fx.items.props'],
      ],
      'a snippet parameter of a snippet nothing renders': [
        '{#snippet row(o)}<i {...o.props}></i>{/snippet}',
        [UNNAMED],
      ],
      'a snippet parameter rendered through an alias': [
        '{#snippet row(o)}<i {...o.props}></i>{/snippet}{@const draw = row}{#each items as item}{@render draw(item)}{/each}',
        [UNNAMED],
      ],
      'a snippet parameter rendered with call': [
        '{#snippet row(o)}<i {...o.props}></i>{/snippet}{#each items as item}{@render row.call(null, item)}{/each}',
        [UNNAMED],
      ],
      'a computed member of an item': [
        '{#each items as item}<i {...item[tone]}></i>{/each}',
        [UNNAMED],
      ],
      'an array-pattern each context': [
        '{#each items as [first]}<i {...first}></i>{/each}',
        [UNNAMED],
      ],
      'an optional-chained member': [
        '{#each items as item}<i {...item?.props}></i>{/each}',
        ['Fx.items.props'],
      ],
    };
    for (const [shape, [body, expected]] of Object.entries(cases)) {
      it(shape, () => {
        const script = `${PROPS} const mapped = $derived(items.map((i) => i)); const pick = (i) => i;`;
        assert.deepEqual(idsOf(script, body), expected);
      });
    }

    it('an item a child component is given', () => {
      const extra = {
        'src/Row.svelte': COMPONENT('let { item } = $props();', '<i {...item.props}></i>'),
      };
      assert.deepEqual(
        idsOf(
          `import Row from './Row.svelte'; ${PROPS}`,
          '{#each items as item}<Row {item} />{/each}',
          extra
        ),
        ['Fx.items.props']
      );
    });

    it('an item bound to a child component through bind:', () => {
      const extra = {
        'src/Row.svelte': COMPONENT(
          'let { item = $bindable() } = $props();',
          '<i {...item.props}></i>'
        ),
      };
      assert.deepEqual(
        idsOf(
          `import Row from './Row.svelte'; ${PROPS}`,
          '{#each items as item}<Row bind:item />{/each}',
          extra
        ),
        ['Fx.items.props']
      );
    });

    it('a child prop whose parents pass no item', () => {
      const extra = {
        'src/Row.svelte': COMPONENT('let { attrs } = $props();', '<i {...attrs}></i>'),
      };
      assert.deepEqual(
        idsOf(
          `import Row from './Row.svelte'; ${PROPS} const attrs = $derived({});`,
          '<Row {attrs} />',
          extra
        ),
        []
      );
    });

    it('a snippet parameter read through nested members', () => {
      assert.deepEqual(
        idsOf(
          PROPS,
          '{#snippet log(entry)}<i {...entry.outcome.props}></i>{/snippet}{#each items as entry}{@render log(entry)}{/each}'
        ),
        ['Fx.items.outcome.props']
      );
    });

    it('a snippet the entry declares and a child component renders', () => {
      const list = {
        'src/List.svelte': COMPONENT(
          'let { items, row } = $props();',
          '{#each items as it}{@render row(it)}{/each}'
        ),
      };
      const script = `import List from './List.svelte'; ${PROPS}`;
      const SNIPPET = '{#snippet row(o)}<i {...o.props}></i>{/snippet}';
      const inside = '<List {items}>' + SNIPPET + '</List>';
      const passed = SNIPPET + '<List {items} {row} />';
      assert.deepEqual(idsOf(script, inside, list), [UNNAMED]);
      assert.deepEqual(idsOf(script, passed, list), [UNNAMED]);
    });

    it('but not a snippet parameter of a child component', () => {
      const extra = {
        'src/Row.svelte': COMPONENT(
          'let { rows } = $props();',
          '{#snippet row(option)}<i {...option.data}></i>{/snippet}{#each rows as r}{@render row(r)}{/each}'
        ),
      };
      assert.deepEqual(
        idsOf(`import Row from './Row.svelte'; ${PROPS}`, '<Row rows={tone} />', extra),
        []
      );
    });
  });

  it('fails a spread no row strips, and a row no closure spreads', () => {
    const manifest = [ENTRY];
    const reader = syntheticReader({
      'src/Fx.svelte': COMPONENT(
        PROPS,
        '{#each items as item}<span {...item.props}></span>{/each}'
      ),
    });
    assert.deepEqual(strippedMemberFaults({ manifest, reader }, ['Fx.items.props']), []);
    assert.deepEqual(strippedMemberFaults({ manifest, reader }, []), [
      'Fx.items.props is spread per item and not stripped: add it to STRIPPED_ITEM_MEMBERS',
    ]);
    assert.deepEqual(
      strippedMemberFaults({ manifest, reader }, ['Fx.items.props', 'Fx.items.meta']),
      ['Fx.items.meta is stripped and no published closure spreads it']
    );
    assert.deepEqual(strippedMemberFaults({ manifest: [], reader }, ['Fx.items.props']), [
      'Fx.items.props is stripped and no published closure spreads it',
    ]);
  });

  it('says no row can name a spread it cannot name', () => {
    const reader = syntheticReader({
      'src/Fx.svelte': COMPONENT(PROPS, '{#each items as item}<i {...item}></i>{/each}'),
    });
    assert.deepEqual(strippedMemberFaults({ manifest: [ENTRY], reader }, []), [
      'src/Fx.svelte: a spread of a whole item of Fx.items: no STRIPPED_ITEM_MEMBERS row can name it; spread a member of a published data key, or drop the spread',
    ]);
  });
});
