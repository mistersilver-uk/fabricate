import { FOUNDRY_ICON_DEFINITIONS } from './foundryIconCatalogue.js';

export { FOUNDRY_ICON_DEFINITIONS, FOUNDRY_ICON_BUNDLE_RELEASE } from './foundryIconCatalogue.js';

// Patterns that identify the icons the curated vocabulary leaves out.
//
// THE RULE. If a glyph suits ANY fiction — fantasy, science fiction or general fiction — and
// Foundry can render it, it is available. A syringe is a med-bay; a stopwatch times a training
// montage; a dumbbell IS the training montage; a checkered flag ends a race, and has ended chariot
// races for far longer than it has ended motor ones; a blighted ear of wheat is the oldest fantasy
// plot there is. The question to ask of a new icon is never "would a dungeon have one", nor even
// "would a fictional setting have one", but "is there a story this picture belongs in".
//
// That rule is WIDER than the one this list was first written against, and widening it dissolved
// whole categories rather than shortening them. A syringe, a set of pills, a blender, a detergent
// jug, a plug, a pair of lungs and a dumbbell were all held out as "present-day clinical or
// domestic furniture no fiction is reaching for". General fiction reaches for every one of them,
// and science fiction reaches for the med-bay twice. The clinical, pandemic, consumer-electronics,
// civilian-transport, fast-food and modern-sports blocks are gone for that reason — not trimmed,
// gone — because their reasoning was "a dungeon has no ambulance", and that was never the test.
//
// WHAT STAYS OUT is single characters and emoji reactions, plus four narrower things, and every
// one of them is about what the glyph DEPICTS:
//
//  1. Glyphs whose meaning is a SOFTWARE AFFORDANCE rather than a depicted object: the editor's
//     controls, transport controls, file formats, chart types, and the arrows that mean navigate.
//  2. Glyphs whose SUBJECT is a real-world institution, currency or cause — a currency sign, an
//     agency-marked relief building, a party emblem, an access provision's symbol — as against a
//     gesture, a symbol or an object a fiction is free to reuse.
//  3. Present-day SIGNAGE: the pictograms that label a building rather than depict a thing in it.
//     This is what survives of a much broader category, and it still catches something — the
//     restroom sign, the no-entry sign, the parking P, the lift and the hospital H are drawings of
//     signs. The bath, the toilet and the ambulance those signs point at are objects, and they
//     are curated in.
//  4. Redundant variants of a glyph the vocabulary already carries.
//
// THE INSTITUTION RULE IS ABOUT DEPICTION, NEVER PROVENANCE. A release is not something a GM can
// see; the drawing is. A crate, a borehole and a cooking burner are curated in even though Font
// Awesome shipped them alongside the relief pictograms, and a raised-hand Vulcan salute is curated
// in even though Star Trek owns the gesture's name, because what the glyph depicts is a hand.
//
// WEAPONS ARE IN. A sword, an axe, a bow, a gun and a bomb are all things fiction is about. The
// arrow that is a projectile is in for the same reason the arrows that mean "go that way" are out.
//
// NAMES ARE NOT THE SUBJECT EITHER. A depiction cannot be dodged by spelling, so a glyph is
// excluded when ANY of its names matches — `automobile` is the same drawing as `car`, and the
// vocabulary would otherwise offer under one name the picture it had just excluded under another.
//
// BRANDS ARE NOT IN THIS LIST any more. They used to be, as a block of company names. They are now
// excluded where they can be MEASURED rather than guessed: a logo is exactly a glyph that only
// Font Awesome's brands face draws, and the catalogue generator drops those before this list runs.
export const EXCLUDED_ICON_CODE_PATTERNS = Object.freeze([

  // ── Single characters and typographic marks ──
  //
  // A letter, a digit and a comma are characters. Foundry renders them and every fiction is
  // written down, but a picker offering "E" beside "Dragon" is offering a font, not an icon. The
  // enclosed forms and the mathematical operators go with them.
  //
  // What is NOT here: `asterisk`, `exclamation` and `question`. Those three read as a drawing as
  // readily as a mark — they are what a story hangs over a character's head — and the first of
  // them is a star.
  /^[0-9]$/,
  /^[a-z]$/,
  /^(00|100)$/,
  /^h[1-6]$/,
  /^(circle|square|hexagon|diamond|octagon|pentagon)-[a-z0-9]$/,
  /^(accent-grave|ampersand|apostrophe|at|colon|comma|dash|hashtag|hyphen|period|pipe|quote|quotes|semicolon|slash|slash-back|slash-forward|tilde)($|-)/,
  /^brackets?(-|$)/,
  /^(almost-equal-to|copyright|divide|empty-set|equals|function|greater-than(-equal)?|integral|intersection|lambda|less-than(-equal)?|not-equal|percent|percentage|plus-minus|registered|sigma|square-root-variable|trademark|union|value-absolute)$/,
  /^(circle|square|hexagon|octagon)-(ampersand|colon|divide|equals|small)$/,
  /^(font-case|kerning|ligature|section|spell-check|subscript|superscript)$/,
  /^paragraph($|-)/,
  /^(omega|pi|theta|overline|option|single-quote-left|single-quote-right|square-root|tally|tally-[1-4])$/,
  /^(plus|minus|xmark|times|equals|divide)-large$/,

  // ── Emoji reactions ──
  //
  // A grinning face is a reaction to a story, not a thing in one. The whole set goes, under either
  // the `face-` prefix Font Awesome 6 gave them or the bare names Pro still carries alongside it.
  /^face-/,
  /^(angry|dizzy|exploding-head|flushed|frown|frown-open|grimace|grin|grin-alt|grin-beam|grin-beam-sweat|grin-hearts|grin-squint|grin-squint-tears|grin-stars|grin-tears|grin-tongue|grin-tongue-squint|grin-tongue-wink|grin-wink|hushed|kiss|kiss-beam|kiss-wink-heart|laugh|laugh-beam|laugh-squint|laugh-wink|meh|meh-blank|meh-rolling-eyes|sad-cry|sad-tear|smile|smile-beam|smile-plus|smile-wink|surprise|tired|weary|woozy)$/,

  // ── 1. Software affordances ──
  //
  // The glyphs whose meaning is "click me" or "this file is a spreadsheet". They depict no object
  // a character could pick up, and the reason they stay out is not that they are modern — a
  // starship's console has buttons — but that their subject is the software, not the fiction.
  //
  // The line this block draws, and it is a real one: a rack of servers, a stack of discs, a chip, a
  // satellite dish, a laptop and a robot are DEPICTED OBJECTS and stay curated in. A console
  // prompt, a square-wave chart and a "download" arrow are not.

  // Directional arrows, carets and chevrons — the whole navigational vocabulary. Font Awesome Pro
  // draws some nine hundred of them and every one means "go that way". `arrow-archery` is the one
  // member the weapons rule pulls back out: it draws a projectile, not a direction.
  /^arrows?-(?!archery)/,
  /^arrows?$/,
  /^(caret|carets|chevron|chevrons|angle|angles)-/,
  /^(circle|square|hexagon|octagon|diamond|rectangle)-(arrow|caret|chevron)/,
  /^(up|down|left|right)($|-)/,
  /^(bring|send)-(back|backward|forward|front)$/,
  /^sort($|-)/,
  /^turn-/,
  /^level-(up|down)/,
  /^(exchange|retweet|repeat|repeat-1|shuffle|rotate|reply|forward|backward|share)($|-)/,
  /^(compress|expand|maximize|minimize|clone|copy|paste|duplicate)($|-)/,
  /^(external-link|arrow-pointer|mouse-pointer|hand-pointer|i-cursor|dot-circle|crosshairs-simple)($|-)/,
  /^(up-right|up-left|down-right|down-left)-and-/,
  /^triple-chevrons-/,
  /^u-turn($|-)/,
  /^(circle|square)-(down-left|down-right|up-left|up-right|location-arrow)$/,
  /^(corner|merge|split|swap|swap-arrows|reflect|reflect-both|reflect-horizontal|reflect-vertical)($|-)/,

  // Editor, layout and text controls.
  /^(align|indent|outdent|dedent|border|distribute-spacing|line-height|line-columns|columns|column|rows?|table|tables|grid|grids)($|-)/,
  /^(bold|italic|underline|strikethrough|highlighter|heading|header|font|fonts|text|input|remove-format|horizontal-rule|page-break|block-quote|quote-left|quote-right)($|-)/,
  /^list($|-(1-2|alt|check-alt|dots|dropdown|music|numeric|ol|radio|squares|timeline|tree|ul))/,
  /^(filter|filters|bars|reorder|kanban|swatchbook|sliders|slider|toggle|dial|dialpad|ellipsis|grip|loader|spinner|thumbtack-slash|scrubber|scribble)($|-)/,
  /^objects?-(align|column|exclude|group|intersect|subtract|ungroup|union)/,
  /^(alt|dot|badge-check|brightness|brightness-low|burst-new|delete-left|delete-right|direction-left-right|direction-up-down|circles-overlap|picture-in-picture|screencast|subtitles|open-captioning|pronoun|poll-people|gif|blog|airplay|airplay-audio|podcast|print|rss|voicemail|wireless|watch-apple)($|-)/,
  /^globe-(pointer|wifi|www)$/,
  /^(wave|waves)-(sine|square|triangle)$/,

  // Windows, browsers and the desktop metaphor. The MACHINE is an object and stays; the chrome
  // drawn on its screen is not.
  /^(window|windows|browser|browsers|sidebar|panel|dashboard|screen-users|display-(arrow|chart|code|slash))($|-)/,
  /^(rectangle|square)-(ad|history|list|pro|terminal|this-way-up|wide|xmark|kanban|barcode)$/,
  /^rectangle-(4k|api|beta|code|hd|high-dynamic-range|history|irc|n-a|new|sd|tall|vertical-history)/,
  /^rectangles-mixed$/,
  /^square-(code|root|rss)$/,

  // Files, folders, formats and the mail SYSTEM. A sealed letter, an opened one and a letter with
  // a page in it are pre-modern objects and stay curated; a file format and a
  // delivery-confirmation badge are not.
  /^files?$/,
  /^file-(aiff|arrow|audio|ban|binary|brackets|cad|caret|chart|check|circle|clipboard|code|csv|css|dashed-line|doc|download|edit|eps|excel|export|fragment|gif|half-dashed|html|icns|image|import|jpg|js|lock|magnifying-glass|midi|minus|mov|mp3|mp4|music|odf|pdf|pen|plus|png|powerpoint|ppt|prescription|search|shield|slash|spreadsheet|svg|tex$|times|upload|user|vector|video|wav|waveform|word|xls|xmark|xml|zip|zipper)/,
  /^(folder|folders|inbox|inboxes|paperclip|attachment)($|-)/,
  /^envelope-(badge|certificate|circle|dot|ribbon|square)/,
  /^envelopes(-bulk)?$/,
  /^cloud-(arrow|binary|check|code|download|exclamation|minus|music|plus|question|slash|upload|word|xmark)/,
  /^(download|upload|import|export|sync|refresh|reload)($|-)/,

  // Transport controls, search, and the data-visualisation vocabulary.
  /^(play|pause|stop|eject|record|rewind|fast-forward|fast-backward|volume|mute)($|-)/,
  /^(magnifying-glass|search|zoom)($|-)/,
  /^(chart|charts|analytics|area-chart|bar-chart|bar-progress|line-chart|pie-chart|wave-square|waveform|timeline|diagram|sitemap|network-wired|hexagon-nodes|comment-nodes|square-poll)($|-)/,
  /^(terminal|code|codes|debug|binary|command|api|webhook|http|url|www|qrcode|barcode)($|-)/,
  /^(bezier-curve|draw-polygon|draw-circle|draw-square|vector-square|object-group|object-ungroup|fill|fill-drip|crop|crop-simple)($|-)/,
  /^(login|logout|sign-in|sign-out|right-from-bracket|right-to-bracket|left-from-bracket|left-to-bracket|power-off|restart|shutdown)($|-)/,
  /^(circle|square|hexagon|octagon|diamond|rectangle)-(check|dashed|ellipsis|exclamation|half|info|minus|notch|plus|question|xmark|sort|three-quarters|quarters?|image|kanban|binary|full|share|user|users|video|waveform)/,

  // ── 2. Real-world institutions, currencies and causes ──

  // Currency signs and the money instruments built around them. A coin, a purse, a sack of gold
  // and a gemstone are treasure in any fiction, and a hand holding a coin is alms; a national
  // currency's SIGN is a present-day institution's mark, and so is the badge drawn around it.
  /-sign$/,
  /^(circle|square|badge|box|comment|comments|display-chart-up-circle|envelope-open|filter-circle|funnel|gauge-circle|inbox|lightbulb|message|shield|user)-(dollar|usd|euro|currency|percent)/,
  /^(austral|baht|bangladeshi-taka|bitcoin|brazilian-real|cedi|cent|chf|circleapore-dollar|cny|cruzeiro|danish-krone|dollar|dong|eur|euro|florin|franc|gbp|guarani|hryvnia|ils|indian-rupee|inr|jpy|kip|krw|lari|lira|litecoin|malaysian-ringgit|manat|mill|naira|norwegian-krone|peruvian-soles|peseta|peso|polish-zloty|renminbi|ruble|rupee|rupiah|shekel|singapore-dollar|sterling|swedish-krona|tenge|try|tugrik|turkish-lira|usd|won|yen)$/,
  /^(circle|square)-(austral|australian-dollar|baht|bangladeshi-taka|bitcoin|brazilian-real|cedi|cent|chf|cruzeiro|currency|danish-krone|dollar|dong|euro|florin|franc|gf|guarani|hryvnia|indian-rupee|kip|lari|lira|litecoin|malaysian-ringgit|manat|mill|naira|norwegian-krone|peruvian-soles|peseta|peso|polish-zloty|renminbi|ruble|rupee|rupiah|shekel|sterling|swedish-krona|tenge|tugrik|turkish-lira|usd|won|yen)$/,
  /^(circle|square)apore-dollar$/,
  /^money-(bill|check)/,
  /^money(-simple)?-from-bracket$/,
  /^hexagon-vertical-nft/,
  /^route-(highway|interstate)$/,
  /^(cash-register|credit-card|receipt|circle-dollar-to-slot|donate|barcode-read|barcode-scan|rectangle-ad|billboard|ranking-star)($|-)/,

  // The pictograms of a present-day relief operation: agency-marked buildings and personnel, camp
  // and sanitation materiel, transfers and rations, the figures that stand for displaced,
  // endangered and injured people, and the disasters an operation responds to.
  //
  // Scoped by what the glyph DEPICTS. A glyph from the same release that draws an ordinary object
  // or action a character handles is curated in, and several are — a packed crate, porters
  // carrying one, a cooking burner, a kitchen set, a borehole, a spilled sack, a lookout tower,
  // and a blighted ear of wheat, which this list used to catch and no longer does: a harvest
  // failing is a story, not an operation, and the category's own wording never predicted it.
  //
  // `people-pulling` is the one member of this cluster the rule ABOVE would admit and the list
  // below still excludes, so it is held out on the redundancy rule instead: two figures hauling a
  // load is ordinary labour, but `people-carry-box` already carries that idea.
  /^bridge-(circle|lock|water)/,
  /^building-(circle|lock|ngo|shield|un|user|wheat)/,
  /^child-(combatant|dress|reaching)$/,
  /^children$/,
  /^cloud-showers-water$/,
  /^glass-water(-droplet)?$/,
  /^hands-(bound|holding-child|holding-circle)$/,
  /^helmet-un$/,
  /-un$/,
  /^hill-(avalanche|rockslide)$/,
  /^house-(circle|flood|lock|signal|tsunami)/,
  /^locust$/,
  /^mosquito(-net)?$/,
  /^people-(arrows|group|line|pulling|robbery|roof)$/,
  /^person-(arrow|burst|circle|dots-from-line|dress-burst|drowning|falling(-burst)?|half-dress|harassing|military|rays|rifle|shelter|through-window)/,
  /^person-walking-(arrow|dashed|luggage|with-cane)/,
  /^school-(circle|flag|lock)/,
  /^sheet-plastic$/,
  /^square-(nfi|person-confined)$/,
  /^tarp(-droplet)?$/,
  /^tent($|s$|-)/,
  /^users-(between-lines|line|rays|rectangle|viewfinder)$/,

  // Symbols that stand for a present-day access provision or political cause rather than depicting
  // an object or an action.
  /^(american-sign-language-interpreting|asl-interpreting|assistive-listening-systems|audio-description|blind|braille|closed-captioning|deaf|deafness|hard-of-hearing|universal-access|low-vision)($|-)/,
  /^(ear-(deaf|listen)|eye-low-vision|hands-asl-interpreting|hands-american-sign-language-interpreting|person-cane|wheelchair(-move)?)$/,
  /^(check-to-slot|democrat|republican|person-booth|landmark-(dome|flag)|recycle|ban-smoking|flag-usa)$/,
  /^(genderless|neuter|non-binary|transgender)$/,

  // ── 3. Present-day signage ──
  //
  // The pictograms that label a building rather than depict a thing inside it. A restroom sign is
  // a drawing of a sign; the toilet, the bath and the ambulance those signs point at are objects,
  // and every one of them is curated in.
  /^(restroom|do-not-enter|ban($|-(bug|parking))|hospital-symbol|helicopter-symbol|square-parking|circle-parking|parking|elevator|escalator|street-view|location-(arrow|check|crosshairs|dot|exclamation|minus|pen|pin|plus|question|smile|xmark))/,
  /^nfc-(lock|magnifying-glass|pen|signal|slash|trash)$/,

  // ── 4. Redundant variants of a curated glyph ──
  //
  // A variant that only changes a fill level, a needle position, a rotation, a status badge or the
  // scenery behind a glyph the vocabulary already carries adds picker rows without adding an idea.
  // The picker shows seven or eight rows at a time and generates each label from the icon code, so
  // nine thermometers spend two viewports saying "temperature". What stays is ONE member per
  // idea — the clearest glyph for it, plus any member of the same family that means something
  // DIFFERENT rather than more or less of the same thing. The steps between go.
  //
  // Deliberately NOT "the ends of a ladder", which is what this said until review measured it
  // against what ships and found it predicted the opposite on two families of three. Temperature
  // DROPS both its ends (`-empty`, `-full`) and keeps two middles, because hot and cold are two
  // conditions while a fill level is one condition drawn nine times; battery keeps its ends only
  // because a dead cell and a charged one are likewise two conditions rather than two degrees.
  // And a single member need not be the BARE code: the gauges differ only by needle position, so
  // the family contributes one dial, and the one worth having is the legible one.
  //
  // A `-slash` is NOT a fill level and is not caught here. A crossed-out droplet means "no water",
  // which is a different statement from "water", and fiction says both.
  //
  // Neither is a badge on a DEPICTED OBJECT, and that line is what keeps
  // `wheat-awn-circle-exclamation` in. A tick on a circle is a control saying "done"; a warning on
  // an ear of wheat is a blighted crop, a warning on an aircraft is a grounded flight, and a cross
  // on a road is a road nobody is getting down. Those are events a story is made of, so the badge
  // is the point of the drawing rather than a status light stuck on it. The badges the affordance
  // block above catches are the ones stuck on a SHAPE, which depicts nothing to make a statement
  // about.
  //
  // Kept: battery-empty and battery-full; thermometer with temperature-high and temperature-low;
  // gauge-high; shop and store; city; jet-fighter; tower-broadcast and tower-observation; one
  // clock; one hourglass at half; one calendar; one speech bubble and one pair of them.
  /^battery-(half|quarter|three-quarters|low|bolt|exclamation)$/,
  /^gauge(-simple)?(-(low|med|med-low|med-high|min|max))?$/,
  /^gauge(-simple)?-circle-/,
  /^dial(-(high|low|max|med|med-high|med-low|min|off))?$/,
  /^jet-fighter-up$/,
  /^mountain-city$/,
  /^shop-lock$/,
  /^temperature-(arrow-down|arrow-up|empty|full|half|quarter|three-quarters)$/,
  /^tower-cell$/,
  /^tree-city$/,
  /^clock-(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)-thirty$/,
  /^clock-(one|two|three|five|six|seven|eight|nine|ten|eleven|twelve|desk)$/,
  /^hourglass-(start|end|clock)$/,
  /^chess-(bishop|king|knight|pawn|queen|rook)-piece$/,
  /^anchor-(circle|lock)/,
  /^head-side-(cough(-slash)?|mask|virus)$/,
  /^calendar-(arrow|check|circle|clock|day|days|download|edit|exclamation|heart|image|lines|minus|note|pen|plus|range|star|time|times|upload|users|week|xmark)/,
  /^calendars$/,
  /^comment-(alt|arrow|captions|check|code|dot|dots|edit|exclamation|heart|image|lines|middle|minus|music|pen|plus|question|quote|slash|smile|sms|text|times|waveform|xmark)/,
  /^comments-(alt|dollar|question)/,
  /^cart-(arrow-down|arrow-up|flatbed-suitcase|shopping-fast)$/,
  /^bag-shopping$/,
  /^grid-(2|3|4|5|round-2|round-4|round-5|dividers|horizontal|vertical)/,
  /^circle-(half-stroke-horizontal|half-horizontal|quarter-stroke|three-quarters-stroke)$/,
  /^gauge-simple-high$/,
  /^signal-(bars(-(fair|good|slash|strong|weak))?|exclamation|fair|good|strong|weak)$/,
  /^wifi-(exclamation|fair|weak)$/,
  /^transporter-([1-7]|empty)$/,
  /^(trash|trash-can)-(arrow|check|clock|list|plus|slash|xmark)/,
  /^toilet-paper-(blank-under|check|reverse|slash|under|xmark)/,
  /^traffic-light-(go|slow|stop)$/,
  /^(store|shop)-(24|lock|slash)$/,
  /^(stopwatch-20|shuttle-space-vertical)$/,
  /^temperature-(frigid|hot|list)$/,
  /^360-degrees$/,
  /^eye-dropper-(full|half)$/,
  /^moon-.+-inverse$/,
  /^computer-mouse-(button-left|button-right|scrollwheel)$/,
  /^(mobile|tablet)-(arrow-down|button|iphone|rotate|rotate-reverse|rugged|screen|screen-button|signal|signal-out|vibrate|vibrate-slash)$/,
  /^(album|bag-shopping|basket-shopping|bell|book|bookmark|box|cart|cowbell|memo|microphone|plug|rectangle-history)-circle-/,
  /^cart-(minus|plus|xmark|shopping-fast)$/,
  /^(bag|basket)-shopping-(minus|plus)$/,
  /^messages?-/,
  /^user-(circle-(minus|plus)|dashed|edit|gear|magnifying-glass|question|tag|times|viewfinder)$/,
  /^user-([a-z-]+-)?hair($|-)/,
  /^video-(arrow|down-to-line|plus|question)/,
  /^(heart|rainbow|star-sharp)-half($|-)/,

  // ── Remaining out-of-scope icons ──
  //
  // Members that no category above predicts and that no story is reaching for.
  /^(fingerprint|language|notdef|ditto|icons|icons-alt|font-awesome|web-awesome|square-font-awesome)($|-)/,
  /^(poo|poo-storm|poop|hand-middle-finger)$/
]);

