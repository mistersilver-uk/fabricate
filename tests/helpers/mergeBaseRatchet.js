/**
 * The merge-base ratchet: a gate measures its corpus at the base commit and in the working tree,
 * and fails only on an entry that appeared or got worse, unless its site carries a
 * `ratchet-exempt(<family>): <reason>` marker. Proved by `tests/merge-base-ratchet.test.js`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveExecutable } from '../../scripts/lib/resolveExecutable.js';

import { byCodePoint } from './codePointOrder.js';
import { keyByAlignment, netOfSiteMarkers, siteText } from './siteMarkers.js';
import { envWithoutGitLocation } from './temp-git-repo.js';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** A rename below this similarity is a deletion plus an addition. */
export const RENAME_THRESHOLD = '40%';

const GIT = resolveExecutable('git');
const GIT_BUFFER = 512 * 1024 * 1024;
const FAMILY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REFRESH_HINT =
  'run `git fetch origin main`, or set RATCHET_BASE to the commit to compare with';

function gitOptions(extra = {}) {
  if (!GIT) throw new Error('git is not on an absolute PATH entry');
  return { env: envWithoutGitLocation(), maxBuffer: GIT_BUFFER, ...extra };
}

/** Run git and return stdout, throwing with git's own stderr on any failure. */
function git(cwd, args) {
  try {
    return execFileSync(GIT, ['-C', cwd, ...args], gitOptions({ encoding: 'utf8', stdio: 'pipe' }));
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim();
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${detail}`, { cause: error });
  }
}

/** The commit `ref` names, or `null` when it names none. */
function tryCommit(cwd, ref) {
  const args = [
    '-C',
    cwd,
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    // eslint-disable-next-line unicorn/no-incorrect-template-string-interpolation -- git's peel suffix
    `${ref}^{commit}`,
  ];
  const result = spawnSync(GIT, args, gitOptions({ encoding: 'utf8' }));
  return result.status === 0 ? result.stdout.trim() : null;
}

function tryMergeBase(cwd, left, right) {
  const result = spawnSync(
    GIT,
    ['-C', cwd, 'merge-base', left, right],
    gitOptions({ encoding: 'utf8' })
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

function isCi(env) {
  return [env.CI, env.GITHUB_ACTIONS].some(
    (flag) => flag !== undefined && !['', '0', 'false'].includes(String(flag).trim().toLowerCase())
  );
}

/**
 * The commit every ratchet compares with: `RATCHET_BASE` when set, else the merge base of HEAD and
 * `origin/main`. `RATCHET_BASE=none` opts out; an unresolvable `RATCHET_BASE`, or in CI no base or
 * a merge base that is HEAD itself, throws; locally with no base the result is a skip naming the fix.
 *
 * @returns {{sha: string, head: string, source: string, equalsHead: boolean}
 *   | {skipped: string, reason: string}}
 */
export function resolveRatchetBase({ cwd = REPO_ROOT, env = process.env } = {}) {
  const requested = String(env.RATCHET_BASE ?? '').trim();
  if (requested === 'none') {
    return { skipped: 'opted-out', reason: 'RATCHET_BASE=none opts this run out of the ratchets' };
  }
  const head = tryCommit(cwd, 'HEAD');
  if (!head) throw new Error(`HEAD does not name a commit in ${cwd}`);
  if (requested !== '') {
    const sha = tryCommit(cwd, requested);
    if (!sha) {
      throw new Error(
        `RATCHET_BASE=${requested} does not resolve to a commit in ${cwd}, and a ratchet that ` +
          'cannot read its base fails rather than passing unchecked. Fetch that commit (CI ' +
          'checks out with fetch-depth: 2), or unset RATCHET_BASE to use origin/main.'
      );
    }
    return { sha, head, source: 'RATCHET_BASE', equalsHead: sha === head };
  }
  const main = tryCommit(cwd, 'origin/main');
  const sha = main && tryMergeBase(cwd, head, main);
  if (sha === head && isCi(env)) {
    throw new Error(
      'the merge base with origin/main is HEAD itself, so a CI ratchet would compare nothing. Set ' +
        'RATCHET_BASE (ci.yml sets HEAD^1), or RATCHET_BASE=none on a job that deliberately runs ' +
        'without one.'
    );
  }
  if (sha) return { sha, head, source: 'merge-base', equalsHead: sha === head };
  const why = main ? 'HEAD and origin/main share no merge base' : 'origin/main does not resolve';
  if (isCi(env)) {
    throw new Error(
      `${why}, and a CI run never skips a ratchet. Set RATCHET_BASE (ci.yml sets HEAD^1), or ` +
        'RATCHET_BASE=none on a job that deliberately runs without one.'
    );
  }
  return { skipped: 'no-base', reason: `${why}, so the ratchets were skipped: ${REFRESH_HINT}.` };
}

const shaOf = (base) => (typeof base === 'string' ? base : base.sha);

function nulSeparated(text) {
  return text.split('\0').filter((part) => part !== '');
}

/**
 * The working tree against `base`: tracked edits committed or not, and untracked files that
 * `.gitignore` does not exclude. A rename is detected at {@link RENAME_THRESHOLD} similarity.
 *
 * @returns {{changed: string[], added: string[], removed: string[], renames: Map<string, string>}}
 *   `changed` is every differing head path, `added` those with no base counterpart, `removed` the
 *   base paths deleted outright, and `renames` maps a head path to its base path.
 */
export function changedPaths(base, { cwd = REPO_ROOT } = {}) {
  const diff = nulSeparated(
    git(cwd, [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-relative',
      '--name-status',
      '-z',
      `--find-renames=${RENAME_THRESHOLD}`,
      shaOf(base),
      '--',
    ])
  );
  const changed = new Set();
  const added = new Set();
  const removed = new Set();
  const renames = new Map();
  for (let index = 0; index < diff.length; ) {
    const status = diff[index][0];
    if (status === 'R' || status === 'C') {
      const [from, to] = [diff[index + 1], diff[index + 2]];
      changed.add(to);
      if (status === 'R') renames.set(to, from);
      else added.add(to);
      index += 3;
      continue;
    }
    const file = diff[index + 1];
    if (status === 'D') removed.add(file);
    else changed.add(file);
    if (status === 'A') added.add(file);
    index += 2;
  }
  for (const file of nulSeparated(git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']))) {
    changed.add(file);
    added.add(file);
  }
  const sorted = (set) => [...set].sort(byCodePoint);
  return { changed: sorted(changed), added: sorted(added), removed: sorted(removed), renames };
}

/** The base path of a changed head path: its rename source, itself, or `null` when it is new. */
export function basePathOf(changes, file) {
  if (changes.renames.has(file)) return changes.renames.get(file);
  return changes.added.includes(file) ? null : file;
}

/**
 * The blobs at `paths` in `base`, read through one `git cat-file --batch` process. A path absent
 * at base is omitted from the result.
 *
 * @returns {Map<string, string>} path to UTF-8 text.
 */
export function readBaseFiles(base, paths, { cwd = REPO_ROOT } = {}) {
  const files = new Map();
  if (paths.length === 0) return files;
  const sha = shaOf(base);
  for (const file of paths) {
    if (/\n/u.test(file)) throw new Error(`cannot batch-read a path with a newline: ${file}`);
  }
  const result = spawnSync(
    GIT,
    ['-C', cwd, 'cat-file', '--batch'],
    gitOptions({ input: paths.map((file) => `${sha}:${file}\n`).join('') })
  );
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? String(result.stderr).trim();
    throw new Error(`git cat-file --batch failed in ${cwd}: ${detail}`, { cause: result.error });
  }
  const output = result.stdout;
  let offset = 0;
  for (const file of paths) {
    const newline = output.indexOf(0x0a, offset);
    if (newline === -1) throw new Error(`git cat-file --batch ended before ${file}`);
    const header = /^[0-9a-f]+ ([a-z]+) (\d+)$/u.exec(output.toString('utf8', offset, newline));
    offset = newline + 1;
    if (!header) continue;
    const end = offset + Number(header[2]);
    if (header[1] === 'blob') files.set(file, output.toString('utf8', offset, end));
    offset = end + 1;
  }
  return files;
}

function underRoot(root) {
  if (root === '.' || root === '') return () => true;
  return (file) => file === root || file.startsWith(`${root}/`);
}

function listBaseFiles(base, root, cwd) {
  const listed = git(cwd, ['ls-tree', '-r', '-z', '--name-only', shaOf(base), '--', root || '.']);
  return nulSeparated(listed).sort(byCodePoint);
}

function listHeadFiles(root, cwd) {
  const args = ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', root || '.'];
  const deleted = new Set(
    nulSeparated(git(cwd, ['ls-files', '--deleted', '-z', '--', root || '.']))
  );
  return [...new Set(nulSeparated(git(cwd, args)))]
    .filter((file) => !deleted.has(file))
    .sort(byCodePoint);
}

/**
 * Every file under `root` at `base` that `include` accepts, read in one batch.
 *
 * @returns {Map<string, string>} path to UTF-8 text.
 */
export function readBaseCorpus(base, root, { cwd = REPO_ROOT, include = () => true } = {}) {
  return readBaseFiles(
    base,
    listBaseFiles(base, root, cwd).filter((path) => include(path)),
    { cwd }
  );
}

function readHeadFile(cwd, file) {
  try {
    return readFileSync(path.join(cwd, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/** A base reader over a preloaded batch, fetching any other path it is asked for on demand. */
function baseReader(base, preloaded, cwd) {
  return (file) => {
    if (!preloaded.has(file)) {
      preloaded.set(file, readBaseFiles(base, [file], { cwd }).get(file));
    }
    return preloaded.get(file);
  };
}

const MARKER_FORMS = Object.freeze({
  line: Object.freeze({ open: '//', close: null }),
  block: Object.freeze({ open: '/*', close: '*/' }),
  markup: Object.freeze({ open: '<!--', close: '-->' }),
});

/** Which comment forms carry a marker, by extension; a Svelte file holds all three languages. */
const FORMS_BY_EXTENSION = Object.freeze({
  '.cjs': ['line'],
  '.css': ['block'],
  '.html': ['markup'],
  '.js': ['line'],
  '.md': ['markup'],
  '.mjs': ['line'],
  '.svelte': ['markup', 'line', 'block'],
});

const MARKER_BODY = /^\s*ratchet-exempt\(([^)]*)\)(.*)$/u;

function markersOnLine(text, line, forms) {
  const found = [];
  for (const form of forms) {
    const { open, close } = MARKER_FORMS[form];
    for (let at = text.indexOf(open); at !== -1; at = text.indexOf(open, at + 1)) {
      const match = MARKER_BODY.exec(text.slice(at + open.length));
      if (!match) continue;
      let tail = match[2];
      if (close && tail.includes(close)) tail = tail.slice(0, tail.indexOf(close));
      const reason = tail.startsWith(':') ? tail.slice(1).trim() : '';
      found.push({ line, family: match[1].trim(), reason });
    }
  }
  return found;
}

/**
 * The `ratchet-exempt(<family>): <reason>` markers in `text`, by the comment forms `file`'s type
 * admits: `//` in JS, `/* *\/` in CSS, `<!-- -->` in HTML and Markdown, and all three in Svelte.
 *
 * @returns {{line: number, family: string, reason: string}[]} 1-based lines; `reason` is empty
 *   when the marker gave none.
 */
export function parseMarkers(file, text) {
  const forms = FORMS_BY_EXTENSION[path.extname(file)] ?? [];
  if (forms.length === 0 || !/ratchet-exempt\(/u.test(text)) return [];
  return String(text)
    .split('\n')
    .flatMap((content, index) => markersOnLine(content, index + 1, forms));
}

const COMMENT_LINE = /^(?:\/\/|\/\*|\*|<!--)|(?:\*\/|-->)$/u;

/** The number of leading lines that are blank, comments, a shebang, or a script or style tag. */
function fileHeadLength(lines) {
  let close = null;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (close) {
      if (trimmed.includes(close)) close = null;
      continue;
    }
    if (trimmed === '' || /^(?:\/\/|#!|<(?:script|style)\b[^>]*>$)/u.test(trimmed)) continue;
    const opener = ['/*', '<!--'].find((open) => trimmed.startsWith(open));
    if (!opener) return index;
    const closer = MARKER_FORMS[opener === '/*' ? 'block' : 'markup'].close;
    if (!trimmed.slice(opener.length).includes(closer)) close = closer;
  }
  return lines.length;
}

/** The 1-based lines a marker for `anchor` may sit on: the line and the comments right above it. */
function anchorLines(lines, anchor) {
  const accepted = [anchor];
  for (let line = anchor - 1; line >= 1 && COMMENT_LINE.test(lines[line - 1].trim()); line -= 1) {
    accepted.push(line);
  }
  return accepted;
}

/** The marker that exempts an entry: at the file head if `headMarkers`, or at one of its lines. */
function markerFor(entry, family, readFile, headMarkers) {
  const text = readFile(entry.file);
  if (text === undefined) return { exempt: null, empty: null };
  const markers = parseMarkers(entry.file, text).filter((marker) => marker.family === family);
  if (markers.length === 0) return { exempt: null, empty: null };
  const lines = text.split('\n');
  const head = fileHeadLength(lines);
  const sites = new Set(entry.lines.flatMap((line) => anchorLines(lines, line)));
  const applicable = markers.filter(
    (marker) => (headMarkers && marker.line <= head) || sites.has(marker.line)
  );
  return {
    exempt: applicable.find((marker) => marker.reason !== '') ?? null,
    empty: applicable.find((marker) => marker.reason === '') ?? null,
  };
}

/** The reasoned `family` marker in the file head of `text`, or `null`: for a whole-file exemption. */
export function headMarker(file, text, family) {
  const markers = parseMarkers(file, text).filter((m) => m.family === family && m.reason !== '');
  if (markers.length === 0) return null;
  const head = fileHeadLength(String(text).split('\n'));
  return markers.find((marker) => marker.line <= head) ?? null;
}

/**
 * The reasoned `family` marker on `line` of `text` or in the comments right above it, or `null`:
 * for a family that exempts one site of many rather than a whole entry.
 */
export function siteMarker(file, text, family, line) {
  const sites = new Set(anchorLines(text.split('\n'), line));
  const markers = parseMarkers(file, text);
  return markers.find((m) => m.family === family && m.reason !== '' && sites.has(m.line)) ?? null;
}

/**
 * Annotates an entry with its site: its first line's {@link siteText}, and the reasoned `family`
 * marker at that line that `excuses(entry, marker)` accepts. Each file is parsed once.
 */
function siteReader(readFile, family, excuses) {
  const files = new Map();
  const fileOf = (file) => {
    if (!files.has(file)) {
      const text = readFile(file);
      const markers =
        text === undefined
          ? []
          : parseMarkers(file, text).filter((m) => m.family === family && m.reason !== '');
      files.set(file, text === undefined ? null : { lines: text.split('\n'), markers });
    }
    return files.get(file);
  };
  return (entry) => {
    const line = entry.lines?.[0];
    const known = line === undefined ? null : fileOf(entry.file);
    if (!known) return { ...entry, site: { line, text: '' }, marker: null };
    const sites = known.markers.length > 0 ? new Set(anchorLines(known.lines, line)) : new Set();
    const marker = known.markers.find((m) => sites.has(m.line) && excuses(entry, m)) ?? null;
    return { ...entry, site: { line, text: siteText(known.lines[line - 1]) }, marker };
  };
}

const siteKey = (entry) => ({
  ...entry,
  line: entry.site.line,
  key: `${entry.file}\u{0}${entry.id}\u{0}${entry.site.text}`,
});

/** Both sides' site entries net of their markers, each file's lines aligned with its base's. */
function netSites(paired, readBase, readHead, renames) {
  const byFile = new Map();
  const side = (file) => byFile.get(file) ?? byFile.set(file, { base: [], head: [] }).get(file);
  for (const entry of paired.base) side(entry.file).base.push(siteKey(entry));
  for (const entry of paired.head) side(entry.file).head.push(siteKey(entry));
  const all = { base: [], head: [] };
  for (const [file, { base, head }] of byFile) {
    const baseText = head.some((entry) => entry.marker)
      ? readBase(renames.get(file) ?? file)
      : undefined;
    const keyed = keyByAlignment(baseText, readHead(file), base, head);
    all.base.push(...keyed.base);
    all.head.push(...keyed.head);
  }
  return netOfSiteMarkers(all.base, all.head);
}

function validEntry(entry, family) {
  const ok =
    typeof entry?.file === 'string' &&
    typeof entry.id === 'string' &&
    (entry.amount === undefined || Number.isFinite(entry.amount));
  if (!ok) {
    throw new Error(`${family}: measure returned a malformed entry ${JSON.stringify(entry)}`);
  }
  return entry;
}

/** Entries summed per `(file, id)`. */
function tally(entries, family) {
  const index = new Map();
  for (const raw of entries) {
    const entry = validEntry(raw, family);
    const file = entry.file;
    const key = `${file}\u{0}${entry.id}`;
    const amount = entry.amount ?? 1;
    const lines = Array.isArray(entry.lines) ? entry.lines : [];
    const known = index.get(key);
    if (known) {
      known.amount += amount;
      known.lines.push(...lines);
    } else {
      index.set(key, { file, id: entry.id, value: entry.value, amount, lines: [...lines] });
    }
  }
  return index;
}

const label = (entry) => `${entry.file}: ${entry.id}`;

/** Every head entry that is new or above its ceiling, and every base entry that fell. */
function difference(baseIndex, headIndex, ceiling) {
  const offences = [];
  const falls = [];
  for (const [key, entry] of headIndex) {
    const was = baseIndex.get(key);
    if (!was) {
      offences.push({
        entry,
        excess: entry.amount,
        text: `${label(entry)} is new (${entry.amount})`,
      });
      continue;
    }
    const bound = ceiling(was, entry);
    if (entry.amount > bound) {
      const text = `${label(entry)} rose from ${was.amount} to ${entry.amount}`;
      offences.push({ entry, excess: entry.amount - bound, text });
    } else if (entry.amount < was.amount) {
      falls.push({
        entry: was,
        drop: was.amount - entry.amount,
        text: `${label(was)} fell from ${was.amount} to ${entry.amount}`,
      });
    }
  }
  for (const [key, was] of baseIndex) {
    if (!headIndex.has(key)) {
      falls.push({
        entry: was,
        drop: was.amount,
        text: `${label(was)} is gone (was ${was.amount})`,
      });
    }
  }
  const byText = (left, right) => byCodePoint(left.text, right.text);
  return { offences: offences.sort(byText), falls: falls.sort(byText) };
}

const valueKey = (entry) => (entry.value === undefined ? null : `${entry.file}\u{0}${entry.value}`);

/**
 * Net offences against falls of the same `(file, value)`, so a value that moved between ids in one
 * file (a rename, a reformat) is not an offender. Offences are netted greedily in code-point order.
 */
function netByValue(offences, falls) {
  const pools = new Map();
  for (const fall of falls) {
    const group = valueKey(fall.entry);
    if (group !== null) pools.set(group, (pools.get(group) ?? 0) + fall.drop);
  }
  const spent = new Set();
  const netted = [];
  const remaining = offences.filter((offence) => {
    const group = valueKey(offence.entry);
    const pool = group === null ? 0 : (pools.get(group) ?? 0);
    if (offence.excess > pool) return true;
    pools.set(group, pool - offence.excess);
    spent.add(group);
    netted.push(`${offence.text}, offset by a fall of ${offence.entry.value} in the same file`);
    return false;
  });
  // A fall wholly spent on offsetting a move is reported as the move, not as a shrink.
  const kept = (fall) => !spent.has(valueKey(fall.entry)) || pools.get(valueKey(fall.entry)) > 0;
  const shrank = falls.filter(kept).map((fall) => fall.text);
  return { remaining, netted, shrank };
}

function emptyMarkerFailures(files, family, readFile) {
  return files.flatMap((file) =>
    parseMarkers(file, readFile(file) ?? '')
      .filter((marker) => marker.family === family && marker.reason === '')
      .map(
        (marker) =>
          `${file}:${marker.line} has a ratchet-exempt(${family}) marker with no reason; write ` +
          'why the regression is legitimate after the colon'
      )
  );
}

/** Each remaining offence, exempt by a marker at its lines unless site markers were netted. */
function judge(remaining, family, readHead, { headMarkers, exempts }) {
  const failures = [];
  const exempted = [];
  for (const offence of remaining) {
    const { exempt, empty } = markerFor(offence.entry, family, readHead, headMarkers);
    if (exempt && exempts) exempted.push(`${offence.text}: ${exempt.reason}`);
    else if (empty) failures.push(`${offence.text}; its ratchet-exempt marker gives no reason`);
    else failures.push(offence.text);
  }
  return { failures, exempted };
}

/** The file lists each side is measured over, or `null` when the corpus is untouched. */
function sides({ base, changes, include, corpusRoot, scope, cwd }) {
  const headChanged = changes.changed.filter((path) => include(path));
  const baseChanged = new Set(changes.removed.filter((path) => include(path)));
  for (const file of headChanged) {
    const was = basePathOf(changes, file);
    if (was !== null) baseChanged.add(was);
  }
  for (const [to, from] of changes.renames)
    if (include(from) && !include(to)) baseChanged.add(from);
  if (headChanged.length + baseChanged.size === 0) return null;
  if (scope === 'corpus') {
    return {
      headFiles: listHeadFiles(corpusRoot, cwd).filter((path) => include(path)),
      baseFiles: listBaseFiles(base, corpusRoot, cwd).filter((path) => include(path)),
      headChanged,
    };
  }
  return { headFiles: headChanged, baseFiles: [...baseChanged].sort(byCodePoint), headChanged };
}

function skipped(code, reason, corpusRoot, changedCount) {
  return { skipped: code, reason, corpusRoot, changedCount };
}

/**
 * Measure a family at base and at head and compare. `measure(readFile, listFiles)` is called once
 * per side: `listFiles()` gives that side's files (the changed ones under `scope: 'changed'`, the
 * whole corpus under `'corpus'`), `readFile(path)` gives any file's text on that side or
 * `undefined`. It returns `{file, id, amount = 1, value?, lines?}` entries, summed per
 * `(file, id)`; `value` nets a move within a file, `lines` are the head lines a marker may sit at.
 * `pair(base, head)` sees both sides' entries, base paths already renamed, and returns
 * `{base, head}`: a family's own cross-side matching, such as a function rename. `headMarkers:
 * false` stops a file-head marker exempting an entry, for a family whose markers excuse one site.
 * `siteMarkers` makes each entry one site, excused at its first line only when it is new relative
 * to base (`siteMarkers.js`); a function `(entry, marker)` narrows which markers excuse.
 *
 * @returns {{compared: true, family: string, base: string, changedCount: number,
 *   failures: string[], shrank: string[], netted: string[], exempted: string[]}
 *   | {skipped: string, reason: string, corpusRoot: string, changedCount: number|null}}
 */
export function compareToBase({
  family,
  corpusRoot,
  include = underRoot(corpusRoot),
  measure,
  scope = 'changed',
  ceiling = (was) => was.amount,
  pair = (baseEntries, headEntries) => ({ base: baseEntries, head: headEntries }),
  headMarkers = true,
  siteMarkers = false,
  cwd = REPO_ROOT,
  env = process.env,
  base = resolveRatchetBase({ cwd, env }),
}) {
  if (!FAMILY_NAME.test(family ?? '')) throw new Error(`invalid ratchet family name: ${family}`);
  if (!['changed', 'corpus'].includes(scope)) throw new Error(`${family}: unknown scope ${scope}`);
  if (base.skipped) return skipped(base.skipped, base.reason, corpusRoot, null);
  const changes = changedPaths(base, { cwd });
  const changedCount = changes.changed.length + changes.removed.length;
  const files = sides({ base, changes, include, corpusRoot, scope, cwd });
  if (!files) {
    const reason = `none of the ${changedCount} changed path(s) is in the ${family} corpus`;
    return skipped('corpus-unchanged', reason, corpusRoot, changedCount);
  }
  const readHead = (file) => readHeadFile(cwd, file);
  const readBase = baseReader(base, readBaseFiles(base, files.baseFiles, { cwd }), cwd);
  const headPathOf = new Map([...changes.renames].map(([to, from]) => [from, to]));
  const toHeadPath = (raw) => {
    const entry = validEntry(raw, family);
    return { ...entry, file: headPathOf.get(entry.file) ?? entry.file };
  };
  const excuses = typeof siteMarkers === 'function' ? siteMarkers : () => true;
  const annotate = (entries, readFile) =>
    siteMarkers
      ? entries.map((entry) => validEntry(entry, family)).map(siteReader(readFile, family, excuses))
      : entries;
  const paired = pair(
    annotate(
      measure(readBase, () => [...files.baseFiles]),
      readBase
    ).map(toHeadPath),
    annotate(
      measure(readHead, () => [...files.headFiles]),
      readHead
    )
  );
  const net = siteMarkers
    ? netSites(paired, readBase, readHead, changes.renames)
    : { ...paired, fresh: [] };
  const baseIndex = tally(net.base, family);
  const headIndex = tally(net.head, family);
  const { offences, falls } = difference(baseIndex, headIndex, ceiling);
  const { remaining, netted, shrank } = netByValue(offences, falls);
  const exempts = !siteMarkers;
  const { failures, exempted } = judge(remaining, family, readHead, { headMarkers, exempts });
  for (const entry of net.fresh) {
    exempted.push(`${entry.file}:${entry.site.line} ${entry.id}: ${entry.marker.reason}`);
  }
  failures.push(...emptyMarkerFailures(files.headChanged, family, readHead));
  return {
    compared: true,
    family,
    base: shaOf(base),
    changedCount,
    failures,
    shrank,
    netted,
    exempted,
  };
}

/**
 * Report a comparison to a `node:test` context: a skip, shrink, net or exemption as a diagnostic,
 * and any failure as a thrown error that says how to fix or exempt it.
 */
export function reportComparison(t, result, guidance = '') {
  const note = (line) => t?.diagnostic?.(line);
  if (result.skipped) {
    note(`skipped (${result.skipped}): ${result.reason}`);
    return result;
  }
  for (const line of result.shrank) note(`shrank: ${line}`);
  for (const line of result.netted) note(`moved: ${line}`);
  for (const line of result.exempted) note(`exempt: ${line}`);
  if (result.failures.length === 0) return result;
  throw new Error(
    `${result.family}: ${result.failures.length} regression(s) against base ${result.base.slice(0, 12)}:\n  ` +
      result.failures.join('\n  ') +
      (guidance ? `\n\n${guidance}` : '') +
      `\n\nFix it, or record why it is legitimate with a ratchet-exempt(${result.family}): <reason> ` +
      'comment at the site (`//` in JS, `/* */` in CSS, `<!-- -->` in Svelte and HTML). If this ' +
      `names code you did not touch, origin/main may be stale: ${REFRESH_HINT}.`
  );
}
