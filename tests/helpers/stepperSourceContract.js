/** Shared source-scanning primitives for the `Stepper` migration gates (issue 1050). */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** The repo root, resolved from this file's own location. */
export const repoRoot = resolve(import.meta.dirname, '..', '..');

/** The tree every gate here scans. Every real numeric field in the product lives under it. */
export const UI_SVELTE_DIR = 'src/ui/svelte';

/** The shared primitive, excluded BY PATH from the call-site scans and asserted separately. */
export const STEPPER_PATH = 'src/ui/svelte/components/Stepper.svelte';

/** The ONE derivation of a Stepper's three accessible names from a field's own label. */
export const STEPPER_LABELS_PATH = 'src/ui/svelte/components/stepperLabels.js';

/**
 * Whether a `<Stepper>` tag reaches all three accessible names through the shared derivation.
 *
 * @param {string} tag A single `<Stepper …/>` tag.
 * @param {string} source The component source the tag came from, comments already stripped.
 */
export function spreadsSharedStepperLabels(tag, source) {
  return [...tag.matchAll(/\{\s*\.\.\.\s*([A-Za-z_$][\w$]*)\s*(\()?/g)].some(([, name, call]) => {
    if (name === 'stepperLabels') return Boolean(call);
    return new RegExp(String.raw`\b${name}\b[^\n]*=[^\n]*stepperLabels\(`).test(source);
  });
}

/** A floor on the enumeration, so a glob typo cannot pass vacuously. */
export const MINIMUM_SCANNED_SVELTE_FILES = 200;

/** Strip HTML and CSS/JS BLOCK comments, leaving `//` line comments in place. */
export function withoutComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** A real `<input …>` element carrying `type="number"`, as opposed to the phrase in prose. */
export const BARE_NUMBER_INPUT = /<input\b[^>]*\btype="number"/g;

/**
 * Read every `.svelte` file under a repo-relative directory into a `{ path: source }` corpus.
 *
 * @param {string} [dir] Repo-relative directory to walk.
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
 * The `data-*` hooks the smoke harness and the mounted suites resolve against the real `<input>`
 * (issue 1096).
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
 * Every bare `type="number"` field outside the shared primitive, with the reason each is allowed
 * (issue 1096).
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
    // Issue 1278 moved the currency ladder out of the crafting system editor and into the
    // world-scoped World > Currency tab; the chip and its bare field went with it.
    path: 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte',
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

/** The shared component rendering the character-modifier Min / Max pair for BOTH scopes. */
export const CHARACTER_MODIFIER_BOUNDS_PATH =
  'src/ui/svelte/apps/manager/environment/CharacterModifierBoundsRow.svelte';

/** The two update functions the shared bounds row is wired to, one per scope. */
export const CHARACTER_MODIFIER_BOUNDS_SCOPES = Object.freeze([
  'onUpdateDropCharacterModifier',
  'onUpdateEventCharacterModifier',
]);

/** D1a's two tables, as the fixture for the unset-value split (V10). */
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

/** The elements an implicit `<label>` can bind to, in the order a document walk meets them. */
const LABELABLE = /<(input|select|textarea|button|meter|output|progress|Stepper)\b/;

/**
 * Every `<label>` with NO `for` attribute whose first labelable descendant is a `<Stepper>`.
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