/**
 * Whether a single icon NAME matches one of the exclusions.
 *
 * Named for what it does. It answers "does this name match an exclusion", NOT "is this icon
 * available": it consults no catalogue, so it says `false` of a typo and of a name Foundry cannot
 * render. Membership is `isCuratedIconEntry` applied to a catalogue entry, or `findCuratedIcon`
 * applied to a name, and the curated vocabulary below is built that way and nowhere else.
 *
 * @param {string} iconName a bare Font Awesome icon name, such as `mortar-pestle`
 * @returns {boolean}
 */
export function isExcludedIconName(iconName) {
  const normalized = String(iconName || '').trim();
  if (!normalized) return true;
  return EXCLUDED_ICON_CODE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Whether a catalogue entry belongs to the curated vocabulary.
 *
 * A glyph is curated when NONE of its names is excluded. Evaluating every name rather than only
 * the offered one is what keeps the exclusions about depiction: `car` and `automobile` are one
 * drawing, and a rule that excluded only the name it happened to list would offer the other.
 *
 * @param {{ iconCode: string, aliases?: ReadonlyArray<string> }} definition
 * @returns {boolean}
 */
export function isCuratedIconEntry(definition) {
  const iconCode = String(definition?.iconCode || '').trim();
  if (!iconCode) return false;
  const aliases = Array.isArray(definition?.aliases) ? definition.aliases : [];
  return ![iconCode, ...aliases].some((name) => isExcludedIconName(name));
}

/**
 * The curated vocabulary: every catalogue entry that survives the exclusions above.
 *
 * This is the ONE vocabulary Fabricate's pickers draw from, and it is constructed HERE and only
 * here. A surface that hand-curates a second list has created a second vocabulary that drifts from
 * this one; and a name added BESIDE this filter rather than to the catalogue would be a name the
 * catalogue cannot vouch for, which is how a set ends up offering an icon Foundry cannot draw.
 *
 * @type {ReadonlyArray<{ iconCode: string, label: string, aliases: ReadonlyArray<string> }>}
 */
export const FOUNDRY_CURATED_ICON_DEFINITIONS = Object.freeze(
  FOUNDRY_ICON_DEFINITIONS.filter(isCuratedIconEntry)
);

const curatedByName = new Map();
for (const definition of FOUNDRY_CURATED_ICON_DEFINITIONS) {
  curatedByName.set(definition.iconCode, definition);
  for (const alias of definition.aliases) curatedByName.set(alias, definition);
}

/**
 * The curated entry a name resolves to, under its offered name or any of its aliases.
 *
 * This is the membership check: unlike `isExcludedIconName` it answers from the catalogue, so a
 * name Foundry cannot render resolves to null however plausible it looks.
 *
 * @param {string} iconName
 * @returns {{ iconCode: string, label: string, aliases: ReadonlyArray<string> }|null}
 */
export function findCuratedIcon(iconName) {
  return curatedByName.get(String(iconName || '').trim()) ?? null;
}
