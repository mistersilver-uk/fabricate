/**
 * Draws a button-family rule on the markup its own selector builds, in Chromium, and reads which
 * rule the cascade gives each longhand it declares (issue 2540). Shared by the reviewed-override
 * and cascade-inventory suites, which ask two questions of one measurement.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { compile } from 'svelte/compiler';

import { specificityOf } from '../../scripts/lib/stylesheetSelectorCensus.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** The family root; a member naming it once or more is a button-family rule. */
export const ROOT = 'fabricate-button';

const compiledCss = (file) =>
  compile(readFileSync(join(repoRoot, file), 'utf8'), {
    filename: join(repoRoot, file),
    css: 'external',
    generate: 'client',
  }).css.code;

/** Opens a page holding the module sheet, then each listed component's compiled block. */
export async function openCascadePage(browser, components = []) {
  const page = await browser.newPage();
  const styles = [readStylesheet(), ...components.map(compiledCss)]
    .map((css) => `<style>${css}</style>`)
    .join('');
  await page.setContent(`<!doctype html><html><head>${styles}</head><body></body></html>`);
  return page;
}

/**
 * In the page: with no input, every style rule in document order (media that does not match is
 * skipped), each with its selector members, the scoping hash stripped into `bare`, and its sheet's
 * index; with `{ targets, specificity, root }`, the probe below over those same rules.
 */
