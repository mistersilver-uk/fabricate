import { FOUNDRY_ICON_DEFINITIONS } from './foundryIconCatalogue.js';

export {
  FOUNDRY_ICON_DEFINITIONS,
  FOUNDRY_ICON_BUNDLE_RELEASE,
  FOUNDRY_ICON_FREE_INTERSECTION
} from './foundryIconCatalogue.js';

// The patterns that decide what the curated icon vocabulary leaves OUT. The rule they serve — a
// glyph suits ANY fiction and Foundry can render it, so the question is "is there a story this
// picture belongs in" — and every exclusion category below are specified in
// `openspec/specs/ui-visual-style/spec.md`, `#### Icon vocabulary`. That requirement also states why
// a pattern matching nothing today is RETAINED: Font Awesome promotes icons out of Pro, so a
// deleted pattern stops excluding the moment its members are promoted, with nothing to report it.
//
// `circleapore-dollar`, `squareapore-dollar` and `signapore-dollar-sign` are genuine upstream Font
// Awesome spellings, measured in Foundry's own bundle. They are not to be "corrected".
export const EXCLUDED_ICON_CODE_PATTERNS = Object.freeze([

  // Single characters and typographic marks: a picker offering "E" beside "Dragon" is offering a
  // font. Deliberately NOT here: `asterisk`, `exclamation` and `question`, which read as a drawing
  // as readily as a mark — they are what a story hangs over a character's head.
  /^\d$/,
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

  // Emoji reactions: a grinning face is a reaction to a story, not a thing in one. Both the `face-`
  // prefix Font Awesome 6 gave them and the bare names Pro still carries alongside it.
  /^face-/,
  /^(angry|dizzy|exploding-head|flushed|frown|frown-open|grimace|grin|grin-alt|grin-beam|grin-beam-sweat|grin-hearts|grin-squint|grin-squint-tears|grin-stars|grin-tears|grin-tongue|grin-tongue-squint|grin-tongue-wink|grin-wink|hushed|kiss|kiss-beam|kiss-wink-heart|laugh|laugh-beam|laugh-squint|laugh-wink|meh|meh-blank|meh-rolling-eyes|sad-cry|sad-tear|smile|smile-beam|smile-plus|smile-wink|surprise|tired|weary|woozy)$/,

  // 1. Software affordances: glyphs meaning "click me" or "this file is a spreadsheet". Not because
  // they are modern — a starship console has buttons — but because their subject is the software. A
  // rack of servers, a chip, a satellite dish, a laptop and a robot are DEPICTED OBJECTS and stay.

  // The whole navigational vocabulary, every member of which means "go that way". `arrow-archery`
  // is the one the weapons rule pulls back out: it draws a projectile, not a direction.
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

  // Windows and the desktop metaphor: the MACHINE is an object and stays, its screen chrome is not.
  /^(window|windows|browser|browsers|sidebar|panel|dashboard|screen-users|display-(arrow|chart|code|slash))($|-)/,
  /^(rectangle|square)-(ad|history|list|pro|terminal|this-way-up|wide|xmark|kanban|barcode)$/,
  /^rectangle-(4k|api|beta|code|hd|high-dynamic-range|history|irc|n-a|new|sd|tall|vertical-history)/,
  /^rectangles-mixed$/,
  /^square-(code|root|rss)$/,

  // Files, formats and the mail SYSTEM. A sealed letter, an opened one and a letter with a page in
  // it are pre-modern objects and stay; a file format and a delivery-confirmation badge are not.
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

  // 2. Real-world institutions, currencies and causes.

  // A coin, a purse and a sack of gold are treasure in any fiction; a national currency's SIGN is a
  // present-day institution's mark, and so is the badge drawn around it.
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

  // The pictograms of a present-day relief operation, scoped by what the glyph DEPICTS: a glyph
  // from the same release drawing an ordinary object a character handles stays curated in, and
  // several do — a packed crate, a cooking burner, a borehole, a blighted ear of wheat.
  // `people-pulling` is the one member the depiction rule would admit; it is held out on the
  // REDUNDANCY rule instead, because `people-carry-box` already carries that idea.
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

  // Symbols standing for an access provision or political cause rather than depicting an object.
  /^(american-sign-language-interpreting|asl-interpreting|assistive-listening-systems|audio-description|blind|braille|closed-captioning|deaf|deafness|hard-of-hearing|universal-access|low-vision)($|-)/,
  /^(ear-(deaf|listen)|eye-low-vision|hands-asl-interpreting|hands-american-sign-language-interpreting|person-cane|wheelchair(-move)?)$/,
  /^(check-to-slot|democrat|republican|person-booth|landmark-(dome|flag)|recycle|ban-smoking|flag-usa)$/,
  /^(genderless|neuter|non-binary|transgender)$/,

  // 3. Present-day signage: pictograms that LABEL a building rather than depict a thing inside it.
  // The toilet, the bath and the ambulance those signs point at are objects, and all stay curated.
  /^(restroom|do-not-enter|ban($|-(bug|parking))|hospital-symbol|helicopter-symbol|square-parking|circle-parking|parking|elevator|escalator|street-view|location-(arrow|check|crosshairs|dot|exclamation|minus|pen|pin|plus|question|smile|xmark))/,
  /^nfc-(lock|magnifying-glass|pen|signal|slash|trash)$/,

  // 4. Redundant variants. What stays is ONE member per idea, plus any member of the same family
  // meaning something DIFFERENT rather than more or less of the same thing; the steps between go.
  // It is NOT "the ends of a ladder": temperature drops BOTH its ends and keeps two middles,
  // because hot and cold are two conditions while a fill level is one condition drawn nine times,
  // and battery keeps its ends only because a dead cell and a charged one are two conditions too.
  // A `-slash` is not a fill level — "no water" is a different statement from "water".
  // Neither is a badge on a DEPICTED OBJECT, which is what keeps `wheat-awn-circle-exclamation`:
  // a warning on an ear of wheat is a blighted crop, where a tick on a circle is a control saying
  // "done". The affordance block above catches the badges stuck on a SHAPE, which depicts nothing.
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

  // Members no category above predicts, and that no story is reaching for.
  /^(fingerprint|language|notdef|ditto|icons|icons-alt|font-awesome|web-awesome|square-font-awesome)($|-)/,
  /^(poo|poo-storm|poop|hand-middle-finger)$/
]);

