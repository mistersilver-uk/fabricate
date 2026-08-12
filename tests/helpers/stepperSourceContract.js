/**
 * Shared source-scanning primitives for the `Stepper` migration gates (issue 1050).
 *
 * Three suites police the same corpus — `src/ui/svelte/**\/*.svelte` — from three angles:
 * `stepper-spinner.test.js` counts the bare `type="number"` fields that survive and checks how
 * their spinners are suppressed, `stepper-call-site-contract.test.js` checks what each `<Stepper>`
 * call site passes, and both need the same tag extraction and the same comment stripping. They
 * live here rather than in either suite for the reason `sourceScan.js` gives: a byte-for-byte
 * duplicated scanner counts against the SonarCloud duplication gate, which does not honour
 * `sonar.cpd.exclusions` for `tests/**`, and a suite importing another suite to borrow a helper
 * would run that suite's tests a second time under the wrong name.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob, so nothing here is collected as a suite.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** The repo root, resolved from this file's own location. */
export const repoRoot = resolve(import.meta.dirname, '..', '..');

/** The tree every gate here scans. Every real numeric field in the product lives under it. */
export const UI_SVELTE_DIR = 'src/ui/svelte';

/** The shared primitive, excluded BY PATH from the call-site scans and asserted separately. */
export const STEPPER_PATH = 'src/ui/svelte/components/Stepper.svelte';

/**
 * The ONE derivation of a Stepper's three accessible names from a field's own label.
 *
 * The two adjunct names are not independent strings — they are `localize()` of the two
 * parametrized `FABRICATE.Common.Stepper.*` keys against the input's label — so spelling that
 * derivation out per call site is one implementation written ~20 times. It lives in this module
 * and call sites spread it; {@link spreadsSharedStepperLabels} is what lets the naming rule
 * recognize a spread, and `tests/util/stepper-labels.test.js` is what makes recognizing it sound.
 */
export const STEPPER_LABELS_PATH = 'src/ui/svelte/components/stepperLabels.js';

/**
 * Whether a `<Stepper>` tag reaches all three accessible names through the shared derivation.
 *
 * Two spellings, both real in the tree:
 *   - `{...stepperLabels(label)}` — spread inline, the ordinary case.
 *   - `{...tierStepAdjunctLabels}` — spread through a component-level binding assigned from it,
 *     which is how a call site whose INPUT name differs from its adjuncts' spells it (the
 *     tier-step operand is "Steps up", but its adjuncts read the row's "Tier step").
 *
 * The binding form is resolved against the component's own source rather than accepted on the
 * name, so an unrelated `{...props}` spread cannot satisfy the naming rule.
 *
 * @param {string} tag A single `<Stepper …/>` tag.
 * @param {string} source The component source the tag came from, comments already stripped.
 * @returns {boolean}
 */