function pageCascade(input = null) {
  const membersOf = (list) => {
    const members = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < list.length; index += 1) {
      if ('(['.includes(list[index])) depth += 1;
      else if (')]'.includes(list[index])) depth -= 1;
      else if (list[index] === ',' && depth === 0) {
        members.push(list.slice(start, index).trim());
        start = index + 1;
      }
    }
    return [...members, list.slice(start).trim()];
  };
  const flatten = (list) =>
    [...list].flatMap((rule) => {
      if (rule instanceof CSSStyleRule) return [rule];
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) return [];
      return rule.cssRules ? flatten(rule.cssRules) : [];
    });
  const rules = [...document.styleSheets].flatMap((sheet, index) =>
    flatten(sheet.cssRules).map((rule) => ({ rule, sheet: index }))
  );
  if (input) return probe(input, rules);
  return rules.map(({ rule, sheet }, order) => ({
    order,
    sheet,
    members: membersOf(rule.selectorText).map((member) => ({
      member,
      bare: member.replaceAll(/:where\(\.svelte-[\w-]+\)|\.svelte-[\w-]+/g, ''),
    })),
  }));

  /**
   * In the page: draws each target member, then for every longhand its rule declares reads whether
   * that rule wins the cascade on the drawn element and whether the rendered value is the stated one.
   */
  function probe({ targets, specificity, root }, rules) {
    const STATE = ':hover';
    // Split on combinators at depth zero only: `:not(:disabled, [x])` holds a space.
    const compounds = (member) => {
      const parts = [''];
      let depth = 0;
      for (const character of member) {
        if ('(['.includes(character)) depth += 1;
        else if (')]'.includes(character)) depth -= 1;
        if (depth === 0 && /[\s>]/.test(character)) parts.push('');
        else parts[parts.length - 1] += character;
      }
      return parts.filter(Boolean);
    };
    const plain = (compound) =>
      compound.replaceAll(/:not\([^)]*\)/g, '').replaceAll(/:(?:where|is)\(([.[][^)]*)\)/g, '$1');
    const namesRoot = (compound) =>
      new RegExp(String.raw`\.${root}(?![\w-])`).test(plain(compound));
    const draw = (compound, tag) => {
      const named = (/^[a-z][\w-]*/i.exec(compound) ?? /:is\(([a-z][\w-]*)\)/i.exec(compound))?.at(
        -1
      );
      const element = document.createElement(named ?? tag);
      for (const [, name] of plain(compound).matchAll(/\.([\w-]+)/g)) element.classList.add(name);
      for (const [, name, value] of plain(compound).matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
        element.setAttribute(name, value ?? '');
      }
      return element;
    };
    const rank = (entry, property) => [
      entry.rule.style.getPropertyPriority(property) === 'important' ? 1 : 0,
      entry.specificity,
      entry.order,
    ];
    const beats = (left, right) => {
      for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) return left[index] > right[index];
      }
      return false;
    };
    return targets.map(({ order, member, carrier }) => {
      const hovered = member.includes(STATE);
      const parts = compounds(member);
      const carrierAt = parts.findLastIndex(namesRoot);
      let parent = document.body;
      let subject;
      for (const [index, part] of parts.entries()) {
        const last = index === parts.length - 1;
        const element = draw(part, last ? 'button' : 'div');
        if (index === (carrierAt === -1 ? parts.length - 1 : carrierAt)) {
          for (const name of carrier.split(/\s+/)) element.classList.add(name);
        }
        if (last) {
          element.textContent = 'Delete';
          subject = element;
        }
        parent.append(element);
        parent = element;
      }
      const matchable = (selector) => (hovered ? selector.replaceAll(STATE, '') : selector);
      const matching = rules
        .map(({ rule }, at) => {
          const members = rule.selectorText.split(/,(?![^(]*\))/).map((one) => one.trim());
          const hit = members.filter((one) => {
            try {
              return subject.matches(matchable(one));
            } catch {
              return false;
            }
          });
          if (hit.length === 0) return null;
          return {
            rule,
            order: at,
            specificity: Math.max(...hit.map((one) => specificity[one] ?? 0)),
          };
        })
        .filter(Boolean);
      const own = rules[order].rule;
      const twin = subject.cloneNode(true);
      twin.style.cssText = own.style.cssText;
      subject.after(twin);
      const probe = getComputedStyle(subject);
      const stated = getComputedStyle(twin);
      const longhands = [...own.style]
        .filter((property) => !property.startsWith('--'))
        .map((property) => {
          // Iterated, not read by value: a longhand set through a `var()` shorthand reads empty.
          const contenders = matching.filter((entry) => [...entry.rule.style].includes(property));
          if (contenders.length === 0)
            return { property, wins: false, winner: '(own rule unmatched)' };
          const winner = contenders.reduce((best, entry) =>
            beats(rank(entry, property), rank(best, property)) ? entry : best
          );
          return {
            property,
            wins: winner.rule === own,
            winner: winner.rule.selectorText,
            rendered: probe.getPropertyValue(property),
            declared: stated.getPropertyValue(property),
          };
        });
      const matched = subject.matches(matchable(member));
      document.body.replaceChildren();
      return { order, member, matched, longhands, hovered };
    });
  }
}

/** Every rule member in the page, each with its rule's order and sheet. */
export async function cascadeMembers(page) {
  const rules = await page.evaluate(pageCascade);
  return rules.flatMap(({ order, sheet, members }) =>
    members.map((entry) => ({ order, sheet, ...entry }))
  );
}

/**
 * Probes each `{ order, member, carrier }`, returning per member whether it matched its own markup
 * and, per declared longhand, whether it wins the cascade and what renders against what it states.
 */
export async function probeMembers(page, targets) {
  const all = await cascadeMembers(page);
  const specificity = Object.fromEntries(
    all.map(({ member }) => {
      const [ids, classes, types] = specificityOf(member);
      return [member, ids * 1e6 + classes * 1e3 + types];
    })
  );
  return page.evaluate(pageCascade, { targets, specificity, root: ROOT });
}

/** Whether a member names the root as a class anywhere in its compounds. */
export const namesRoot = (member) => new RegExp(String.raw`\.${ROOT}(?![\w-])`).test(member);

/** A member's state pseudo-classes other than the `:hover` the probe can stand in for. */
export const isProbeable = (member) =>
  !/::|:(?:focus|focus-visible|focus-within|active|disabled|checked|first-child|last-child|nth-|empty|placeholder)/.test(
    member.replaceAll(/:not\([^)]*\)/g, '')
  );
