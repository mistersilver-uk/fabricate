/**
 * The two SOURCE-READ contracts every validation row action has to satisfy, written once
 * (issue 1517).
 *
 * A validation row carries two independent addresses: `target` — the ROUTE, the tab or activity
 * the editor opens — and `focusTarget` — the CONTROL, the value of the `data-validation-target`
 * attribute the offending control carries once that route is open. Neither half can check the
 * other: a producer emitting an address nothing carries is a View button that changes route and
 * focuses nothing, and no assertion inside the producer can see it.
 *
 * Two suites police that join — `checks-validation-tab.test.js` for the Checks studio and
 * `recipe-item-validation-tab-mounted.test.js` for the recipe-item editor — and before this file
 * existed each carried its own copy of both scans. They are the same scans over different tables,
 * which is what the SonarCloud new-code duplication gate counts: normalised for literals, the
 * copies are one shape. So the SHAPE lives here, parameterised by the producer's table, the
 * destination map, and the nouns each route calls its own steps.
 *
 * WHAT THE CALLER STILL OWNS, deliberately: its own address table location, its own destination
 * map, and its own expected counts. Those are the facts that differ per route and the facts a
 * reader needs to see at the call site; only the machinery moved.
 *
 * THE HAYSTACK, STATED. Every scan reads source text with its COMMENTS STRIPPED, and that is not
 * tidiness: this design documents each address in prose immediately above the code that writes it
 * — the producers name their addresses in a docblock, and the destinations explain their stamp in
 * an HTML comment — so an un-stripped scan would find every address in the sentence explaining it
 * and report a destination as stamped when nothing stamps it. HTML comment blocks are removed
 * here, and the JavaScript/CSS comment forms by the repository's shared, quote-aware
 * `stripComments` — so a `//` inside a string literal is not mistaken for a comment, and the
 * attribute VALUES, which are themselves string literals, survive the strip and are what is read.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob, so nothing here is collected as a suite. It registers its clauses into whichever suite
 * file calls it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { repoRoot, stripComments } from './sourceScan.js';

/** Every producer, destination and host below lives under the manager app. */
const MANAGER_ROOT = 'src/ui/svelte/apps/manager';

const HTML_COMMENT = /<!--[\s\S]*?-->/gu;

/**
 * Order two strings by code point. Explicit because `sort()`'s default is "stringify, then order by
 * code point", which SonarCloud flags (`javascript:S2871`), and `localeCompare` is locale
 * dependent. Same choice, for the same reason, as `byPath` in `sourceScan.js`.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** The tags that take focus with no `tabindex` of their own. */
const NATIVELY_FOCUSABLE = new Set(['input', 'button', 'select', 'textarea']);

/**
 * Read one manager source file with its comments stripped.
 *
 * @param {string} relativePath Path under `src/ui/svelte/apps/manager`.
 * @returns {string}
 */
export function readManagerSource(relativePath) {
  const text = readFileSync(resolve(repoRoot, `${MANAGER_ROOT}/${relativePath}`), 'utf8');
  return stripComments(text.replaceAll(HTML_COMMENT, ''));
}

/**
 * The two spellings an address can reach the DOM in. An address may ride a primitive's attribute
 * bag — a drop zone's `hookAttrs.root`, a popover's `triggerData` — and arrive as an object key
 * rather than as a written attribute, so a scan that knew only the written form would report a
 * carried address as missing.
 *
 * @param {string} source Stripped destination source.
 * @param {string} address
 * @returns {{ written: boolean, bagged: boolean }}
 */
function spellingsOf(source, address) {
  return {
    written: source.includes(`data-validation-target="${address}"`),
    bagged: source.includes(`'data-validation-target': '${address}'`),
  };
}

/**
 * Whether the element carrying a WRITTEN stamp can really hold focus, as a fault string or null.
 *
 * THE MUTATION THIS EXISTS FOR is the one a mounted assertion cannot see: happy-dom focuses
 * anything — `.focus()` on a bare `<div>` sets `document.activeElement` — so moving a stamp off
 * the field control and onto its wrapper leaves every mounted clause passing while a real browser
 * focuses nothing and `focusValidationTarget` refuses the target. The element is therefore read
 * off the SOURCE: either it is one of the tags that take focus unaided, or it declares BOTH the
 * `tabindex` that makes the focus real and the `data-keyboard-focus` that tells Foundry the window
 * is focused — without the second, Space pauses the game and the arrows pan the canvas.
 *
 * @param {string} source Stripped destination source.
 * @param {string} address
 * @param {string} file The destination's path, for the message.
 * @returns {string|null}
 */