export function spreadsSharedStepperLabels(tag, source) {
  return [...tag.matchAll(/\{\s*\.\.\.\s*([A-Za-z_$][\w$]*)\s*(\()?/g)].some(([, name, call]) => {
    if (name === 'stepperLabels') return Boolean(call);
    return new RegExp(String.raw`\b${name}\b[^\n]*=[^\n]*stepperLabels\(`).test(source);
  });
}

/**
 * A floor on the enumeration, so a glob typo cannot pass vacuously.
 *
 * The tree holds ~265 `.svelte` files today. The floor is deliberately far below that and NOT a
 * moving target: its job is to fail an empty or near-empty scan, not to pin a file count that
 * every added component would have to update.
 */
export const MINIMUM_SCANNED_SVELTE_FILES = 200;

/**
 * Strip HTML and CSS/JS BLOCK comments, leaving `//` line comments in place.
 *
 * The `//`-preserving variant, mirroring `tests/components/manager-layout.test.js`. Prose in this
 * repo quotes the very markup these gates count — `Stepper.svelte`'s own header writes
 * `<input type="number">`, and so do two explanatory comments in `ComponentEditView.svelte` — so a
 * gate that counted its own documentation would be answered with a file-level allowlist exempting
 * exactly the files it exists to police. `//` is left alone because removing to end-of-line
 * deletes real code wherever a URL appears (`https://…`).
 *
 * The two `//` comments that DO mention `type="number"` (`CraftingSystemManagerRoot.svelte` and
 * `ComponentEditorRoot.svelte`, both explaining the hand-rolled pair they replaced) are handled by
 * {@link BARE_NUMBER_INPUT} instead, which requires an actual `<input>` tag around the attribute.
 *
 * @param {string} source
 * @returns {string}
 */
export function withoutComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * A real `<input …>` element carrying `type="number"`, as opposed to the phrase in prose.
 *
 * `[^>]*` cannot cross an element boundary, so the attribute has to sit inside an opening tag.
 * That is what keeps the two surviving `//` comments above out of the count without inventing a
 * second comment stripper.
 */
export const BARE_NUMBER_INPUT = /<input\b[^>]*\btype="number"/g;

/**
 * Read every `.svelte` file under a repo-relative directory into a `{ path: source }` corpus.
 *
 * Paths are normalized to forward slashes so an assertion reads the same on Windows.
 *
 * @param {string} [dir] Repo-relative directory to walk.
 * @returns {Record<string, string>}
 */
export function collectSvelteSources(dir = UI_SVELTE_DIR) {
  const sources = {};
  const walk = (absolute) => {
    for (const entry of readdirSync(absolute)) {
      const full = join(absolute, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.svelte')) {
        sources[relative(repoRoot, full).replaceAll('\\', '/')] = readFileSync(full, 'utf8');
      }
    }
  };
  walk(resolve(repoRoot, dir));
  return sources;
}

/**
 * Scan forward from `start` to the index just past the brace-balanced construct's terminator.
 *
 * Svelte props are `{ … }` expressions and Prettier prints them MULTI-LINE over an expression
 * value, so a lazy `\{\{[\s\S]*?\}\}` closes at the first `}}` it meets — which for
 * `inputProps={{ 'data-x': someCall({ a }) }}` is inside the value. Depth counting is the only
 * terminator that survives that.
 *
 * @param {string} source
 * @param {number} start Index of the opening `{`.
 * @returns {number} Index one past the matching `}`, or `-1` when unbalanced.
 */
function endOfBracedExpression(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/**
 * Scan forward from just past an opening tag name to the index one past the tag's `>`.
 *
 * The terminator is the first `>` that is NOT inside a `{ … }` expression or a quoted attribute
 * value, for the same reason {@link endOfBracedExpression} exists: an inline arrow such as
 * `onChange={(next) => f(next)}` contains a `>` that closes nothing.
 *
 * A sibling of {@link endOfBracedExpression} rather than an inner loop, because folded into its
 * caller the two nested `while`s plus five branches compute to a cognitive complexity of ~21
 * against Sonar's threshold of 15 (`S3776`) — and this file sits outside every `npm run lint`
 * scope, so nothing local would have said so.
 *
 * @param {string} source
 * @param {number} start Index just past the opening tag's name.
 * @returns {number} Index one past the tag's `>`, or the end of the scan when unterminated.
 */
function endOfTag(source, start) {
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (character === '{') {
      const end = endOfBracedExpression(source, index);
      if (end < 0) return index;
      index = end;
      continue;
    }
    if (character === '"' || character === "'") {
      const close = source.indexOf(character, index + 1);
      if (close < 0) return index;
      index = close + 1;
      continue;
    }
    if (character === '>') return index + 1;
    index += 1;
  }
  return index;
}

/**
 * Every `<Stepper … />` tag in a component, as source text.
 *
 * @param {string} source Component source (comments already stripped by the caller).
 * @returns {string[]}
 */
export function stepperTags(source) {
  const tags = [];
  const open = /<Stepper\b/g;
  let match;
  while ((match = open.exec(source)) !== null) {
    tags.push(source.slice(match.index, endOfTag(source, match.index + match[0].length)));
  }
  return tags;
}

/**
 * The `{ … }` object literal a tag passes as `inputProps`, or `null` when it passes none.
 *
 * Case-SENSITIVE, and that is load-bearing rather than tidy: `ToolBreakageTab.svelte` ships
 * `numberInputProps={{ … }}` and `rangeInputProps={{ … }}` on its `ChanceSlider`, and a
 * case-insensitive or unanchored match would let a ChanceSlider hook satisfy a Stepper rule. The
 * `(?<![A-Za-z])` guard is what rejects the capital-`I` spellings.
 *
 * @param {string} tag
 * @returns {string|null} The inner object source, braces included.
 */
export function inputPropsExpression(tag) {
  const match = /(?<![A-Za-z])inputProps=\{/.exec(tag);
  if (!match) return null;
  const outerStart = match.index + match[0].length - 1;
  const outerEnd = endOfBracedExpression(tag, outerStart);
  if (outerEnd < 0) return null;
  // `inputProps={{ … }}` — the outer brace is Svelte's expression delimiter, the inner one is the
  // object literal. Return the object.
  return tag.slice(outerStart + 1, outerEnd - 1).trim();
}

/** The keys of an object literal, accepting both `foo: v` and `'data-foo': expr` spellings. */
export function objectLiteralKeys(objectSource) {
  const body = objectSource.replace(/^\{/, '').replace(/\}$/, '');
  return [...body.matchAll(/(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g)].map(
    (match) => match[1] ?? match[2] ?? match[3]
  );
}

/**
 * The `data-*` hooks the smoke harness and the mounted suites resolve against the real `<input>`.
 *
 * This is the delta's own enumerated list, copied verbatim rather than derived from the tree — a
 * derived list would shrink with the code and a dropped hook would pass vacuously.
 * `scripts/foundry-test-run.mjs` calls Playwright's `fill()` / `inputValue()` on three of them,
 * and neither resolves against a wrapper `<div>`, so a hook that stopped riding `inputProps` is an
 * un-waivable smoke failure rather than a cosmetic one.
 *
 * `data-trigger-value` LEFT this list in issue 1096, which is a removal from the delta's list and
 * therefore stated rather than done quietly. Its field is no longer a `Stepper` at all: a trigger
 * threshold is TYPED (reaching 20 from 1 is nineteen clicks) and the prototype draws one plain
 * input there. It is covered instead by `BARE_NUMBER_FIELD_REGISTER` entry R3, which is the
 * register this repo already keeps for exactly that decision — so the hook did not stop being
 * guarded, it moved to the guard that fits what it now is.
 */
export const MIGRATED_INPUT_HOOKS = Object.freeze([
  'data-gathering-task-stamina-cost',
  'data-gathering-task-dc-override',
  'data-gathering-task-node-count',
  'data-gathering-task-node-interval',
  'data-gathering-task-node-chance',
  'data-outcome-dc',
  'data-outcome-start',
  'data-outcome-end',
  'data-tier-dc',
  'data-check-dc',
  'data-trigger-tier-step-steps',
  'data-economy-actor-current',
  'data-economy-actor-max',
  'data-composition-weight',
  'data-interactable-node-count',
  'data-tool-breakage-threshold',
  'data-salvage-dc-custom',
]);

/**
 * Every bare `type="number"` field outside the shared primitive, with the reason each is allowed.
 *
 * R1 and R2 come from the non-reuse register (D12); R3 was added by issue 1096. The set is
 * asserted EXACTLY — every entry must still exist and must still contain a bare field, and no
 * unregistered file may — so a later migration of any of them fails as stale rather than leaving
 * a dead allowlist entry behind.
 *
 * `spinnerSuppressed` is the `iff` this register exists to keep honest: a field may lose the
 * browser's drawn arrows only when something else on screen already lets a POINTER step the same
 * value. R1 has a sibling range track; R2 and R3 have nothing, so their spinner is their only
 * pointer path to the value and it stays.
 */
export const BARE_NUMBER_FIELD_REGISTER = Object.freeze([
  Object.freeze({
    path: 'src/ui/svelte/components/ChanceSlider.svelte',
    register: 'R1',
    reason:
      'a sibling type="range" track in the same control is already a pointer-driven stepping '
      + 'affordance, and its own handleNumberKeydown keeps the keyboard one',
    spinnerSuppressed: true,
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/SystemEditView.svelte',
    register: 'R2',
    reason:
      'a bare field inside a bordered currency chip, which is not a form row; it has no other '
      + 'pointer affordance at all, so its native spinner is the correct iff outcome and stays',
    spinnerSuppressed: false,
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
    register: 'R3',
    reason:
      'the trigger condition VALUE, returned from a Stepper to a plain field by issue 1096: a '
      + 'threshold is typed rather than walked to (reaching 20 from 1 is nineteen clicks) and the '
      + 'prototype draws one input there; with no adjuncts beside it the native spinner is its '
      + 'only pointer path to the value, so it stays',
    spinnerSuppressed: false,
  }),
]);

/**
 * The shared component rendering the character-modifier Min / Max pair for BOTH scopes.
 *
 * D1a lists four genuine-absence fields here — drop min/max and event min/max — and they were
 * four `<Stepper>` tags in `CraftingSystemManagerRoot` until the row was extracted. They are one
 * call site now, so the table below carries one entry, and
 * {@link CHARACTER_MODIFIER_BOUNDS_SCOPES} is what keeps the other three fields covered: it
 * pins that both scopes still reach `allowUnset` through this component rather than having
 * quietly grown a second, unasserted copy.
 */
export const CHARACTER_MODIFIER_BOUNDS_PATH =
  'src/ui/svelte/apps/manager/environment/CharacterModifierBoundsRow.svelte';

/**
 * The two update functions the shared bounds row is wired to, one per scope.
 *
 * Asserted as an exact set: a third scope that rendered the row would have to be added here
 * deliberately, and a scope that stopped rendering it — the way a regression would reintroduce
 * a local copy — fails rather than silently dropping out of the D1a coverage above.
 */
export const CHARACTER_MODIFIER_BOUNDS_SCOPES = Object.freeze([
  'onUpdateDropCharacterModifier',
  'onUpdateEventCharacterModifier',
]);

/**
 * D1a's two tables, as the fixture for the unset-value split (V10).
 *
 * `kind` is the whole point: `genuine-absence` fields persist `null` as a distinct domain value
 * and MUST pass `allowUnset`; `cosmetic-zero` fields merely LOOKED blank for zero under their old
 * bare input, persist `0`, and must NOT. Nothing else in the change asserts which call site is
 * which — V3 counts inputs, V4 checks hook placement and the primitive's own suite tests it in
 * isolation — so a misapplied `allowUnset` on `staminaCost`, or a missing one on `dcOverride`,
 * would otherwise ship silently green.
 *
 * `anchor` is a set of substrings that must ALL appear in one tag, and the gate requires EXACTLY
 * one tag per entry to match. A formatting change that breaks an anchor therefore fails loudly
 * rather than silently matching nothing.
 */
export const UNSET_VALUE_CALL_SITES = Object.freeze(
  [
    {
      id: 'gathering task dcOverride',
      path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
      anchor: ['data-gathering-task-dc-override'],
      kind: 'genuine-absence',
      evidence: 'data-models spec: dcOverride is `number | null`; blank inherits the system DC',
    },
    {
      id: 'gathering task nodes.max',
      path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
      anchor: ['data-gathering-task-node-count'],
      kind: 'genuine-absence',
      evidence: 'setNodeCount nulls the whole `nodes` object; normalizeNodeConfig(null) short-circuits',
    },
    {
      id: 'stamina cost modifier min',
      path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
      anchor: ['{ min: next }'],
      kind: 'genuine-absence',
      evidence: 'an unbounded lower bound persists as literal null',
    },
    {
      id: 'stamina cost modifier max',
      path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
      anchor: ['{ max: next }'],
      kind: 'genuine-absence',
      evidence: 'an unbounded upper bound persists as literal null',
    },
    {
      id: 'character modifier bounds',
      path: CHARACTER_MODIFIER_BOUNDS_PATH,
      anchor: ['bound.patch(next)'],
      kind: 'genuine-absence',
      evidence:
        'an unbounded modifier bound persists as literal null, and 0 is itself a legitimate '
        + 'bound, so the two have to stay distinguishable',
    },
    {
      id: 'economy actor draftMaxOverride',
      path: 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte',
      anchor: ['data-economy-actor-max'],
      kind: 'genuine-absence',
      evidence: "saveAll maps '' | null to a null override, meaning `use the rolled max`",
    },
    {
      id: 'salvage dcOverride',
      path: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
      anchor: ['data-salvage-dc-custom'],
      kind: 'genuine-absence',
      evidence: 'same canonical type as the gathering DC override; empty inherits the system DC',
    },
    {
      id: 'gathering task staminaCost',
      path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
      anchor: ['data-gathering-task-stamina-cost'],
      kind: 'cosmetic-zero',
      evidence: 'canonical `staminaCost?: number`; updateStaminaCost clears to 0, never to null',
    },
    {
      id: 'node respawn intervalAmount',
      path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
      anchor: ['data-gathering-task-node-interval'],
      kind: 'cosmetic-zero',
      evidence: 'canonical `intervalAmount: number`',
    },
    {
      id: 'node respawn chance',
      path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
      anchor: ['data-gathering-task-node-chance'],
      kind: 'cosmetic-zero',
      evidence: 'nodeRespawnMath reads `respawn.chance || 0`',
    },
    {
      id: 'economy actor draftCurrent',
      path: 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte',
      anchor: ['data-economy-actor-current'],
      kind: 'cosmetic-zero',
      evidence: 'saveAll writes `Number(draftCurrent) || 0`, so absence is not persistable here',
    },
    {
      id: 'interactable node pool max',
      path: 'src/ui/svelte/apps/InteractableConfigRoot.svelte',
      anchor: ['data-interactable-node-count'],
      kind: 'cosmetic-zero',
      evidence:
        'every patch routes through normalizeNodeConfig, which hard-codes `max: max ?? 0`, so '
        + 'onChange(null) would silently persist 0 — recorded as a known limitation in the spec',
    },
  ].map((entry) => Object.freeze(entry))
);

/**
 * The elements an implicit `<label>` can bind to, in the order a document walk meets them.
 *
 * `<Stepper>` is included because it RENDERS one: its first labelable descendant is the `−`
 * button, so a `<label>` wrapping a caption plus a Stepper makes the caption a decrement control.
 */
const LABELABLE = /<(input|select|textarea|button|meter|output|progress|Stepper)\b/;

/**
 * Every `<label>` with NO `for` attribute whose first labelable descendant is a `<Stepper>`.
 *
 * The `for` exclusion is the difference between the rule this implements and a rule that would
 * over-report. HTML's labeled-control algorithm consults descendants ONLY when `for` is absent:
 * with `for` present the label binds to the element carrying that id, and a `for` naming no
 * element leaves the label with no labeled control at all. Neither case can turn a caption into
 * a decrement button, which is the whole defect here — a `<label for>` around a Stepper whose
 * input carries the same id is in fact the CORRECT spelling, focusing the typeable field.
 *
 * No such markup exists in the tree today; excluding it keeps the detector's name honest rather
 * than leaving a false positive waiting for the first caller that writes one.
 *
 * @param {string} source Component source with comments already stripped.
 * @returns {number[]} 1-based line numbers of the offending `<label>` tags.
 */
export function labelsBindingAStepper(source) {
  const offenders = [];
  const open = /<label\b/g;
  let match;
  while ((match = open.exec(source)) !== null) {
    const openTagEnd = endOfTag(source, match.index + match[0].length);
    if (/\bfor=/.test(source.slice(match.index, openTagEnd))) continue;
    let depth = 1;
    let index = openTagEnd;
    while (index < source.length && depth > 0) {
      if (source.startsWith('<label', index)) {
        depth += 1;
        index += 6;
        continue;
      }
      if (source.startsWith('</label>', index)) {
        depth -= 1;
        index += 8;
        continue;
      }
      index += 1;
    }
    const first = LABELABLE.exec(source.slice(openTagEnd, index));
    if (first?.[1] === 'Stepper') {
      offenders.push(source.slice(0, match.index).split('\n').length);
    }
  }
  return offenders;
}
