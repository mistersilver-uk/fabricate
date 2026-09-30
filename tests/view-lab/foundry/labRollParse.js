/**
 * The View Lab's `Roll.parse`: a substituted formula into plain roll terms shaped like the output
 * RECORDED from Foundry (issues 1097, 2007). `labRollTerms.js` builds term instances from it.
 */

/**
 * A die term, in the shape RECORDED from Foundry 14.365 rather than invented.
 *
 * @param {object} params Params.
 * @param {number|undefined} params.number Dice count, or undefined for a sub-roll.
 * @param {string} params.denominationSource The raw denomination text (`20`, `f`, `c`).
 * @param {string} params.modifiers The raw modifier text.
 * @returns {object} The term.
 */
function labDieTerm({ number, denominationSource, modifiers }) {
  const numericFaces = /^\d+$/.test(denominationSource) ? Number(denominationSource) : null;
  const fixedFaces = { f: 3, c: 2 }[denominationSource.toLowerCase()];
  const faces = numericFaces ?? fixedFaces;
  const denomination = numericFaces === null ? denominationSource.toLowerCase() : `d${faces}`;
  const classes = { f: 'FateDie', c: 'Coin' };
  return {
    class: numericFaces === null ? (classes[denominationSource.toLowerCase()] ?? 'Die') : 'Die',
    number,
    faces,
    denomination,
    modifiers: modifiers ? (modifiers.match(/[a-z]+(?:[<>=]{1,2})?-?\d*/gi) ?? []) : [],
    isDeterministic: false,
  };
}

/** A die whose faces are a parenthetical sub-roll: `number`/`faces` read `undefined`. */
const SUB_ROLL_DIE = /^(\d*)d\(/i;

/** `NdS` with an optional trailing modifier run. */
const LAB_DIE = /^(\d*)d(\d+|[fc])((?:[a-z]+(?:[<>=]{1,2})?-?\d*)*)/i;

/** The denomination and modifiers after a parenthetical count, as `(@rank)d20` resolves to. */
const DYNAMIC_COUNT_TAIL = /^d(\d+|[fc])((?:[a-z]+(?:[<>=]{1,2})?-?\d*)*)/i;

/** A math function opening, e.g. `max(`. */
const LAB_FUNCTION = /^([a-z][a-z0-9]*)\(/i;

/** A bare word the grammar leaves as an unmatched `StringTerm`, e.g. `prof`. */
const LAB_WORD = /^[a-z_][\w.]*/i;

/** A decimal number. */
const LAB_NUMBER = /^\d+(?:\.\d+)?/;

/** A flavour annotation, which Foundry attaches to the preceding term as inert text. */
const LAB_FLAVOUR = /^\[[^\]]*]/;

/**
 * Read the balanced parenthetical starting at `source[start]` (which must be `(`).
 *
 * @param {string} source The formula.
 * @param {number} start Index of the opening parenthesis.
 * @returns {{inner: string, end: number}} The contents and the index after the `)`.
 * @throws {SyntaxError} When the parenthesis is never closed — which is what a GM's
 *   half-typed `1d20 + (` is, and what the real grammar raises for it.
 */
function readBalanced(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return { inner: source.slice(start + 1, index), end: index + 1 };
    }
  }
  throw new SyntaxError(`Unbalanced parenthesis in "${source}"`);
}

/**
 * Split an argument list on its TOP-LEVEL commas only.
 *
 * @param {string} inner The text between the brackets.
 * @returns {string[]} One entry per top-level argument.
 */