// Answers "does this name match an exclusion", NOT "is this icon available": it consults no
// catalogue, so it says `false` of a typo and of a name Foundry cannot render. MEMBERSHIP is
// `isCuratedIconEntry` over a catalogue entry, or `findCuratedIcon` over a name.
export function isExcludedIconName(iconName) {
  const normalized = String(iconName || '').trim();
  if (!normalized) return true;
  return EXCLUDED_ICON_CODE_PATTERNS.some((pattern) => pattern.test(normalized));
}

// A glyph is curated when NONE of its names is excluded. Evaluating every name is what keeps the
// exclusions about DEPICTION: `car` and `automobile` are one drawing.
export function isCuratedIconEntry(definition) {
  const iconCode = String(definition?.iconCode || '').trim();
  if (!iconCode) return false;
  const aliases = Array.isArray(definition?.aliases) ? definition.aliases : [];
  return ![iconCode, ...aliases].some((name) => isExcludedIconName(name));
}

// The ONE vocabulary Fabricate's pickers draw from, constructed HERE and only here. A surface
// hand-curating a second list has created a vocabulary that drifts from this one, and a name added
// BESIDE this filter rather than to the catalogue is one the catalogue cannot vouch for.
export const FOUNDRY_CURATED_ICON_DEFINITIONS = Object.freeze(
  FOUNDRY_ICON_DEFINITIONS.filter(isCuratedIconEntry)
);

const curatedByName = new Map();
for (const definition of FOUNDRY_CURATED_ICON_DEFINITIONS) {
  curatedByName.set(definition.iconCode, definition);
  for (const alias of definition.aliases) curatedByName.set(alias, definition);
}

// The membership check: unlike `isExcludedIconName` it answers from the CATALOGUE, so a name
// Foundry cannot render resolves to null however plausible it looks.
export function findCuratedIcon(iconName) {
  return curatedByName.get(String(iconName || '').trim()) ?? null;
}