function focusFault(source, address, file) {
  const stamp = source.indexOf(`data-validation-target="${address}"`);
  // The element the stamp rides: back to the nearest tag opening, forward to its close.
  const opening = source.slice(0, stamp).lastIndexOf('<');
  const element = source.slice(opening, source.indexOf('>', stamp) + 1);
  const tag = (/^<([a-zA-Z][\w-]*)/u.exec(element) ?? [])[1] || '';
  if (NATIVELY_FOCUSABLE.has(tag.toLowerCase())) return null;
  if (!/tabindex="-1"/u.test(element)) {
    return `${address}: <${tag}> in ${file} takes focus from nothing — no tabindex`;
  }
  if (!/data-keyboard-focus="true"/u.test(element)) {
    return `${address}: <${tag}> in ${file} does not declare itself focused`;
  }
  return null;
}

/**
 * Register the PAIR guard for one route: every address the producer emits is carried by a real,
 * focusable control in the destination that declares it, and no destination is declared for an
 * address no row carries.
 *
 * @param {object} options
 * @param {string} options.title The suite title.
 * @param {string} options.producerFile The validation tab, under the manager root.
 * @param {string} options.tableName The producer's address table, for the failure message.
 * @param {RegExp} options.tablePattern Locates the table; capture group 1 is its body.
 * @param {RegExp} options.addressPattern Global; capture group 1 is one emitted address.
 * @param {number} options.expectedAddressCount How many distinct addresses the table must hold.
 * @param {string} options.expectation Names them in prose, for the count failure.
 * @param {Record<string, string>} options.destinations Address to the file that must carry it.
 * @param {string} options.routeNoun What this route CHANGES — `route`, `tab`.
 * @param {string} options.destinationNoun What holds the control — `section`, `tab`.
 * @param {readonly string[]} [options.focusProvenElsewhere] Addresses carried through an attribute
 *   bag, whose element cannot be read from source and whose focusability is therefore proved by a
 *   mounted suite instead. Declared rather than skipped: a stamp silently moving from a written
 *   attribute to a bag would otherwise drop its static focus proof without a word.
 */
export function describeValidationAddressPairing({
  title,
  producerFile,
  tableName,
  tablePattern,
  addressPattern,
  expectedAddressCount,
  expectation,
  destinations,
  routeNoun,
  destinationNoun,
  focusProvenElsewhere = [],
}) {
  describe(title, () => {
    // The producer's own table, read out of its source rather than restated here. Restating it
    // would make this gate agree with a copy of the thing it is checking.
    const table = tablePattern.exec(readManagerSource(producerFile));
    const emitted = table
      ? [...new Set([...table[1].matchAll(addressPattern)].map((match) => match[1]))]
      : [];

    it('reads a non-empty address table out of the producer, so the clauses below are not vacuous', () => {
      assert.ok(Boolean(table), `the \`${tableName}\` table could not be located in the producer`);
      assert.equal(
        emitted.length,
        expectedAddressCount,
        `read ${emitted.length} distinct addresses; expected ${expectation}`
      );
    });

    it(`stamps every emitted focusTarget on a control in the ${destinationNoun} its route names`, () => {
      const missing = [];
      for (const address of emitted) {
        const file = destinations[address];
        if (!file) {
          missing.push(`${address}: no destination file is declared for it`);
          continue;
        }
        const { written, bagged } = spellingsOf(readManagerSource(file), address);
        if (!written && !bagged) missing.push(`${address}: ${file} carries no such control`);
      }
      assert.deepEqual(
        missing,
        [],
        'these addresses are emitted by a validation row and carried by nothing, so the row ' +
          `action would change ${routeNoun} and focus nothing:\n  ` +
          missing.join('\n  ')
      );
    });

    it('declares no destination the producer never emits', () => {
      assert.deepEqual(
        Object.keys(destinations).filter((address) => !emitted.includes(address)),
        [],
        'a destination is declared for an address no row carries; either the producer dropped it ' +
          'or this list is stale'
      );
    });

    it('stamps every address on an element that can REALLY take focus', () => {
      const offenders = [];
      const deferred = [];
      for (const [address, file] of Object.entries(destinations)) {
        const source = readManagerSource(file);
        const { written, bagged } = spellingsOf(source, address);
        if (!written && bagged) {
          deferred.push(address);
          continue;
        }
        if (!written) {
          offenders.push(`${address}: ${file} carries no such stamp`);
          continue;
        }
        const fault = focusFault(source, address, file);
        if (fault) offenders.push(fault);
      }
      assert.deepEqual(
        offenders,
        [],
        'a validation row addresses one of these, and the element it resolves to cannot hold ' +
          'focus, so the action would change ' +
          `${routeNoun} and focus nothing:\n  ` +
          offenders.join('\n  ')
      );
      assert.deepEqual(
        [...deferred].sort(byCodePoint),
        [...focusProvenElsewhere].sort(byCodePoint),
        'these addresses reach the DOM through a primitive\'s attribute bag, so no element can be ' +
          'read for them here and their focusability is proved by a mounted suite. The set is ' +
          'declared at the call site precisely so a stamp moving between the two spellings — ' +
          'which silently gains or loses that static proof — has to be acknowledged'
      );
    });
  });
}