function splitArguments(inner) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (character === '(' || character === '{') depth += 1;
    else if (character === ')' || character === '}') depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(inner.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

/**
 * Attach a flavour annotation to the term it follows. Real Foundry refuses a flavour after
 * whitespace (`1d4 [Tool]` throws on 13.351 and 14.365), so the lab does too.
 */
function attachFlavour(source, cursor, flavour, terms) {
  const previous = terms.at(-1);
  if (!previous || /\s/.test(source[cursor - 1])) {
    throw new SyntaxError(`A flavour must follow its term directly in "${source}"`);
  }
  previous.flavor = flavour.slice(1, -1);
}

/**
 * Parse a substituted formula into lab roll terms.
 *
 * @param {string} source The `@`-substituted formula.
 * @returns {Array<object>} Roll terms in infix order.
 * @throws {SyntaxError} On a malformed or half-typed formula.
 */
export function parseLabTerms(source) {
  const terms = [];
  let cursor = 0;
  // `true` while the parser is waiting for a VALUE and `false` while it is waiting for an operator.
  let expectOperand = true;

  while (cursor < source.length) {
    const rest = source.slice(cursor);
    if (/^\s/.test(rest)) {
      cursor += 1;
      continue;
    }
    const flavour = LAB_FLAVOUR.exec(rest);
    if (flavour) {
      attachFlavour(source, cursor, flavour[0], terms);
      cursor += flavour[0].length;
      continue;
    }
    if (!expectOperand) {
      if (!/^[+\-*/%]/.test(rest)) throw new SyntaxError(`Expected an operator in "${source}"`);
      terms.push({ class: 'OperatorTerm', operator: rest[0], isDeterministic: true });
      cursor += 1;
      expectOperand = true;
      continue;
    }
    cursor += readOperand(source, cursor, rest, terms);
    expectOperand = false;
  }

  if (expectOperand) throw new SyntaxError(`Incomplete expression "${source}"`);
  return terms;
}

/** A die whose faces are a sub-roll, e.g. `1d(1d4)`, or null when `rest` opens no such die. */
function readSubRollDie(source, cursor, rest, terms) {
  const subRoll = SUB_ROLL_DIE.exec(rest);
  if (!subRoll) return null;
  const { inner, end } = readBalanced(source, cursor + subRoll[0].length - 1);
  // `DiceTerm#faces` returns undefined while the faces are an unevaluated sub-Roll, and
  // `Die#denomination` is `` `d${this.faces}` `` — so the recorded 14.365 output really is the
  // literal string `"dundefined"`.
  terms.push({
    class: 'Die',
    number: subRoll[1] === '' ? 1 : Number(subRoll[1]),
    faces: undefined,
    facesSource: inner,
    denomination: 'dundefined',
    modifiers: [],
    isDeterministic: false,
  });
  return end - cursor;
}

/** A die whose COUNT is a parenthetical, e.g. `(2)d20`, or null when `rest` opens no such die. */
function readDynamicCountDie(source, cursor, rest, terms) {
  if (!rest.startsWith('(')) return null;
  const { inner, end } = readBalanced(source, cursor);
  const tail = DYNAMIC_COUNT_TAIL.exec(source.slice(end));
  if (!tail) return null;
  // `DiceTerm#number` reads undefined while the count is an unevaluated sub-Roll.
  terms.push({
    ...labDieTerm({ number: undefined, denominationSource: tail[1], modifiers: tail[2] }),
    numberSource: inner,
  });
  return end + tail[0].length - cursor;
}

/** A `{…}` pool with its trailing modifier, or null when `rest` opens no pool. */
function readPool(source, cursor, rest, terms) {
  if (!rest.startsWith('{')) return null;
  const closing = source.indexOf('}', cursor);
  if (closing === -1) throw new SyntaxError(`Unbalanced pool brace in "${source}"`);
  const inner = source.slice(cursor + 1, closing);
  const trailing = /^[a-z]+[<>=]?-?\d*/i.exec(source.slice(closing + 1));
  const args = splitArguments(inner);
  const parts = args.flatMap((part) => parseLabTerms(part));
  // `PoolTerm#isDeterministic` is `terms.every(...)`, and — unlike a parenthetical or a
  // function term — the recorded shape reports `isIntermediate: false`.
  terms.push({
    class: 'PoolTerm',
    modifiers: trailing ? [trailing[0]] : [],
    args,
    isIntermediate: false,
    isDeterministic: parts.every((part) => part.isDeterministic === true),
  });
  return closing + 1 - cursor + (trailing ? trailing[0].length : 0);
}

/** A literal number or plain `NdS` die, or null. */
function readLiteral(rest, terms) {
  const die = LAB_DIE.exec(rest);
  if (die) {
    terms.push(
      labDieTerm({
        number: die[1] === '' ? 1 : Number(die[1]),
        denominationSource: die[2],
        modifiers: die[3],
      })
    );
    return die[0].length;
  }
  const number = LAB_NUMBER.exec(rest);
  if (!number) return null;
  terms.push({ class: 'NumericTerm', number: Number(number[0]), isDeterministic: true });
  return number[0].length;
}

/** A math function call, or null. */
function readFunction(source, cursor, rest, terms) {
  const fn = LAB_FUNCTION.exec(rest);
  if (!fn) return null;
  const { inner, end } = readBalanced(source, cursor + fn[0].length - 1);
  // `FunctionTerm#isDeterministic` is `this.terms.every(t => Roll.create(t).isDeterministic)`,
  // so it recurses; a comma-separated argument list is parsed argument by argument.
  const args = splitArguments(inner);
  const parts = args.flatMap((part) => parseLabTerms(part));
  terms.push({
    class: 'FunctionTerm',
    fn: fn[1],
    terms: parts,
    args,
    isIntermediate: true,
    isDeterministic: parts.every((part) => part.isDeterministic === true),
  });
  return end - cursor;
}

/** A parenthetical, or null. */
function readParenthetical(source, cursor, rest, terms) {
  if (!rest.startsWith('(')) return null;
  const { inner, end } = readBalanced(source, cursor);
  const parts = parseLabTerms(inner);
  // `ParentheticalTerm` carries BOTH a string `term` and an own `roll` slot, and `isIntermediate
  // = true`.
  terms.push({
    class: 'ParentheticalTerm',
    term: inner,
    roll: undefined,
    isIntermediate: true,
    isDeterministic: parts.every((part) => part.isDeterministic === true),
  });
  return end - cursor;
}

/**
 * Push the one operand starting at `cursor` and report how many characters it spanned.
 *
 * @param {string} source The whole formula.
 * @param {number} cursor The operand's start index.
 * @param {string} rest `source` from `cursor`.
 * @param {Array<object>} terms The output list, appended to in place.
 * @returns {number} The operand's length in characters.
 * @throws {SyntaxError} When nothing the grammar accepts starts here.
 */
function readOperand(source, cursor, rest, terms) {
  const structured =
    readSubRollDie(source, cursor, rest, terms) ??
    readPool(source, cursor, rest, terms) ??
    readLiteral(rest, terms);
  if (structured !== null) return structured;

  // A UNARY SIGN, which the grammar allows in front of any operand and which a bounded rolling
  // check modifier always produces: `min(max((1d8), -1), 6)` opens its second argument with one.
  if ((rest.startsWith('-') || rest.startsWith('+')) && rest.length > 1) {
    const consumed = readOperand(source, cursor + 1, rest.slice(1), terms);
    const operand = terms.at(-1);
    if (rest.startsWith('-') && operand?.class === 'NumericTerm') operand.number = -operand.number;
    return consumed + 1;
  }

  const bracketed =
    readFunction(source, cursor, rest, terms) ??
    readDynamicCountDie(source, cursor, rest, terms) ??
    readParenthetical(source, cursor, rest, terms);
  if (bracketed !== null) return bracketed;

  const word = LAB_WORD.exec(rest);
  if (word) {
    // `StringTerm#isDeterministic` returns TRUE for a string the classifier cannot resolve — and
    // evaluating it then throws.
    terms.push({ class: 'StringTerm', term: word[0], isDeterministic: true });
    return word[0].length;
  }

  throw new SyntaxError(`Unexpected "${rest[0]}" in "${source}"`);
}
