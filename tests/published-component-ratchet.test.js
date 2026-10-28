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

  it('admits a form control name unique to its mount, and refuses a literal or a published-key name', () => {
    const SCRIPT = 'let { group = "", label = "" } = $props(); const uid = $props.id();';
    const radio = (name) => `<input type="radio" ${name} />`;
    const faults = (body, script = SCRIPT, manifest = []) =>
      faultsOf({ 'src/A.svelte': COMPONENT(script, body) }, 'src/A.svelte', manifest);
    const STATES = ['src/A.svelte: input states name'];
    assert.deepEqual(faults(radio('name={`a-${uid}`}')), [], 'a template reading the mount id');
    const derived = `${SCRIPT} const name = $derived(group || \`a-\${uid}\`);`;
    assert.deepEqual(
      faults(radio('{name}'), derived),
      [],
      'an unpublished blank prop, else the id'
    );
    assert.deepEqual(faults(radio('name="a"')), STATES, 'a literal');
    assert.deepEqual(faults(radio('name={group}')), STATES, 'a prop with no unique fallback');
    assert.deepEqual(faults(radio('name={group ?? `a-${uid}`}')), STATES, '?? keeps a blank prop');
    assert.deepEqual(
      faults(radio('name={label ? `a-${uid}` : "a"}')),
      STATES,
      'a conditional with one shared branch'
    );
    const child = faultsOf(
      {
        'src/A.svelte': COMPONENT("import B from './B.svelte';", '<B />'),
        'src/B.svelte': COMPONENT(SCRIPT, radio('name={group || `a-${uid}`}')),
      },
      'src/A.svelte'
    );
    assert.deepEqual(child, ['src/B.svelte: input states name'], 'a closure child’s prop fallback');
    const published = [{ name: 'A', path: 'src/A.svelte', props: { group: { kind: 'data' } } }];
    assert.deepEqual(
      faults(radio('name={group || `a-${uid}`}'), SCRIPT, published),
      STATES,
      'a published key'
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

  it('reads an object literal by its computed keys: an unpublished prop key is no item, a published one is, and a fixed key fails closed', () => {
    const script = 'let { items = [], tone = "", hook = "", ...rest } = $props();';
    assert.deepEqual(
      idsOf(script, '{#each items as item}<i {...{ [hook]: item.id }}></i>{/each}'),
      []
    );
    assert.deepEqual(
      idsOf(script, `<button {...{ type: 'submit' }}></button>`),
      ['src/Fx.svelte: a spread of an item the entry does not publish'],
      'a fixed key, which no attribute rule reads, is a spread the gate cannot name'
    );
    assert.deepEqual(idsOf(script, '<i {...{ [items]: 1 }}></i>'), [
      'src/Fx.svelte: a spread of a whole item of Fx.items',
    ]);
    assert.deepEqual(idsOf(script, '{#each items as item}<i {...{ ...item.props }}></i>{/each}'), [
      'Fx.items.props',
    ]);
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

    it('a snippet the entry declares and a child component renders, as the child renders it', () => {
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
      assert.deepEqual(idsOf(script, inside, list), ['Fx.items.props']);
      assert.deepEqual(idsOf(script, passed, list), ['Fx.items.props']);
    });

    it('a snippet a child renders with an object of its own values, read by the member spread (issue 2647)', () => {
      const picker = (render) => ({
        'src/Picker.svelte': COMPONENT(
          'let { trigger } = $props(); const own = $derived({ type: "button" });',
          render
        ),
      });
      const script = `import Picker from './Picker.svelte'; ${PROPS}`;
      const SNIPPET =
        '<Picker>{#snippet trigger({ attributes })}<b {...attributes}></b>{/snippet}</Picker>';
      assert.deepEqual(
        idsOf(script, SNIPPET, picker('{@render trigger({ attributes: own })}')),
        []
      );
      assert.deepEqual(
        idsOf(
          script,
          SNIPPET,
          picker('{#each items as it}{@render trigger({ attributes: it })}{/each}')
        ),
        [UNNAMED],
        'an item of the child’s own collection is still unnameable'
      );
      assert.deepEqual(idsOf(script, SNIPPET, picker('<p></p>')), [UNNAMED], 'and so is no render');
    });

    it('a child literal spreading its own prop, judged by what the entry passes it (issue 2647)', () => {
      const RENDER = '{@render trigger({ attributes: own })}';
      const picker = (own, body = RENDER) => ({
        'src/Picker.svelte': COMPONENT(
          `let { trigger, extra } = $props(); const pick = (v) => v; const own = $derived(${own});`,
          body
        ),
      });
      const script = `import Picker from './Picker.svelte'; ${PROPS}`;
      const handing = (passed) =>
        `<Picker ${passed}>{#snippet trigger({ attributes })}<b {...attributes}></b>{/snippet}</Picker>`;
      assert.deepEqual(idsOf(script, handing('extra={items[0]}'), picker('{ ...extra }')), [
        UNNAMED,
      ]);
      const props = handing('extra={items.props}');
      assert.deepEqual(idsOf(script, props, picker('{ type: "b", ...(tone ? extra : {}) }')), [
        'Fx.items.props',
      ]);
      assert.deepEqual(idsOf(script, props, picker('{ ...pick(extra) }')), ['Fx.items.props']);
      assert.deepEqual(
        idsOf(script, props, picker('{ ...extra }', '<i {...own}></i>')),
        ['Fx.items.props', UNNAMED],
        'the child’s own spread of it is judged too, beside the snippet nothing renders'
      );
      assert.deepEqual(
        idsOf(script, handing(''), picker('{ ...extra, type: "b" }')),
        [],
        'a prop the entry does not pass is no item'
      );
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

  describe('fails closed on a script local derived from published data (issue 2607)', () => {
    const UNNAMED = 'src/Fx.svelte: a spread of an item the entry does not publish';
    const WHOLE = 'src/Fx.svelte: a spread of a whole item of Fx.items';
    const cases = {
      'a const alias of an item': [
        'const first = items[0];',
        '<i {...first.props}></i>',
        [UNNAMED],
      ],
      'a $derived alias of an item': [
        'const first = $derived(items[0]);',
        '<i {...first.props}></i>',
        [UNNAMED],
      ],
      'a $derived.by alias of an item': [
        'const first = $derived.by(() => items[0]);',
        '<i {...first.props}></i>',
        [UNNAMED],
      ],
      'a destructured item': ['const { props } = items[0];', '<i {...props}></i>', [UNNAMED]],
      'an alias of an alias': [
        'const first = items[0]; const again = first;',
        '<i {...again.props}></i>',
        [UNNAMED],
      ],
      'a mapped copy of the items': [
        'const copies = $derived(items.map((o) => ({ ...o })));',
        '<i {...copies[0]}></i>',
        [UNNAMED],
      ],
      'a literal spreading a call on the items': [
        'const attrs = $derived({ ...items.at(0) });',
        '<i {...attrs}></i>',
        [WHOLE],
      ],
      'a conditional with one branch that is an item': [
        'const attrs = $derived(tone ? { a: 1 } : items[0]);',
        '<i {...attrs}></i>',
        [UNNAMED],
      ],
    };
    for (const [shape, [script, body, expected]] of Object.entries(cases)) {
      it(shape, () => assert.deepEqual(idsOf(`${PROPS} ${script}`, body), expected));
    }

    it('an alias of the item a child component is given', () => {
      const row = {
        'src/Row.svelte': COMPONENT(
          'let { item } = $props(); const first = $derived(item);',
          '<i {...first.props}></i>'
        ),
      };
      assert.deepEqual(
        idsOf(
          `import Row from './Row.svelte'; ${PROPS}`,
          '{#each items as item}<Row {item} />{/each}',
          row
        ),
        ['src/Row.svelte: a spread of an item the entry does not publish']
      );
    });

    const passing = {
      'a constant': 'const attrs = 5;',
      'a derived string of a text prop': 'const attrs = $derived(`${tone}x`);',
      'the rest props': 'const attrs = $derived(rest);',
      'a literal under a condition': 'const attrs = $derived(tone ? { a: items.length } : {});',
      'a map to literals keyed by a text prop':
        'const attrs = $derived(items.map((o) => (tone ? { [tone]: o.v } : {})));',
    };
    for (const [shape, script] of Object.entries(passing)) {
      it(`names no item for ${shape}`, () => {
        assert.deepEqual(idsOf(`${PROPS} ${script}`, '<i {...attrs[0]} {...attrs}></i>'), []);
      });
    }
  });

  describe('fails closed on an alias of a value the tracer cannot name (issue 2607)', () => {
    const UNNAMED = 'src/Fx.svelte: a spread of an item the entry does not publish';
    const IN_ROW = 'src/Row.svelte: a spread of an item the entry does not publish';
    const row = {
      'src/Row.svelte': COMPONENT(
        'let { item } = $props(); const attrs = $derived(item.props);',
        '<i {...attrs}></i>'
      ),
    };
    const script = `import Row from './Row.svelte'; ${PROPS}`;
    const each = (tag) => `{#each items as item}${tag}{/each}`;

    const drawn = {
      'a child drawn through svelte:component': [
        script,
        each('<svelte:component this={Row} {item} />'),
      ],
      'a child drawn through an {@const} alias': [script, each('{@const C = Row}<C {item} />')],
      'an item of a derived collection': [
        `${script} const sorted = $derived(items.toSorted((a, b) => a.n - b.n));`,
        '{#each sorted as s}<Row item={s} />{/each}',
      ],
      'an item picked by index': [script, '<Row item={items[0]} />'],
    };
    for (const [shape, [code, body]] of Object.entries(drawn)) {
      it(`an alias of a prop passed ${shape}`, () => {
        assert.deepEqual(idsOf(code, body, row), [IN_ROW]);
      });
    }

    it('an alias of a let that holds an item', () => {
      const code = `${PROPS} let sel = $state(items[0]); const shown = $derived(sel);`;
      assert.deepEqual(idsOf(code, '<i {...shown.props}></i>'), [UNNAMED]);
      assert.deepEqual(idsOf(code, '<i {...sel.props}></i>'), [UNNAMED], 'as the let itself does');
    });

    it('an alias of an object literal that spreads an item', () => {
      const code = `${PROPS} const merged = { ...items[0] }; const again = merged;`;
      assert.deepEqual(idsOf(code, '<i {...again}></i>'), [UNNAMED]);
    });

    it('an alias of an exported const, a class field or a mapped callback’s array', () => {
      const shapes = {
        'an exported const': [
          'export const first = items[0]; const a = $derived(first);',
          '<i {...a}></i>',
        ],
        'a class field': [
          'class S { f = $derived(items[0]); } const s = new S(); const a = $derived(s.f);',
          '<i {...a}></i>',
        ],
        'the array a mapped callback receives': [
          'const copies = $derived(items.map((x, i, arr) => ({ ...arr }))); const again = copies;',
          '<i {...again[0]}></i>',
        ],
      };
      for (const [shape, [alias, body]] of Object.entries(shapes)) {
        assert.deepEqual(idsOf(`${PROPS} ${alias}`, body), [UNNAMED], shape);
      }
    });

    it('but not an alias of an imported call, a constant or a text prop', () => {
      const make = { 'src/make.js': 'export const make = (value) => ({ value });' };
      const code = `import { make } from './make.js'; ${PROPS} const k = 5;`;
      for (const alias of [
        'const a = $derived(make(tone)); const b = a;',
        'const b = $derived(make(k));',
        'const a = $derived(tone); const b = $derived(a + k);',
        'const a = $derived(Math.max(k, 2)); const b = a;',
        'const a = $derived(JSON.stringify(tone)); const b = a;',
      ]) {
        assert.deepEqual(idsOf(`${code} ${alias}`, '<i {...b}></i>', make), [], alias);
      }
    });

    it('a mapped literal binds its parameter like an {#each} context, whatever the name shadows', () => {
      const code = (name) =>
        `let { items = [], tone = '', hook = '', ...rest } = $props(); const k = 1; ` +
        `const copies = $derived(items.map((${name}) => ({ ...${name} })));`;
      for (const name of ['tone', 'hook', 'k', 'rest', 'copies']) {
        assert.deepEqual(idsOf(code(name), '<i {...copies[0]}></i>'), [UNNAMED], name);
      }
    });
  });

  describe('records the shapes the item-spread gate does not trace (issue 2607)', () => {
    const SNIPPET = '{#snippet row(o)}<i {...o.props}></i>{/snippet}';

    it('passes a plain-key value of an object literal, which is not traced', () => {
      const code = `${PROPS} const w = $derived({ items }); const a = w;`;
      assert.deepEqual(idsOf(code, '<i {...a.items[0]}></i>'), []);
    });

    it('passes a derived value that reads the items only through a script function', () => {
      const code = `${PROPS} function pick() { return items[0]; } const first = $derived(pick());`;
      assert.deepEqual(idsOf(code, '<i {...first.props}></i>'), []);
    });

    it('passes a snippet a child forwards through its rest props', () => {
      const files = {
        'src/List.svelte': COMPONENT(
          "import Inner from './Inner.svelte'; let { items, ...rest } = $props();",
          '<Inner {items} {...rest} />'
        ),
        'src/Inner.svelte': COMPONENT(
          'let { items, row } = $props();',
          '{#each items as it}{@render row(it)}{/each}'
        ),
      };
      const body = SNIPPET + '{@render row(1)}<List {items} {row} />';
      assert.deepEqual(idsOf(`import List from './List.svelte'; ${PROPS}`, body, files), []);
    });

    it('passes a child a script module also draws, which no component tag reads', () => {
      const files = {
        'src/Row.svelte': COMPONENT('let { item } = $props();', '<i {...item.props}></i>'),
        'src/registry.js': "import Row from './Row.svelte'; export const registry = { Row };",
      };
      const code = `import Row from './Row.svelte'; import { registry } from './registry.js'; ${PROPS}`;
      const body =
        '<Row item={tone} />{#each items as item}<svelte:component this={registry.Row} {item} />{/each}';
      assert.deepEqual(idsOf(code, body, files), []);
    });
  });

  describe('fails closed on a snippet that goes anywhere but a render (issue 2607)', () => {
    const SNIPPET = '{#snippet row(o)}<i {...o.props}></i>{/snippet}';
    const UNNAMED = 'src/Fx.svelte: a spread of an item the entry does not publish';
    const script = `import List from './List.svelte'; ${PROPS}`;
    const list = (body, own = '') => ({
      'src/List.svelte': COMPONENT(
        `import Inner from './Inner.svelte'; let { items, row } = $props(); ${own}`,
        body
      ),
      'src/Inner.svelte': COMPONENT(
        'let { items, row } = $props();',
        '{#each items as it}{@render row(it)}{/each}'
      ),
    });
    const RENDERS = '{#each items as it}{@render row(it)}{/each}';
    const GIVEN = SNIPPET + '<List {items} {row} />';
    const traced = ['Fx.items.props'];

    it('a child that renders it and hands it on', () => {
      const hands = list(RENDERS + '<Inner {items} {row} />');
      assert.deepEqual(idsOf(script, GIVEN, hands), ['Fx.items.props', UNNAMED]);
    });

    it('a child that renders it through an alias', () => {
      const aliased = list(
        '{@render row(1)}{#each items as it}{@render draw(it)}{/each}',
        'const draw = row;'
      );
      assert.deepEqual(idsOf(script, GIVEN, aliased), [UNNAMED]);
    });

    it('a child that keeps it in an array beside a render of its own', () => {
      const kept = list('{@render row(1)}', 'const [first] = [row];');
      assert.deepEqual(idsOf(script, GIVEN, kept), [UNNAMED]);
    });

    it('an alias in the entry beside a render of its own', () => {
      const body = SNIPPET + '{@render row(1)}{@const draw = row}<List {items} row={draw} />';
      assert.deepEqual(idsOf(script, body, list(RENDERS)), [UNNAMED]);
    });

    it('but a test of the snippet in the child, or the snippet handed by name or inside the tag, is traced', () => {
      const tested = list('{#if row}' + RENDERS + '{/if}');
      assert.deepEqual(idsOf(script, GIVEN, tested), traced);
      assert.deepEqual(idsOf(script, SNIPPET + '<List {items} row={row} />', tested), traced);
      assert.deepEqual(idsOf(script, '<List {items}>' + SNIPPET + '</List>', tested), traced);
    });
  });

  describe('fails closed on a child it cannot see the parent props of (issue 2607)', () => {
    const row = {
      'src/Row.svelte': COMPONENT('let { item } = $props();', '<i {...item.props}></i>'),
    };
    const script = `import Row from './Row.svelte'; ${PROPS}`;
    const UNNAMED = 'src/Row.svelte: a spread of an item the entry does not publish';
    const each = (tag) => `{#each items as item}${tag}{/each}`;

    it('a child drawn through svelte:component', () => {
      assert.deepEqual(idsOf(script, each('<svelte:component this={Row} {item} />'), row), [
        UNNAMED,
      ]);
    });

    it('a child drawn through an {@const} alias of its component', () => {
      assert.deepEqual(idsOf(script, each('{@const C = Row}<C {item} />'), row), [UNNAMED]);
    });

    it('a child drawn through a script alias beside a tag that passes the item', () => {
      assert.deepEqual(idsOf(`${script} const C = Row;`, each('<Row {item} /><C {item} />'), row), [
        'Fx.items.props',
        UNNAMED,
      ]);
    });

    it('a child no component tag draws', () => {
      assert.deepEqual(idsOf(script, '<p></p>', row), [UNNAMED]);
    });

    it('but an item passed in quotes is traced, and one mixed with text is a string', () => {
      assert.deepEqual(idsOf(script, each('<Row item="{item}" />'), row), ['Fx.items.props']);
      assert.deepEqual(idsOf(script, each('<Row item="a{item}" />'), row), []);
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