/**
 * Register the HOST contract for one route: the editor that joins the two addresses hands the tab
 * its handler, writes the route BEFORE it awaits the focus move, announces only after, and hosts
 * the live region outside every block the route change unmounts.
 *
 * WHY THIS IS READ FROM SOURCE rather than mounted. The suites that own these clauses mount the
 * VALIDATION TAB, which is what makes the producer half directly clickable — the tab takes
 * `onSelectIssue` as a prop, so the exact `(target, focusTarget)` pair a row hands the host is read
 * from a real click rather than inferred. Mounting the whole editor instead needs its entire
 * compiled closure, which a sibling suite already declares, and a second copy of that closure is
 * exactly the near-identical block the duplication gate refuses.
 *
 * @param {object} options
 * @param {string} options.title The suite title.
 * @param {string} options.hostFile The editor, under the manager root.
 * @param {string} options.tabComponent The validation tab's component name, as the host spells it.
 * @param {string} options.routeCall The host's own route write, e.g. `onOpenActivity(`.
 * @param {string} options.regionMarker The live region's attribute.
 * @param {string} options.regionOutsideNoun What the region must sit outside, for the clause title.
 * @param {ReadonlyArray<{ marker: string, present: string, order: string }>} options.mustPrecede
 *   Each block the region must come before: the source `marker`, the message when the block is
 *   missing entirely, and the message when the region sits inside it.
 * @param {string} [options.handler] The host's handler name.
 */
export function describeValidationHostContract({
  title,
  hostFile,
  tabComponent,
  routeCall,
  regionMarker,
  regionOutsideNoun,
  mustPrecede,
  handler = 'selectIssue',
}) {
  describe(title, () => {
    const host = readManagerSource(hostFile);

    it('passes its own handler to the validation tab', () => {
      const wiring = String.raw`<${tabComponent}[\s\S]*?onSelectIssue=\{${handler}\}`;
      assert.match(host, new RegExp(wiring, 'u'));
    });

    it('writes the route BEFORE it awaits the focus move, and announces only after', () => {
      // THE ORDER IS THE MECHANISM. The route write is synchronous, and the helper defers with
      // `queueMicrotask` so Svelte has flushed it and the destination panel exists when the query
      // runs; awaiting the focus move first would query a panel that is not in the DOM. And the
      // announcement is derived FROM the element the helper resolved, so it cannot be written
      // before focus moved.
      const signature = String.raw`async function ${handler}\([\s\S]*?\n {2}\}`;
      const body = new RegExp(signature, 'u').exec(host);
      assert.ok(Boolean(body), 'the row-action handler could not be located');
      const route = body[0].indexOf(routeCall);
      const focus = body[0].indexOf('await focusValidationTarget(');
      const announce = body[0].indexOf('issueAnnouncement =');
      const allPresent = [route, focus, announce].every((at) => at !== -1);
      assert.ok(allPresent, 'all three steps must be present');
      assert.ok(route < focus, `\`${routeCall}\` must run before the focus move is awaited`);
      assert.ok(focus < announce, 'the announcement must be written after the focus move resolved');
    });

    it(`hosts the live region OUTSIDE the ${regionOutsideNoun}, so the route change cannot unmount it`, () => {
      // The defect this shape exists to prevent: the surface that would otherwise host the region
      // is inside the route switch, and the row action's whole job is to leave that branch — so
      // the region would be unmounted in the same update that was supposed to announce.
      const region = host.indexOf(regionMarker);
      assert.ok(region !== -1, 'the live region must exist');
      for (const { marker, present, order } of mustPrecede) {
        const block = host.indexOf(marker);
        assert.ok(block !== -1, present);
        assert.ok(region < block, order);
      }
      const adjacency = String.raw`${regionMarker}[\s\S]{0,120}\{#if issueAnnouncement\}`;
      assert.match(host, new RegExp(adjacency, 'u'));
    });
  });
}
