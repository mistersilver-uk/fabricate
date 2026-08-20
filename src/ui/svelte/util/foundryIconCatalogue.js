// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/generate-icon-catalogue.mjs <foundry>/resources/app/public/fonts/fontawesome
//
// Every icon the Font Awesome bundle Foundry ships can render, measured from that bundle rather
// than from Font Awesome's published metadata. The predecessor of this file was generated from
// Font Awesome Free 6.7.2 metadata, which describes a DIFFERENT font from the one a Foundry client
// loads: Foundry bundles Font Awesome Pro 7.2.0. An icon Foundry renders was
// therefore unofferable whenever the free release happened to lack it, which is why
// `candle-holder` — a Pro icon that renders correctly in Foundry today — was absent.
//
// WHAT THIS FILE IS AND IS NOT LICENSED TO DO. Font Awesome Pro's font files are Foundry's to
// ship and Foundry ships them; this file bundles none of them. It records NAMES, and a name is a
// configuration value that Foundry's own stylesheet resolves against the font a Foundry client has
// already loaded. Writing `fas fa-candle-holder` and letting Foundry draw it is using Foundry as
// it is meant to be used; copying a `.woff2` into a module is not, and nothing here does. The
// generator reads the installed bundle to learn what exists and emits names, never glyph outlines.
// Ruled by the maintainer, and it governs the whole vocabulary rather than the two glyphs the
// question was first raised about.
//
// Measured from Foundry 14.365.0's bundle:
//   4318 rules assign a glyph, over 5371 `.fa-` names.
//   3768 of those glyphs are classic; the rest are the 550 the brands face draws.
//   The classic solid and regular faces carry an identical 4580-codepoint cmap.
//
// THE ENTRY SHAPE, and the three decisions behind it:
//
// `iconCode` — the name the vocabulary offers and persists. Several names routinely share one
// glyph (`.fa-baby-carriage,.fa-carriage-baby{--fa:"\f77d"}` is one picture under two names), so
// there is one entry per GLYPH, not per name. Which name is offered is a presentation choice and
// not a claim about Font Awesome's canonical spelling: the bundle cannot answer that, because
// every one of its 919 multi-name selector lists is sorted alphabetically and the order
// therefore carries no information. `preferredIconName` in scripts/lib/fontAwesomeBundle.js states
// the tie-break it uses instead.
//
// `aliases` — every other name the bundle gives the same glyph, kept rather than discarded. They
// are searchable and they resolve, so offering one name refuses none: a GM who types `cog` finds
// the gear, and a module that persisted `fas fa-cog` gets the gear's row. They also make the
// curated vocabulary's exclusions sound, because an exclusion describes what a glyph DEPICTS and a
// depiction cannot be dodged by spelling: `automobile` is the same drawing as `car`.
//
// `hasRegular` — GONE, and deliberately so rather than left stale. It was meaningful under Font
// Awesome Free, where the regular weight covered a small subset. It is not meaningful here: the
// classic solid and regular faces Foundry ships carry the SAME 4580 codepoints, so the field
// would read `true` for every entry and distinguish nothing, while making a picker offer two rows
// of the same drawing at two weights. The `far` prefix is still accepted and still renders; it is
// simply not a second row.
//
// THE ROW ENCODING, and why the entries below are text rather than object literals. One entry per
// line, fields separated by `|`: `iconCode|label|alias,alias`, with the alias field omitted when
// a glyph has no other names. The obvious form — one object literal per glyph — is what this file
// used to hold, and it read well; it also handed a copy-paste detector thousands of near-identical
// token sequences, and SonarCloud duly failed this file as duplicated new code. A template literal
// is ONE token, so the same data costs one. The generator refuses to emit a field containing a
// delimiter, a newline, a backtick, a backslash or a `${` — it throws, naming the entry — because
// a file that parses back into something other than what was measured is worse than a generation
// that fails. Parsing costs one split per file and two per row, at module load.
//
// VERSION COUPLING. This file describes ONE Foundry release's bundle. When Foundry bumps Font
// Awesome, rerun the generator against the new install: names are added, and Font Awesome does
// retire and re-alias names between majors, so an icon a GM chose can become an alias of another
// glyph. Running the generator with `--check` reports whether the bundle moved without writing.

const ICON_ROWS = `
0|0
00|00
1|1
2|2
3|3
360-degrees|360 Degrees
4|4
5|5
6|6
7|7
8|8
9|9
a|A
abacus|Abacus
accent-grave|Accent Grave
acorn|Acorn
address-book|Address Book|contact-book
address-card|Address Card|contact-card,vcard
aeropress|Aeropress
air-conditioner|Air Conditioner
airplay|Airplay
airplay-audio|Airplay Audio
alarm-clock|Alarm Clock
alarm-exclamation|Alarm Exclamation
alarm-minus|Alarm Minus
alarm-plus|Alarm Plus
alarm-snooze|Alarm Snooze
album|Album
album-circle-plus|Album Circle Plus
album-circle-user|Album Circle User
album-collection|Album Collection
album-collection-circle-plus|Album Collection Circle Plus
album-collection-circle-user|Album Collection Circle User
alicorn|Alicorn
alien|Alien
alien-monster|Alien Monster|alien-8bit
align-center|Align Center
align-justify|Align Justify
align-left|Align Left
align-right|Align Right
align-slash|Align Slash
almost-equal-to|Almost Equal To
alt|Alt
amp-guitar|Amp Guitar
ampersand|Ampersand
anchor|Anchor
anchor-circle-check|Anchor Circle Check
anchor-circle-exclamation|Anchor Circle Exclamation
anchor-circle-xmark|Anchor Circle Xmark
anchor-lock|Anchor Lock
angel|Angel
angle|Angle
angle-90|Angle 90
angle-double-down|Angle Double Down|angles-down
angle-double-left|Angle Double Left|angles-left
angle-double-right|Angle Double Right|angles-right
angle-double-up|Angle Double Up|angles-up
angle-down|Angle Down
angle-left|Angle Left
angle-right|Angle Right
angle-up|Angle Up
angles-up-down|Angles Up Down
ankh|Ankh
ant|Ant
apartment|Apartment
aperture|Aperture
apostrophe|Apostrophe
apple-core|Apple Core
apple-crate|Apple Crate
apple-whole|Apple Whole|apple-alt
aquarius|Aquarius
archway|Archway
aries|Aries
arrow-archery|Arrow Archery
arrow-down|Arrow Down
arrow-down-a-z|Arrow Down A Z|sort-alpha-asc,sort-alpha-down
arrow-down-arrow-up|Arrow Down Arrow Up|sort-alt
arrow-down-big-small|Arrow Down Big Small|sort-size-down
arrow-down-from-arc|Arrow Down From Arc
arrow-down-from-bracket|Arrow Down From Bracket
arrow-down-from-dotted-line|Arrow Down From Dotted Line
arrow-down-from-line|Arrow Down From Line|arrow-from-top
arrow-down-left|Arrow Down Left
arrow-down-left-and-arrow-up-right-to-center|Arrow Down Left And Arrow Up Right To Center
arrow-down-long|Arrow Down Long|long-arrow-down
arrow-down-long-to-line|Arrow Down Long To Line
arrow-down-right|Arrow Down Right
arrow-down-short-wide|Arrow Down Short Wide|sort-amount-desc,sort-amount-down-alt
arrow-down-small-big|Arrow Down Small Big|sort-size-down-alt
arrow-down-square-triangle|Arrow Down Square Triangle|sort-shapes-down-alt
arrow-down-to-arc|Arrow Down To Arc
arrow-down-to-bracket|Arrow Down To Bracket
arrow-down-to-dotted-line|Arrow Down To Dotted Line
arrow-down-to-line|Arrow Down To Line|arrow-to-bottom
arrow-down-to-square|Arrow Down To Square
arrow-down-triangle-square|Arrow Down Triangle Square|sort-shapes-down
arrow-down-up-across-line|Arrow Down Up Across Line
arrow-down-up-lock|Arrow Down Up Lock
arrow-down-wide-short|Arrow Down Wide Short|sort-amount-asc,sort-amount-down
arrow-down-z-a|Arrow Down Z A|sort-alpha-desc,sort-alpha-down-alt
arrow-left|Arrow Left
arrow-left-arrow-right|Arrow Left Arrow Right
arrow-left-from-arc|Arrow Left From Arc
arrow-left-from-bracket|Arrow Left From Bracket
arrow-left-from-dotted-line|Arrow Left From Dotted Line
arrow-left-from-line|Arrow Left From Line|arrow-from-right
arrow-left-long|Arrow Left Long|long-arrow-left
arrow-left-long-to-line|Arrow Left Long To Line
arrow-left-to-arc|Arrow Left To Arc
arrow-left-to-bracket|Arrow Left To Bracket
arrow-left-to-dotted-line|Arrow Left To Dotted Line
arrow-left-to-line|Arrow Left To Line|arrow-to-left
arrow-pointer|Arrow Pointer|mouse-pointer
arrow-progress|Arrow Progress
arrow-right|Arrow Right
arrow-right-arrow-left|Arrow Right Arrow Left|exchange
arrow-right-from-arc|Arrow Right From Arc
arrow-right-from-bracket|Arrow Right From Bracket|sign-out
arrow-right-from-dotted-line|Arrow Right From Dotted Line
arrow-right-from-file|Arrow Right From File|file-export
arrow-right-from-line|Arrow Right From Line|arrow-from-left
arrow-right-long|Arrow Right Long|long-arrow-right
arrow-right-long-to-line|Arrow Right Long To Line
arrow-right-to-arc|Arrow Right To Arc
arrow-right-to-bracket|Arrow Right To Bracket|sign-in
arrow-right-to-city|Arrow Right To City
arrow-right-to-dotted-line|Arrow Right To Dotted Line
arrow-right-to-file|Arrow Right To File|file-import
arrow-right-to-line|Arrow Right To Line|arrow-to-right
arrow-rotate-backward|Arrow Rotate Backward|arrow-left-rotate,arrow-rotate-back,arrow-rotate-left,undo
arrow-rotate-forward|Arrow Rotate Forward|arrow-right-rotate,arrow-rotate-right,redo
arrow-rotate-left-10|Arrow Rotate Left 10
arrow-rotate-left-15|Arrow Rotate Left 15
arrow-rotate-left-30|Arrow Rotate Left 30
arrow-rotate-right-10|Arrow Rotate Right 10
arrow-rotate-right-15|Arrow Rotate Right 15
arrow-rotate-right-30|Arrow Rotate Right 30
arrow-trend-down|Arrow Trend Down
arrow-trend-up|Arrow Trend Up
arrow-turn-down|Arrow Turn Down|level-down
arrow-turn-down-left|Arrow Turn Down Left
arrow-turn-down-right|Arrow Turn Down Right
arrow-turn-left|Arrow Turn Left
arrow-turn-left-down|Arrow Turn Left Down
arrow-turn-left-up|Arrow Turn Left Up
arrow-turn-right|Arrow Turn Right
arrow-turn-up|Arrow Turn Up|level-up
arrow-u-turn-down-left|Arrow U Turn Down Left
arrow-u-turn-down-right|Arrow U Turn Down Right
arrow-u-turn-left-down|Arrow U Turn Left Down
arrow-u-turn-left-up|Arrow U Turn Left Up
arrow-u-turn-right-down|Arrow U Turn Right Down
arrow-u-turn-right-up|Arrow U Turn Right Up
arrow-u-turn-up-left|Arrow U Turn Up Left
arrow-u-turn-up-right|Arrow U Turn Up Right
arrow-up|Arrow Up
arrow-up-9-1|Arrow Up 9 1|sort-numeric-up-alt
arrow-up-a-z|Arrow Up A Z|sort-alpha-up
arrow-up-arrow-down|Arrow Up Arrow Down|sort-up-down
arrow-up-big-small|Arrow Up Big Small|sort-size-up
arrow-up-from-arc|Arrow Up From Arc
arrow-up-from-bracket|Arrow Up From Bracket
arrow-up-from-dotted-line|Arrow Up From Dotted Line
arrow-up-from-ground-water|Arrow Up From Ground Water
arrow-up-from-line|Arrow Up From Line|arrow-from-bottom
arrow-up-from-square|Arrow Up From Square
arrow-up-from-water-pump|Arrow Up From Water Pump
arrow-up-left|Arrow Up Left
arrow-up-left-from-circle|Arrow Up Left From Circle
arrow-up-long|Arrow Up Long|long-arrow-up
arrow-up-long-to-line|Arrow Up Long To Line
arrow-up-right|Arrow Up Right
arrow-up-right-and-arrow-down-left-from-center|Arrow Up Right And Arrow Down Left From Center
arrow-up-right-dots|Arrow Up Right Dots
arrow-up-right-from-square|Arrow Up Right From Square|external-link
arrow-up-short-wide|Arrow Up Short Wide|sort-amount-up-alt
arrow-up-small-big|Arrow Up Small Big|sort-size-up-alt
arrow-up-square-triangle|Arrow Up Square Triangle|sort-shapes-up-alt
arrow-up-to-arc|Arrow Up To Arc
arrow-up-to-bracket|Arrow Up To Bracket
arrow-up-to-dotted-line|Arrow Up To Dotted Line
arrow-up-to-line|Arrow Up To Line|arrow-to-top
arrow-up-triangle-square|Arrow Up Triangle Square|sort-shapes-up
arrow-up-wide-short|Arrow Up Wide Short|sort-amount-up
arrow-up-z-a|Arrow Up Z A|sort-alpha-up-alt
arrows|Arrows|arrows-up-down-left-right
arrows-cross|Arrows Cross
arrows-down-to-line|Arrows Down To Line
arrows-down-to-people|Arrows Down To People
arrows-from-dotted-line|Arrows From Dotted Line
arrows-from-line|Arrows From Line
arrows-left-right|Arrows Left Right|arrows-h
arrows-left-right-to-line|Arrows Left Right To Line
arrows-maximize|Arrows Maximize|expand-arrows
arrows-minimize|Arrows Minimize|compress-arrows
arrows-repeat|Arrows Repeat|repeat-alt
arrows-repeat-1|Arrows Repeat 1|repeat-1-alt
arrows-retweet|Arrows Retweet|retweet-alt
arrows-rotate|Arrows Rotate|refresh,sync
arrows-rotate-reverse|Arrows Rotate Reverse
arrows-spin|Arrows Spin
arrows-split-up-and-left|Arrows Split Up And Left
arrows-to-circle|Arrows To Circle
arrows-to-dot|Arrows To Dot
arrows-to-dotted-line|Arrows To Dotted Line
arrows-to-eye|Arrows To Eye
arrows-to-line|Arrows To Line
arrows-turn-right|Arrows Turn Right
arrows-turn-to-dots|Arrows Turn To Dots
arrows-up-down|Arrows Up Down|arrows-v
arrows-up-to-line|Arrows Up To Line
asterisk|Asterisk
at|At
atom|Atom
atom-simple|Atom Simple|atom-alt
audio-description|Audio Description
audio-description-slash|Audio Description Slash
austral-sign|Austral Sign
australian-dollar-sign|Australian Dollar Sign
avocado|Avocado
award|Award
award-simple|Award Simple
axe|Axe
axe-battle|Axe Battle
b|B
baby|Baby
baby-carriage|Baby Carriage|carriage-baby
backpack|Backpack
backward|Backward
backward-fast|Backward Fast|fast-backward
backward-step|Backward Step|step-backward
bacon|Bacon
bacteria|Bacteria
bacterium|Bacterium
badge|Badge
badge-check|Badge Check
badge-dollar|Badge Dollar
badge-percent|Badge Percent
badge-sheriff|Badge Sheriff
badger-honey|Badger Honey
badminton|Badminton
bag-seedling|Bag Seedling
bag-shopping|Bag Shopping|shopping-bag
bag-shopping-minus|Bag Shopping Minus
bag-shopping-plus|Bag Shopping Plus
bagel|Bagel
bags-shopping|Bags Shopping
baguette|Baguette
baht-sign|Baht Sign
balance-scale-left|Balance Scale Left|scale-unbalanced
ball-pile|Ball Pile
ball-yarn|Ball Yarn
balloon|Balloon
balloons|Balloons
ballot|Ballot
ballot-check|Ballot Check
ban|Ban|cancel
ban-bug|Ban Bug|debug
ban-smoking|Ban Smoking|smoking-ban
banana|Banana
band-aid|Band Aid|bandage
bangladeshi-taka-sign|Bangladeshi Taka Sign
banjo|Banjo
bar-progress|Bar Progress
bar-progress-empty|Bar Progress Empty
bar-progress-full|Bar Progress Full
bar-progress-half|Bar Progress Half
bar-progress-quarter|Bar Progress Quarter
bar-progress-three-quarters|Bar Progress Three Quarters
barcode|Barcode
barcode-read|Barcode Read
barcode-scan|Barcode Scan
barn|Barn
barn-silo|Barn Silo|farm
bars|Bars|navicon
bars-filter|Bars Filter
bars-progress|Bars Progress|tasks-alt
bars-sort|Bars Sort
bars-staggered|Bars Staggered|reorder,stream
baseball|Baseball|baseball-ball
baseball-bat|Baseball Bat
baseball-bat-ball|Baseball Bat Ball
basket-shopping|Basket Shopping|shopping-basket
basket-shopping-minus|Basket Shopping Minus
basket-shopping-plus|Basket Shopping Plus
basket-shopping-simple|Basket Shopping Simple|shopping-basket-alt
basketball|Basketball|basketball-ball
basketball-hoop|Basketball Hoop
bat|Bat
bathtub|Bathtub|bath
battery|Battery|battery-5,battery-full
battery-bolt|Battery Bolt
battery-empty|Battery Empty|battery-0
battery-exclamation|Battery Exclamation
battery-half|Battery Half|battery-3
battery-low|Battery Low|battery-1
battery-quarter|Battery Quarter|battery-2
battery-slash|Battery Slash
battery-three-quarters|Battery Three Quarters|battery-4
bed|Bed
bed-bunk|Bed Bunk
bed-empty|Bed Empty
bed-front|Bed Front|bed-alt
bed-pulse|Bed Pulse|procedures
bee|Bee
beer|Beer|beer-mug-empty
beer-foam|Beer Foam|beer-mug
bell|Bell
bell-concierge|Bell Concierge|concierge-bell
bell-exclamation|Bell Exclamation
bell-on|Bell On
bell-plus|Bell Plus
bell-ring|Bell Ring
bell-school|Bell School
bell-school-slash|Bell School Slash
bell-slash|Bell Slash
bells|Bells
bench-tree|Bench Tree
bezier-curve|Bezier Curve
bicep|Bicep
bicycle|Bicycle
billboard|Billboard
bin|Bin
bin-bottles|Bin Bottles
bin-bottles-recycle|Bin Bottles Recycle
bin-recycle|Bin Recycle
binary|Binary
binary-circle-check|Binary Circle Check
binary-lock|Binary Lock
binary-slash|Binary Slash
binoculars|Binoculars
biohazard|Biohazard
bird|Bird
bitcoin-sign|Bitcoin Sign
blanket|Blanket
blanket-fire|Blanket Fire
blender|Blender
blender-phone|Blender Phone
blinds|Blinds
blinds-open|Blinds Open
blinds-raised|Blinds Raised
block|Block
block-brick|Block Brick|wall-brick
block-brick-fire|Block Brick Fire|firewall
block-question|Block Question
block-quote|Block Quote
blog|Blog
blueberries|Blueberries
bold|Bold
bolt|Bolt|zap
bolt-auto|Bolt Auto
bolt-lightning|Bolt Lightning
bolt-slash|Bolt Slash
bomb|Bomb
bone|Bone
bone-break|Bone Break
bong|Bong
book|Book
book-arrow-right|Book Arrow Right
book-arrow-up|Book Arrow Up
book-atlas|Book Atlas|atlas
book-bible|Book Bible|bible
book-blank|Book Blank|book-alt
book-bookmark|Book Bookmark
book-circle-arrow-right|Book Circle Arrow Right
book-circle-arrow-up|Book Circle Arrow Up
book-copy|Book Copy
book-font|Book Font
book-heart|Book Heart
book-journal-whills|Book Journal Whills|journal-whills
book-medical|Book Medical
book-open|Book Open
book-open-cover|Book Open Cover|book-open-alt
book-open-lines|Book Open Lines
book-open-reader|Book Open Reader|book-reader
book-quran|Book Quran|quran
book-section|Book Section|book-law
book-skull|Book Skull|book-dead
book-sparkles|Book Sparkles|book-spells
book-spine|Book Spine
book-tanakh|Book Tanakh|tanakh
book-user|Book User
bookmark|Bookmark
bookmark-plus|Bookmark Plus
bookmark-slash|Bookmark Slash
books|Books
books-medical|Books Medical
boombox|Boombox
boot|Boot
boot-heeled|Boot Heeled
booth-curtain|Booth Curtain
border-all|Border All
border-bottom|Border Bottom
border-bottom-right|Border Bottom Right|border-style-alt
border-center-h|Border Center H
border-center-v|Border Center V
border-inner|Border Inner
border-left|Border Left
border-none|Border None
border-outer|Border Outer
border-right|Border Right
border-top|Border Top
border-top-left|Border Top Left|border-style
bore-hole|Bore Hole
bottle-baby|Bottle Baby
bottle-droplet|Bottle Droplet
bottle-water|Bottle Water
bow-archery|Bow Archery
bow-arrow|Bow Arrow
bowl-chopsticks|Bowl Chopsticks
bowl-chopsticks-noodles|Bowl Chopsticks Noodles
bowl-food|Bowl Food
bowl-hot|Bowl Hot|soup
bowl-rice|Bowl Rice
bowl-salad|Bowl Salad|salad
bowl-scoops|Bowl Scoops
bowl-shaved-ice|Bowl Shaved Ice|bowl-scoop
bowl-soft-serve|Bowl Soft Serve
bowl-spoon|Bowl Spoon
bowling-ball|Bowling Ball
bowling-ball-pin|Bowling Ball Pin
bowling-pins|Bowling Pins
box|Box
box-archive|Box Archive|archive
box-arrow-down|Box Arrow Down
box-arrow-down-arrow-up|Box Arrow Down Arrow Up
box-arrow-down-magnifying-glass|Box Arrow Down Magnifying Glass
box-arrow-up|Box Arrow Up
box-ballot|Box Ballot
box-check|Box Check
box-circle-check|Box Circle Check
box-dollar|Box Dollar|box-usd
box-heart|Box Heart
box-isometric|Box Isometric
box-isometric-tape|Box Isometric Tape
box-magnifying-glass|Box Magnifying Glass
box-open|Box Open
box-open-full|Box Open Full|box-full
box-taped|Box Taped|box-alt
box-tissue|Box Tissue
boxes|Boxes|boxes-alt,boxes-stacked
boxes-packing|Boxes Packing
boxing-glove|Boxing Glove|glove-boxing
bra|Bra
bracket|Bracket|bracket-left,bracket-square
bracket-curly|Bracket Curly|bracket-curly-left
bracket-curly-right|Bracket Curly Right
bracket-round|Bracket Round|parenthesis
bracket-round-right|Bracket Round Right
bracket-square-right|Bracket Square Right
brackets|Brackets|brackets-square
brackets-curly|Brackets Curly
brackets-round|Brackets Round|parentheses
braille|Braille
brain|Brain
brain-arrow-curved-right|Brain Arrow Curved Right|mind-share
brain-circuit|Brain Circuit
brake-warning|Brake Warning
brazilian-real-sign|Brazilian Real Sign
bread-loaf|Bread Loaf
bread-slice|Bread Slice
bread-slice-butter|Bread Slice Butter
bridge|Bridge
bridge-circle-check|Bridge Circle Check
bridge-circle-exclamation|Bridge Circle Exclamation
bridge-circle-xmark|Bridge Circle Xmark
bridge-lock|Bridge Lock
bridge-suspension|Bridge Suspension
bridge-water|Bridge Water
briefcase|Briefcase
briefcase-arrow-right|Briefcase Arrow Right
briefcase-blank|Briefcase Blank
briefcase-clock|Briefcase Clock|business-time
briefcase-medical|Briefcase Medical
briefs|Briefs
brightness|Brightness
brightness-low|Brightness Low
bring-forward|Bring Forward
bring-front|Bring Front
broccoli|Broccoli
broom|Broom
broom-ball|Broom Ball|quidditch,quidditch-broom-ball
broom-wide|Broom Wide
browser|Browser
browsers|Browsers
brush|Brush
bucket|Bucket
bug|Bug
bug-slash|Bug Slash
bugs|Bugs
building|Building
building-circle-arrow-right|Building Circle Arrow Right
building-circle-check|Building Circle Check
building-circle-exclamation|Building Circle Exclamation
building-circle-xmark|Building Circle Xmark
building-columns|Building Columns|bank,institution,museum,university
building-flag|Building Flag
building-lock|Building Lock
building-magnifying-glass|Building Magnifying Glass
building-memo|Building Memo
building-ngo|Building Ngo
building-shield|Building Shield
building-un|Building Un
building-user|Building User
building-wheat|Building Wheat
buildings|Buildings
bulldozer|Bulldozer
bullhorn|Bullhorn
bullseye|Bullseye
bullseye-arrow|Bullseye Arrow
bullseye-pointer|Bullseye Pointer
buoy|Buoy
buoy-mooring|Buoy Mooring
burger|Burger|hamburger
burger-cheese|Burger Cheese|cheeseburger
burger-fries|Burger Fries
burger-glass|Burger Glass
burger-lettuce|Burger Lettuce
burger-soda|Burger Soda
burrito|Burrito
burst|Burst
burst-new|Burst New
bus|Bus
bus-school|Bus School
bus-side|Bus Side
bus-simple|Bus Simple|bus-alt
bus-stop|Bus Stop
butter|Butter
butterfly|Butterfly
c|C
cabin|Cabin
cabinet-filing|Cabinet Filing
cable-car|Cable Car|tram
cactus|Cactus
caduceus|Caduceus
cake|Cake|birthday-cake,cake-candles
cake-slice|Cake Slice|shortcake
calculator|Calculator
calculator-simple|Calculator Simple|calculator-alt
calendar|Calendar
calendar-arrow-down|Calendar Arrow Down|calendar-download
calendar-arrow-up|Calendar Arrow Up|calendar-upload
calendar-check|Calendar Check
calendar-circle-exclamation|Calendar Circle Exclamation
calendar-circle-minus|Calendar Circle Minus
calendar-circle-plus|Calendar Circle Plus
calendar-circle-user|Calendar Circle User
calendar-clock|Calendar Clock|calendar-time
calendar-day|Calendar Day
calendar-days|Calendar Days|calendar-alt
calendar-exclamation|Calendar Exclamation
calendar-heart|Calendar Heart
calendar-image|Calendar Image
calendar-lines|Calendar Lines|calendar-note
calendar-lines-pen|Calendar Lines Pen
calendar-minus|Calendar Minus
calendar-pen|Calendar Pen|calendar-edit
calendar-plus|Calendar Plus
calendar-range|Calendar Range
calendar-star|Calendar Star
calendar-users|Calendar Users
calendar-week|Calendar Week
calendar-xmark|Calendar Xmark|calendar-times
calendars|Calendars
camera|Camera|camera-alt
camera-cctv|Camera Cctv|cctv
camera-circle-ellipsis|Camera Circle Ellipsis
camera-clock|Camera Clock
camera-movie|Camera Movie
camera-polaroid|Camera Polaroid
camera-retro|Camera Retro
camera-rotate|Camera Rotate
camera-security|Camera Security|camera-home
camera-shutter|Camera Shutter
camera-slash|Camera Slash
camera-viewfinder|Camera Viewfinder|screenshot
camera-web|Camera Web|webcam
camera-web-slash|Camera Web Slash|webcam-slash
campfire|Campfire
campground|Campground
can-food|Can Food
cancer|Cancer
candle-holder|Candle Holder
candy|Candy
candy-bar|Candy Bar|chocolate-bar
candy-cane|Candy Cane
candy-corn|Candy Corn
cannabis|Cannabis
cannon|Cannon
canoe-person|Canoe Person
capricorn|Capricorn
capsule|Capsule
capsules|Capsules
car|Car|automobile
car-battery|Car Battery|battery-car
car-bolt|Car Bolt
car-building|Car Building
car-bump|Car Bump
car-burst|Car Burst|car-crash
car-bus|Car Bus
car-circle-bolt|Car Circle Bolt
car-garage|Car Garage
car-key|Car Key
car-mechanic|Car Mechanic|car-wrench
car-mirrors|Car Mirrors
car-on|Car On
car-people|Car People|carpool
car-rear|Car Rear|car-alt
car-side|Car Side
car-side-bolt|Car Side Bolt
car-siren|Car Siren
car-siren-on|Car Siren On
car-tilt|Car Tilt
car-tunnel|Car Tunnel
car-wash|Car Wash
caravan|Caravan
caravan-simple|Caravan Simple|caravan-alt
card-club|Card Club
card-diamond|Card Diamond
card-heart|Card Heart
card-spade|Card Spade
cards|Cards
cards-blank|Cards Blank
caret-down|Caret Down
caret-large-down|Caret Large Down
caret-large-left|Caret Large Left
caret-large-right|Caret Large Right
caret-large-up|Caret Large Up
caret-left|Caret Left
caret-right|Caret Right
caret-up|Caret Up
carrot|Carrot
cars|Cars
cart-arrow-down|Cart Arrow Down
cart-arrow-up|Cart Arrow Up
cart-circle-arrow-down|Cart Circle Arrow Down
cart-circle-arrow-up|Cart Circle Arrow Up
cart-circle-check|Cart Circle Check
cart-circle-exclamation|Cart Circle Exclamation
cart-circle-plus|Cart Circle Plus
cart-circle-xmark|Cart Circle Xmark
cart-flatbed|Cart Flatbed|dolly-flatbed
cart-flatbed-boxes|Cart Flatbed Boxes|dolly-flatbed-alt
cart-flatbed-empty|Cart Flatbed Empty|dolly-flatbed-empty
cart-flatbed-suitcase|Cart Flatbed Suitcase|luggage-cart
cart-minus|Cart Minus
cart-plus|Cart Plus
cart-shopping|Cart Shopping|shopping-cart
cart-shopping-fast|Cart Shopping Fast
cart-xmark|Cart Xmark
cash-register|Cash Register
cassette-betamax|Cassette Betamax|betamax
cassette-tape|Cassette Tape
cassette-vhs|Cassette Vhs|vhs
castle|Castle
cat|Cat
cat-space|Cat Space
cauldron|Cauldron
cedi-sign|Cedi Sign
cent-sign|Cent Sign
certificate|Certificate
chair|Chair
chair-office|Chair Office
chalkboard|Chalkboard|blackboard
chalkboard-teacher|Chalkboard Teacher|chalkboard-user
charging-station|Charging Station
chart-area|Chart Area|area-chart
chart-bar|Chart Bar|bar-chart
chart-bullet|Chart Bullet
chart-candlestick|Chart Candlestick
chart-column|Chart Column
chart-diagram|Chart Diagram
chart-fft|Chart Fft
chart-gantt|Chart Gantt
chart-kanban|Chart Kanban
chart-line|Chart Line|line-chart
chart-line-down|Chart Line Down
chart-line-up|Chart Line Up
chart-line-up-down|Chart Line Up Down
chart-mixed|Chart Mixed|analytics
chart-mixed-up-circle-currency|Chart Mixed Up Circle Currency
chart-mixed-up-circle-dollar|Chart Mixed Up Circle Dollar
chart-network|Chart Network
chart-pie|Chart Pie|pie-chart
chart-pie-simple|Chart Pie Simple|chart-pie-alt
chart-pie-simple-circle-currency|Chart Pie Simple Circle Currency
chart-pie-simple-circle-dollar|Chart Pie Simple Circle Dollar
chart-pyramid|Chart Pyramid
chart-radar|Chart Radar
chart-scatter|Chart Scatter
chart-scatter-3d|Chart Scatter 3d
chart-scatter-bubble|Chart Scatter Bubble
chart-simple|Chart Simple
chart-simple-horizontal|Chart Simple Horizontal
chart-sine|Chart Sine
chart-tree-map|Chart Tree Map
chart-waterfall|Chart Waterfall
check|Check
check-double|Check Double
check-to-slot|Check To Slot|vote-yea
cheese|Cheese
cheese-swiss|Cheese Swiss
chemex|Chemex
cherries|Cherries
chess|Chess
chess-bishop|Chess Bishop
chess-bishop-piece|Chess Bishop Piece|chess-bishop-alt
chess-board|Chess Board
chess-clock|Chess Clock
chess-clock-flip|Chess Clock Flip|chess-clock-alt
chess-king|Chess King
chess-king-piece|Chess King Piece|chess-king-alt
chess-knight|Chess Knight
chess-knight-piece|Chess Knight Piece|chess-knight-alt
chess-pawn|Chess Pawn
chess-pawn-piece|Chess Pawn Piece|chess-pawn-alt
chess-queen|Chess Queen
chess-queen-piece|Chess Queen Piece|chess-queen-alt
chess-rook|Chess Rook
chess-rook-piece|Chess Rook Piece|chess-rook-alt
chest-drawers|Chest Drawers
chestnut|Chestnut
chevron-double-down|Chevron Double Down|chevrons-down
chevron-double-left|Chevron Double Left|chevrons-left
chevron-double-right|Chevron Double Right|chevrons-right
chevron-double-up|Chevron Double Up|chevrons-up
chevron-down|Chevron Down
chevron-left|Chevron Left
chevron-right|Chevron Right
chevron-up|Chevron Up
chf-sign|Chf Sign
child|Child
child-combatant|Child Combatant|child-rifle
child-dress|Child Dress
child-reaching|Child Reaching
children|Children
chimney|Chimney
chopsticks|Chopsticks
church|Church
circle|Circle
circle-0|Circle 0
circle-1|Circle 1
circle-2|Circle 2
circle-3|Circle 3
circle-4|Circle 4
circle-5|Circle 5
circle-6|Circle 6
circle-7|Circle 7
circle-8|Circle 8
circle-9|Circle 9
circle-a|Circle A
circle-ampersand|Circle Ampersand
circle-arrow-down|Circle Arrow Down|arrow-circle-down
circle-arrow-down-left|Circle Arrow Down Left
circle-arrow-down-right|Circle Arrow Down Right
circle-arrow-left|Circle Arrow Left|arrow-circle-left
circle-arrow-right|Circle Arrow Right|arrow-circle-right
circle-arrow-up|Circle Arrow Up|arrow-circle-up
circle-arrow-up-left|Circle Arrow Up Left
circle-arrow-up-right|Circle Arrow Up Right
circle-austral|Circle Austral
circle-australian-dollar|Circle Australian Dollar
circle-b|Circle B
circle-baht|Circle Baht
circle-bangladeshi-taka|Circle Bangladeshi Taka
circle-bitcoin|Circle Bitcoin
circle-bolt|Circle Bolt
circle-book-open|Circle Book Open|book-circle
circle-bookmark|Circle Bookmark|bookmark-circle
circle-brazilian-real|Circle Brazilian Real
circle-c|Circle C
circle-calendar|Circle Calendar|calendar-circle
circle-camera|Circle Camera|camera-circle
circle-caret-down|Circle Caret Down|caret-circle-down
circle-caret-left|Circle Caret Left|caret-circle-left
circle-caret-right|Circle Caret Right|caret-circle-right
circle-caret-up|Circle Caret Up|caret-circle-up
circle-cedi|Circle Cedi
circle-cent|Circle Cent
circle-check|Circle Check|check-circle
circle-chevron-down|Circle Chevron Down|chevron-circle-down
circle-chevron-left|Circle Chevron Left|chevron-circle-left
circle-chevron-right|Circle Chevron Right|chevron-circle-right
circle-chevron-up|Circle Chevron Up|chevron-circle-up
circle-chf|Circle Chf
circle-colon|Circle Colon
circle-cruzeiro|Circle Cruzeiro
circle-currency|Circle Currency
circle-d|Circle D
circle-danish-krone|Circle Danish Krone
circle-dashed|Circle Dashed
circle-divide|Circle Divide
circle-dollar|Circle Dollar|dollar-circle,usd-circle
circle-dollar-to-slot|Circle Dollar To Slot|donate
circle-dong|Circle Dong
circle-dot|Circle Dot|dot-circle
circle-down|Circle Down|arrow-alt-circle-down
circle-down-left|Circle Down Left
circle-down-right|Circle Down Right
circle-e|Circle E
circle-ellipsis|Circle Ellipsis
circle-ellipsis-vertical|Circle Ellipsis Vertical
circle-envelope|Circle Envelope|envelope-circle
circle-equals|Circle Equals
circle-euro|Circle Euro
circle-eurozone|Circle Eurozone
circle-exclamation|Circle Exclamation|exclamation-circle
circle-exclamation-check|Circle Exclamation Check
circle-f|Circle F
circle-florin|Circle Florin
circle-franc|Circle Franc
circle-g|Circle G
circle-gf|Circle Gf
circle-guarani|Circle Guarani
circle-half|Circle Half
circle-half-horizontal|Circle Half Horizontal
circle-half-stroke|Circle Half Stroke|adjust
circle-half-stroke-horizontal|Circle Half Stroke Horizontal
circle-heart|Circle Heart|heart-circle
circle-house|Circle House
circle-hryvnia|Circle Hryvnia
circle-i|Circle I
circle-indian-rupee|Circle Indian Rupee
circle-info|Circle Info|info-circle
circle-j|Circle J
circle-k|Circle K
circle-kip|Circle Kip
circle-l|Circle L
circle-lari|Circle Lari
circle-left|Circle Left|arrow-alt-circle-left
circle-lira|Circle Lira
circle-litecoin|Circle Litecoin
circle-location-arrow|Circle Location Arrow|location-circle
circle-m|Circle M
circle-malaysian-ringgit|Circle Malaysian Ringgit
circle-manat|Circle Manat
circle-microphone|Circle Microphone|microphone-circle
circle-microphone-lines|Circle Microphone Lines|microphone-circle-alt
circle-mill|Circle Mill
circle-minus|Circle Minus|minus-circle
circle-moon|Circle Moon
circle-n|Circle N
circle-naira|Circle Naira
circle-nodes|Circle Nodes
circle-norwegian-krone|Circle Norwegian Krone
circle-notch|Circle Notch
circle-o|Circle O
circle-p|Circle P
circle-parking|Circle Parking|parking-circle
circle-pause|Circle Pause|pause-circle
circle-peruvian-soles|Circle Peruvian Soles
circle-peseta|Circle Peseta
circle-peso|Circle Peso
circle-phone|Circle Phone|phone-circle
circle-phone-flip|Circle Phone Flip|phone-circle-alt
circle-phone-hangup|Circle Phone Hangup|phone-circle-down
circle-play|Circle Play|play-circle
circle-plus|Circle Plus|plus-circle
circle-polish-zloty|Circle Polish Zloty
circle-q|Circle Q
circle-quarter|Circle Quarter
circle-quarter-stroke|Circle Quarter Stroke
circle-quarters|Circle Quarters
circle-question|Circle Question|question-circle
circle-r|Circle R
circle-radiation|Circle Radiation|radiation-alt
circle-renminbi|Circle Renminbi
circle-right|Circle Right|arrow-alt-circle-right
circle-ruble|Circle Ruble
circle-rupee|Circle Rupee
circle-rupiah|Circle Rupiah
circle-s|Circle S
circle-share-nodes|Circle Share Nodes
circle-shekel|Circle Shekel
circle-small|Circle Small
circle-sort|Circle Sort|sort-circle
circle-sort-down|Circle Sort Down|sort-circle-down
circle-sort-up|Circle Sort Up|sort-circle-up
circle-star|Circle Star|star-circle
circle-sterling|Circle Sterling
circle-stop|Circle Stop|stop-circle
circle-swedish-krona|Circle Swedish Krona
circle-t|Circle T
circle-tenge|Circle Tenge
circle-three-quarters|Circle Three Quarters
circle-three-quarters-stroke|Circle Three Quarters Stroke
circle-trash|Circle Trash|trash-circle
circle-tugrik|Circle Tugrik
circle-turkish-lira|Circle Turkish Lira
circle-u|Circle U
circle-up|Circle Up|arrow-alt-circle-up
circle-up-left|Circle Up Left
circle-up-right|Circle Up Right
circle-user|Circle User|user-circle
circle-user-circle-check|Circle User Circle Check
circle-user-circle-exclamation|Circle User Circle Exclamation
circle-user-circle-minus|Circle User Circle Minus
circle-user-circle-moon|Circle User Circle Moon
circle-user-circle-plus|Circle User Circle Plus
circle-user-circle-question|Circle User Circle Question
circle-user-circle-user|Circle User Circle User
circle-user-circle-xmark|Circle User Circle Xmark
circle-user-clock|Circle User Clock
circle-v|Circle V
circle-video|Circle Video|video-circle
circle-w|Circle W
circle-waveform-lines|Circle Waveform Lines|waveform-circle
circle-wifi|Circle Wifi
circle-wifi-circle-wifi|Circle Wifi Circle Wifi|circle-wifi-group
circle-won|Circle Won
circle-x|Circle X
circle-xmark|Circle Xmark|times-circle,xmark-circle
circle-y|Circle Y
circle-yen|Circle Yen
circle-z|Circle Z
circleapore-dollar|Circleapore Dollar
circles-overlap|Circles Overlap
citrus|Citrus
citrus-slice|Citrus Slice
city|City
clapperboard|Clapperboard
clapperboard-play|Clapperboard Play
clarinet|Clarinet
claw-marks|Claw Marks
clipboard|Clipboard
clipboard-check|Clipboard Check
clipboard-clock|Clipboard Clock
clipboard-exclamation|Clipboard Exclamation
clipboard-list|Clipboard List
clipboard-list-check|Clipboard List Check
clipboard-medical|Clipboard Medical
clipboard-prescription|Clipboard Prescription
clipboard-question|Clipboard Question
clipboard-user|Clipboard User
clock|Clock|clock-four
clock-desk|Clock Desk
clock-eight|Clock Eight
clock-eight-thirty|Clock Eight Thirty
clock-eleven|Clock Eleven
clock-eleven-thirty|Clock Eleven Thirty
clock-five|Clock Five
clock-five-thirty|Clock Five Thirty
clock-four-thirty|Clock Four Thirty
clock-nine|Clock Nine
clock-nine-thirty|Clock Nine Thirty
clock-one|Clock One
clock-one-thirty|Clock One Thirty
clock-rotate-left|Clock Rotate Left|history
clock-seven|Clock Seven
clock-seven-thirty|Clock Seven Thirty
clock-six|Clock Six
clock-six-thirty|Clock Six Thirty
clock-ten|Clock Ten
clock-ten-thirty|Clock Ten Thirty
clock-three|Clock Three
clock-three-thirty|Clock Three Thirty
clock-twelve|Clock Twelve
clock-twelve-thirty|Clock Twelve Thirty
clock-two|Clock Two
clock-two-thirty|Clock Two Thirty
clone|Clone
clone-plus|Clone Plus
closed-captioning|Closed Captioning
closed-captioning-slash|Closed Captioning Slash
clothes-hanger|Clothes Hanger
cloud|Cloud
cloud-arrow-down|Cloud Arrow Down|cloud-download,cloud-download-alt
cloud-arrow-up|Cloud Arrow Up|cloud-upload,cloud-upload-alt
cloud-binary|Cloud Binary
cloud-bolt|Cloud Bolt|thunderstorm
cloud-bolt-moon|Cloud Bolt Moon|thunderstorm-moon
cloud-bolt-sun|Cloud Bolt Sun|thunderstorm-sun
cloud-check|Cloud Check
cloud-drizzle|Cloud Drizzle
cloud-exclamation|Cloud Exclamation
cloud-fog|Cloud Fog|fog
cloud-hail|Cloud Hail
cloud-hail-mixed|Cloud Hail Mixed
cloud-meatball|Cloud Meatball
cloud-minus|Cloud Minus
cloud-moon|Cloud Moon
cloud-moon-rain|Cloud Moon Rain
cloud-music|Cloud Music
cloud-plus|Cloud Plus
cloud-question|Cloud Question
cloud-rain|Cloud Rain
cloud-rainbow|Cloud Rainbow
cloud-showers|Cloud Showers
cloud-showers-heavy|Cloud Showers Heavy
cloud-showers-water|Cloud Showers Water
cloud-slash|Cloud Slash
cloud-sleet|Cloud Sleet
cloud-snow|Cloud Snow
cloud-sun|Cloud Sun
cloud-sun-rain|Cloud Sun Rain
cloud-word|Cloud Word
cloud-xmark|Cloud Xmark
clouds|Clouds
clouds-moon|Clouds Moon
clouds-sun|Clouds Sun
clover|Clover
club|Club
coconut|Coconut
code|Code
code-branch|Code Branch
code-commit|Code Commit
code-compare|Code Compare
code-fork|Code Fork
code-merge|Code Merge
code-pull-request|Code Pull Request
code-pull-request-closed|Code Pull Request Closed
code-pull-request-draft|Code Pull Request Draft
code-simple|Code Simple
coffee-bean|Coffee Bean
coffee-beans|Coffee Beans
coffee-pot|Coffee Pot
coffee-togo|Coffee Togo|cup-togo
coffin|Coffin
coffin-cross|Coffin Cross
coin|Coin
coin-blank|Coin Blank
coin-front|Coin Front
coin-vertical|Coin Vertical
coins|Coins
colon|Colon
colon-sign|Colon Sign
columns-3|Columns 3
comet|Comet
comma|Comma
command|Command
comment|Comment
comment-arrow-down|Comment Arrow Down
comment-arrow-up|Comment Arrow Up
comment-arrow-up-right|Comment Arrow Up Right
comment-captions|Comment Captions
comment-check|Comment Check
comment-code|Comment Code
comment-dollar|Comment Dollar
comment-dot|Comment Dot
comment-dots|Comment Dots|commenting
comment-exclamation|Comment Exclamation
comment-heart|Comment Heart
comment-image|Comment Image
comment-lines|Comment Lines
comment-medical|Comment Medical
comment-middle|Comment Middle
comment-middle-top|Comment Middle Top
comment-minus|Comment Minus
comment-music|Comment Music
comment-nodes|Comment Nodes
comment-pen|Comment Pen|comment-edit
comment-plus|Comment Plus
comment-question|Comment Question
comment-quote|Comment Quote
comment-slash|Comment Slash
comment-smile|Comment Smile
comment-sms|Comment Sms|sms
comment-text|Comment Text
comment-waveform|Comment Waveform
comment-xmark|Comment Xmark|comment-times
comments|Comments
comments-dollar|Comments Dollar
comments-question|Comments Question
comments-question-check|Comments Question Check
compact-disc|Compact Disc
compass|Compass
compass-drafting|Compass Drafting|drafting-compass
compass-slash|Compass Slash
compress|Compress
compress-wide|Compress Wide
computer|Computer
computer-classic|Computer Classic
computer-mouse|Computer Mouse|mouse
computer-mouse-button-left|Computer Mouse Button Left
computer-mouse-button-right|Computer Mouse Button Right
computer-mouse-scrollwheel|Computer Mouse Scrollwheel|mouse-alt
computer-speaker|Computer Speaker
container-storage|Container Storage
conveyor-belt|Conveyor Belt
conveyor-belt-arm|Conveyor Belt Arm
conveyor-belt-boxes|Conveyor Belt Boxes|conveyor-belt-alt
conveyor-belt-empty|Conveyor Belt Empty
cookie|Cookie
cookie-bite|Cookie Bite
copy|Copy
copyright|Copyright
corn|Corn
corner|Corner
couch|Couch
couch-small|Couch Small|loveseat
court-sport|Court Sport
cow|Cow
cowbell|Cowbell
cowbell-circle-plus|Cowbell Circle Plus|cowbell-more
crab|Crab
crate-apple|Crate Apple
crate-empty|Crate Empty
credit-card|Credit Card|credit-card-alt
credit-card-blank|Credit Card Blank
credit-card-front|Credit Card Front
cricket|Cricket|cricket-bat-ball
croissant|Croissant
crop|Crop
crop-simple|Crop Simple|crop-alt
cross|Cross
crosshairs|Crosshairs
crosshairs-simple|Crosshairs Simple
crow|Crow
crown|Crown
crutch|Crutch
crutches|Crutches
cruzeiro-sign|Cruzeiro Sign
crystal-ball|Crystal Ball
cube|Cube
cubes|Cubes
cubes-stacked|Cubes Stacked
cucumber|Cucumber
cup-straw|Cup Straw
cup-straw-swoosh|Cup Straw Swoosh
cupcake|Cupcake
curling|Curling|curling-stone
currency-sign|Currency Sign
custard|Custard
d|D
dagger|Dagger
danish-krone-sign|Danish Krone Sign
database|Database
deer|Deer
deer-rudolph|Deer Rudolph
delete-left|Delete Left|backspace
delete-right|Delete Right
democrat|Democrat
desk|Desk
desktop|Desktop|desktop-alt
desktop-arrow-down|Desktop Arrow Down
dharmachakra|Dharmachakra
diagram-cells|Diagram Cells
diagram-lean-canvas|Diagram Lean Canvas
diagram-nested|Diagram Nested
diagram-next|Diagram Next
diagram-predecessor|Diagram Predecessor
diagram-previous|Diagram Previous
diagram-project|Diagram Project|project-diagram
diagram-sankey|Diagram Sankey
diagram-subtask|Diagram Subtask
diagram-successor|Diagram Successor
diagram-venn|Diagram Venn
dial|Dial|dial-med-high
dial-high|Dial High
dial-low|Dial Low
dial-max|Dial Max
dial-med|Dial Med
dial-med-low|Dial Med Low
dial-min|Dial Min
dial-off|Dial Off
dialpad|Dialpad|numpad
diamond|Diamond
diamond-exclamation|Diamond Exclamation
diamond-half|Diamond Half
diamond-half-stroke|Diamond Half Stroke
diamond-turn-right|Diamond Turn Right|directions
diamonds-4|Diamonds 4
dice|Dice
dice-d10|Dice D10
dice-d12|Dice D12
dice-d20|Dice D20
dice-d4|Dice D4
dice-d6|Dice D6
dice-d8|Dice D8
dice-five|Dice Five
dice-four|Dice Four
dice-one|Dice One
dice-six|Dice Six
dice-three|Dice Three
dice-two|Dice Two
digital-tachograph|Digital Tachograph|tachograph-digital
dinosaur|Dinosaur
direction-left-right|Direction Left Right
direction-up-down|Direction Up Down
disc-drive|Disc Drive
disease|Disease
display|Display
display-arrow-down|Display Arrow Down
display-chart-up|Display Chart Up
display-chart-up-circle-currency|Display Chart Up Circle Currency
display-chart-up-circle-dollar|Display Chart Up Circle Dollar
display-code|Display Code|desktop-code
display-medical|Display Medical|desktop-medical
display-slash|Display Slash|desktop-slash
distribute-spacing-horizontal|Distribute Spacing Horizontal
distribute-spacing-vertical|Distribute Spacing Vertical
divide|Divide
dna|Dna
do-not-enter|Do Not Enter
dog|Dog
dog-leashed|Dog Leashed
dollar|Dollar|dollar-sign,usd
dolly|Dolly|dolly-box
dolly-empty|Dolly Empty
dolphin|Dolphin
dong-sign|Dong Sign
door-closed|Door Closed
door-open|Door Open
dot|Dot
doughnut|Doughnut|donut
dove|Dove
down|Down|arrow-alt-down
down-from-bracket|Down From Bracket
down-from-dotted-line|Down From Dotted Line
down-from-line|Down From Line|arrow-alt-from-top
down-left|Down Left
down-left-and-up-right-to-center|Down Left And Up Right To Center|compress-alt
down-long|Down Long|long-arrow-alt-down
down-long-to-line|Down Long To Line
down-right|Down Right
down-to-bracket|Down To Bracket
down-to-dotted-line|Down To Dotted Line
down-to-line|Down To Line|arrow-alt-to-bottom
down-up|Down Up
download|Download
dragon|Dragon
dreidel|Dreidel
dress|Dress
dresser|Dresser
drone|Drone
drone-front|Drone Front|drone-alt
droplet|Droplet|tint
droplet-degree|Droplet Degree|dewpoint
droplet-percent|Droplet Percent|humidity
droplet-plus|Droplet Plus
droplet-slash|Droplet Slash|tint-slash
drum|Drum
drum-steelpan|Drum Steelpan
drumstick|Drumstick
drumstick-bite|Drumstick Bite
dryer|Dryer
dryer-heat|Dryer Heat|dryer-alt
duck|Duck
dumbbell|Dumbbell
dumpster|Dumpster
dumpster-fire|Dumpster Fire
dungeon|Dungeon
e|E
ear|Ear
ear-circle-checkmark|Ear Circle Checkmark
ear-deaf|Ear Deaf|deaf,deafness,hard-of-hearing
ear-listen|Ear Listen|assistive-listening-systems
ear-muffs|Ear Muffs
ear-triangle-exclamation|Ear Triangle Exclamation
ear-waveform|Ear Waveform
eclipse|Eclipse
egg|Egg
egg-fried|Egg Fried
eggplant|Eggplant
eject|Eject
elephant|Elephant
elevator|Elevator
ellipsis|Ellipsis|ellipsis-h
ellipsis-stroke|Ellipsis Stroke|ellipsis-h-alt
ellipsis-stroke-vertical|Ellipsis Stroke Vertical|ellipsis-v-alt
ellipsis-vertical|Ellipsis Vertical|ellipsis-v
empty-set|Empty Set
engine|Engine
engine-exclamation|Engine Exclamation|engine-warning
envelope|Envelope
envelope-badge|Envelope Badge|envelope-dot
envelope-certificate|Envelope Certificate|envelope-ribbon
envelope-circle-check|Envelope Circle Check
envelope-circle-user|Envelope Circle User
envelope-open|Envelope Open
envelope-open-dollar|Envelope Open Dollar
envelope-open-text|Envelope Open Text
envelopes|Envelopes
equals|Equals
eraser|Eraser
escalator|Escalator
ethernet|Ethernet
euro|Euro|eur,euro-sign
eurozone-sign|Eurozone Sign
excavator|Excavator
exclamation|Exclamation
expand|Expand
expand-wide|Expand Wide
explosion|Explosion
eye|Eye
eye-closed|Eye Closed
eye-dropper|Eye Dropper|eye-dropper-empty,eyedropper
eye-dropper-full|Eye Dropper Full
eye-dropper-half|Eye Dropper Half
eye-evil|Eye Evil
eye-low-vision|Eye Low Vision|low-vision
eye-slash|Eye Slash
eyes|Eyes
f|F
face-angry|Face Angry|angry
face-angry-horns|Face Angry Horns
face-anguished|Face Anguished
face-anxious-sweat|Face Anxious Sweat
face-astonished|Face Astonished
face-awesome|Face Awesome|gave-dandy
face-beam-hand-over-mouth|Face Beam Hand Over Mouth
face-clouds|Face Clouds
face-confounded|Face Confounded
face-confused|Face Confused
face-cowboy-hat|Face Cowboy Hat
face-diagonal-mouth|Face Diagonal Mouth
face-disappointed|Face Disappointed
face-disguise|Face Disguise
face-dizzy|Face Dizzy|dizzy
face-dotted|Face Dotted
face-downcast-sweat|Face Downcast Sweat
face-drooling|Face Drooling
face-exhaling|Face Exhaling
face-explode|Face Explode|exploding-head
face-expressionless|Face Expressionless
face-eyes-xmarks|Face Eyes Xmarks
face-fearful|Face Fearful
face-flushed|Face Flushed|flushed
face-frown|Face Frown|frown
face-frown-open|Face Frown Open|frown-open
face-frown-slight|Face Frown Slight
face-glasses|Face Glasses
face-grimace|Face Grimace|grimace
face-grin|Face Grin|grin
face-grin-beam|Face Grin Beam|grin-beam
face-grin-beam-sweat|Face Grin Beam Sweat|grin-beam-sweat
face-grin-hearts|Face Grin Hearts|grin-hearts
face-grin-squint|Face Grin Squint|grin-squint
face-grin-squint-tears|Face Grin Squint Tears|grin-squint-tears
face-grin-stars|Face Grin Stars|grin-stars
face-grin-tears|Face Grin Tears|grin-tears
face-grin-tongue|Face Grin Tongue|grin-tongue
face-grin-tongue-squint|Face Grin Tongue Squint|grin-tongue-squint
face-grin-tongue-wink|Face Grin Tongue Wink|grin-tongue-wink
face-grin-wide|Face Grin Wide|grin-alt
face-grin-wink|Face Grin Wink|grin-wink
face-hand-over-mouth|Face Hand Over Mouth
face-hand-peeking|Face Hand Peeking
face-hand-yawn|Face Hand Yawn
face-head-bandage|Face Head Bandage
face-holding-back-tears|Face Holding Back Tears
face-hushed|Face Hushed
face-icicles|Face Icicles
face-kiss|Face Kiss|kiss
face-kiss-beam|Face Kiss Beam|kiss-beam
face-kiss-closed-eyes|Face Kiss Closed Eyes
face-kiss-wink-heart|Face Kiss Wink Heart|kiss-wink-heart
face-laugh|Face Laugh|laugh
face-laugh-beam|Face Laugh Beam|laugh-beam
face-laugh-squint|Face Laugh Squint|laugh-squint
face-laugh-wink|Face Laugh Wink|laugh-wink
face-lying|Face Lying
face-mask|Face Mask
face-meh|Face Meh|meh
face-meh-blank|Face Meh Blank|meh-blank
face-melting|Face Melting
face-monocle|Face Monocle
face-nauseated|Face Nauseated
face-nose-steam|Face Nose Steam
face-party|Face Party
face-pensive|Face Pensive
face-persevering|Face Persevering
face-pleading|Face Pleading
face-pouting|Face Pouting
face-raised-eyebrow|Face Raised Eyebrow
face-relieved|Face Relieved
face-rolling-eyes|Face Rolling Eyes|meh-rolling-eyes
face-sad-cry|Face Sad Cry|sad-cry
face-sad-sweat|Face Sad Sweat
face-sad-tear|Face Sad Tear|sad-tear
face-saluting|Face Saluting
face-scream|Face Scream
face-shaking|Face Shaking
face-shaking-horizontal|Face Shaking Horizontal
face-shaking-vertical|Face Shaking Vertical
face-shush|Face Shush
face-sleeping|Face Sleeping
face-sleepy|Face Sleepy
face-smile|Face Smile|smile
face-smile-beam|Face Smile Beam|smile-beam
face-smile-halo|Face Smile Halo
face-smile-hearts|Face Smile Hearts
face-smile-horns|Face Smile Horns
face-smile-plus|Face Smile Plus|smile-plus
face-smile-relaxed|Face Smile Relaxed
face-smile-tear|Face Smile Tear
face-smile-tongue|Face Smile Tongue
face-smile-upside-down|Face Smile Upside Down
face-smile-wink|Face Smile Wink|smile-wink
face-smiling-hands|Face Smiling Hands
face-smirking|Face Smirking
face-spiral-eyes|Face Spiral Eyes
face-sunglasses|Face Sunglasses
face-surprise|Face Surprise|surprise
face-swear|Face Swear
face-thermometer|Face Thermometer
face-thinking|Face Thinking
face-tired|Face Tired|tired
face-tissue|Face Tissue
face-tongue-money|Face Tongue Money
face-tongue-sweat|Face Tongue Sweat
face-unamused|Face Unamused
face-viewfinder|Face Viewfinder
face-vomit|Face Vomit
face-weary|Face Weary
face-woozy|Face Woozy
face-worried|Face Worried
face-zany|Face Zany
face-zipper|Face Zipper
falafel|Falafel
family|Family
family-dress|Family Dress
family-pants|Family Pants
fan|Fan
fan-table|Fan Table
faucet|Faucet
faucet-drip|Faucet Drip
fax|Fax
feather|Feather
feather-pointed|Feather Pointed|feather-alt
fence|Fence
ferris-wheel|Ferris Wheel
ferry|Ferry
field-hockey|Field Hockey|field-hockey-stick-ball
file|File
file-aiff|File Aiff
file-archive|File Archive|file-zipper
file-arrow-down|File Arrow Down|file-download
file-arrow-up|File Arrow Up|file-upload
file-audio|File Audio
file-ban|File Ban
file-binary|File Binary
file-brackets-curly|File Brackets Curly
file-cad|File Cad
file-caret-down|File Caret Down|page-caret-down
file-caret-up|File Caret Up|page-caret-up
file-certificate|File Certificate|file-award
file-chart-column|File Chart Column|file-chart-line
file-chart-pie|File Chart Pie
file-check|File Check
file-circle-check|File Circle Check
file-circle-exclamation|File Circle Exclamation
file-circle-info|File Circle Info
file-circle-minus|File Circle Minus
file-circle-plus|File Circle Plus
file-circle-question|File Circle Question
file-circle-xmark|File Circle Xmark
file-clipboard|File Clipboard|paste
file-code|File Code
file-contract|File Contract
file-css|File Css
file-csv|File Csv
file-dashed-line|File Dashed Line|page-break
file-doc|File Doc
file-eps|File Eps
file-excel|File Excel
file-exclamation|File Exclamation
file-fragment|File Fragment
file-gif|File Gif
file-half-dashed|File Half Dashed
file-heart|File Heart
file-html|File Html
file-icns|File Icns
file-image|File Image
file-invoice|File Invoice
file-invoice-dollar|File Invoice Dollar
file-jpg|File Jpg
file-js|File Js
file-lines|File Lines|file-alt,file-text
file-lock|File Lock
file-magnifying-glass|File Magnifying Glass|file-search
file-medical|File Medical
file-midi|File Midi
file-minus|File Minus
file-mov|File Mov
file-mp3|File Mp3
file-mp4|File Mp4
file-music|File Music
file-odf|File Odf
file-pdf|File Pdf
file-pen|File Pen|file-edit
file-plus|File Plus
file-plus-minus|File Plus Minus
file-png|File Png
file-powerpoint|File Powerpoint
file-ppt|File Ppt
file-prescription|File Prescription
file-shield|File Shield
file-signature|File Signature
file-slash|File Slash
file-spreadsheet|File Spreadsheet
file-svg|File Svg
file-tex|File Tex
file-user|File User
file-vector|File Vector
file-video|File Video
file-wav|File Wav
file-waveform|File Waveform|file-medical-alt
file-word|File Word
file-xls|File Xls
file-xmark|File Xmark|file-times
file-xml|File Xml
file-zip|File Zip
files|Files
files-medical|Files Medical
fill|Fill
fill-drip|Fill Drip
film|Film|film-alt,film-simple
film-cannister|Film Cannister|film-canister
film-music|Film Music
film-slash|Film Slash
film-stack|Film Stack
films|Films
filter|Filter
filter-circle-dollar|Filter Circle Dollar|funnel-dollar
filter-circle-xmark|Filter Circle Xmark
filter-list|Filter List
filter-slash|Filter Slash
filters|Filters
fingerprint|Fingerprint
fire|Fire
fire-burner|Fire Burner
fire-extinguisher|Fire Extinguisher
fire-flame|Fire Flame|flame
fire-flame-curved|Fire Flame Curved|fire-alt
fire-flame-simple|Fire Flame Simple|burn
fire-hydrant|Fire Hydrant
fire-smoke|Fire Smoke
fireplace|Fireplace
fish|Fish
fish-bones|Fish Bones
fish-cooked|Fish Cooked
fish-fins|Fish Fins
fishing-rod|Fishing Rod
flag|Flag
flag-checkered|Flag Checkered
flag-pennant|Flag Pennant|pennant
flag-swallowtail|Flag Swallowtail|flag-alt
flag-usa|Flag Usa
flashlight|Flashlight
flask|Flask
flask-gear|Flask Gear
flask-round-poison|Flask Round Poison|flask-poison
flask-round-potion|Flask Round Potion|flask-potion
flask-vial|Flask Vial
flatbread|Flatbread
flatbread-stuffed|Flatbread Stuffed
floppy-disk|Floppy Disk|save
floppy-disk-circle-arrow-right|Floppy Disk Circle Arrow Right|save-circle-arrow-right
floppy-disk-circle-xmark|Floppy Disk Circle Xmark|floppy-disk-times,save-circle-xmark,save-times
floppy-disk-pen|Floppy Disk Pen
floppy-disks|Floppy Disks
florin-sign|Florin Sign
flower|Flower
flower-daffodil|Flower Daffodil
flower-tulip|Flower Tulip
flute|Flute
flux-capacitor|Flux Capacitor
flying-disc|Flying Disc
folder|Folder|folder-blank
folder-arrow-down|Folder Arrow Down|folder-download
folder-arrow-left|Folder Arrow Left
folder-arrow-right|Folder Arrow Right
folder-arrow-up|Folder Arrow Up|folder-upload
folder-bookmark|Folder Bookmark
folder-check|Folder Check
folder-closed|Folder Closed
folder-gear|Folder Gear|folder-cog
folder-grid|Folder Grid
folder-heart|Folder Heart
folder-image|Folder Image
folder-magnifying-glass|Folder Magnifying Glass|folder-search
folder-medical|Folder Medical
folder-minus|Folder Minus
folder-music|Folder Music
folder-open|Folder Open
folder-plus|Folder Plus
folder-tree|Folder Tree
folder-user|Folder User
folder-xmark|Folder Xmark|folder-times
folders|Folders
fondue-pot|Fondue Pot
font|Font
font-case|Font Case
foot-wing|Foot Wing
football|Football|football-ball
football-helmet|Football Helmet
fork-knife|Fork Knife|utensils-alt
forklift|Forklift
fort|Fort
forward|Forward
forward-fast|Forward Fast|fast-forward
forward-step|Forward Step|step-forward
frame|Frame
franc-sign|Franc Sign
french-fries|French Fries
frog|Frog
function|Function
futbol|Futbol|futbol-ball,soccer-ball
g|G
galaxy|Galaxy
gallery-thumbnails|Gallery Thumbnails
game-board|Game Board
game-board-simple|Game Board Simple|game-board-alt
game-console-handheld|Game Console Handheld
game-console-handheld-crank|Game Console Handheld Crank
gamepad|Gamepad
gamepad-modern|Gamepad Modern|gamepad-alt
garage|Garage
garage-car|Garage Car
garage-empty|Garage Empty
garage-open|Garage Open
garlic|Garlic
gas-pump|Gas Pump
gas-pump-left|Gas Pump Left
gas-pump-right|Gas Pump Right
gas-pump-slash|Gas Pump Slash
gauge|Gauge|dashboard,gauge-med,tachometer-alt-average
gauge-circle-bolt|Gauge Circle Bolt
gauge-circle-minus|Gauge Circle Minus
gauge-circle-plus|Gauge Circle Plus
gauge-high|Gauge High|tachometer-alt,tachometer-alt-fast
gauge-low|Gauge Low|tachometer-alt-slow
gauge-max|Gauge Max|tachometer-alt-fastest
gauge-min|Gauge Min|tachometer-alt-slowest
gauge-simple|Gauge Simple|gauge-simple-med,tachometer-average
gauge-simple-high|Gauge Simple High|tachometer,tachometer-fast
gauge-simple-low|Gauge Simple Low|tachometer-slow
gauge-simple-max|Gauge Simple Max|tachometer-fastest
gauge-simple-min|Gauge Simple Min|tachometer-slowest
gavel|Gavel|legal
gear|Gear|cog
gear-api|Gear Api
gear-code|Gear Code
gear-complex|Gear Complex
gear-complex-api|Gear Complex Api
gear-complex-code|Gear Complex Code
gears|Gears|cogs
gem|Gem
gemini|Gemini
genderless|Genderless
ghost|Ghost
gif|Gif
gift|Gift
gift-card|Gift Card
gifts|Gifts
gingerbread-man|Gingerbread Man
glass|Glass
glass-champagne|Glass Champagne|champagne-glass
glass-cheers|Glass Cheers|champagne-glasses
glass-citrus|Glass Citrus
glass-empty|Glass Empty
glass-half|Glass Half|glass-half-empty,glass-half-full
glass-martini|Glass Martini|martini-glass-empty
glass-water|Glass Water
glass-water-droplet|Glass Water Droplet
glass-whiskey|Glass Whiskey|whiskey-glass
glass-whiskey-rocks|Glass Whiskey Rocks|whiskey-glass-ice
glasses|Glasses
glasses-round|Glasses Round|glasses-alt
globe|Globe
globe-africa|Globe Africa|earth-africa
globe-americas|Globe Americas|earth,earth-america,earth-americas
globe-asia|Globe Asia|earth-asia
globe-europe|Globe Europe|earth-europe
globe-oceania|Globe Oceania|earth-oceania
globe-pointer|Globe Pointer
globe-snow|Globe Snow
globe-stand|Globe Stand
globe-wifi|Globe Wifi
globe-www|Globe Www
goal-net|Goal Net
golf-ball|Golf Ball|golf-ball-tee
golf-club|Golf Club
golf-flag-hole|Golf Flag Hole
gopuram|Gopuram
gpu|Gpu
gramophone|Gramophone
grapes|Grapes
grate|Grate
grate-droplet|Grate Droplet
greater-than|Greater Than
greater-than-equal|Greater Than Equal
grid|Grid|grid-3
grid-2|Grid 2
grid-2-minus|Grid 2 Minus
grid-2-plus|Grid 2 Plus
grid-4|Grid 4
grid-5|Grid 5
grid-dividers|Grid Dividers
grid-horizontal|Grid Horizontal|grip,grip-horizontal
grid-round|Grid Round
grid-round-2|Grid Round 2
grid-round-2-minus|Grid Round 2 Minus
grid-round-2-plus|Grid Round 2 Plus
grid-round-4|Grid Round 4
grid-round-5|Grid Round 5
grid-vertical|Grid Vertical|grip-vertical
grill|Grill
grill-fire|Grill Fire
grill-hot|Grill Hot
grip-dots|Grip Dots
grip-dots-vertical|Grip Dots Vertical
grip-lines|Grip Lines
grip-lines-vertical|Grip Lines Vertical
group-arrows-rotate|Group Arrows Rotate
guarani-sign|Guarani Sign
guitar|Guitar
guitar-electric|Guitar Electric
guitars|Guitars
gun|Gun
gun-slash|Gun Slash
gun-squirt|Gun Squirt
h|H
h-square|H Square|square-h
h1|H1
h2|H2
h3|H3
h4|H4
h5|H5
h6|H6
hammer|Hammer
hammer-brush|Hammer Brush
hammer-crash|Hammer Crash
hammer-war|Hammer War
hamsa|Hamsa
hand|Hand|hand-paper
hand-back-fist|Hand Back Fist|hand-rock
hand-back-point-down|Hand Back Point Down
hand-back-point-left|Hand Back Point Left
hand-back-point-ribbon|Hand Back Point Ribbon
hand-back-point-right|Hand Back Point Right
hand-back-point-up|Hand Back Point Up
hand-dots|Hand Dots|allergies
hand-fingers-crossed|Hand Fingers Crossed
hand-fist|Hand Fist|fist-raised
hand-heart|Hand Heart
hand-holding|Hand Holding
hand-holding-box|Hand Holding Box
hand-holding-circle-dollar|Hand Holding Circle Dollar
hand-holding-dollar|Hand Holding Dollar|hand-holding-usd
hand-holding-droplet|Hand Holding Droplet|hand-holding-water
hand-holding-hand|Hand Holding Hand
hand-holding-heart|Hand Holding Heart
hand-holding-magic|Hand Holding Magic
hand-holding-medical|Hand Holding Medical
hand-holding-seedling|Hand Holding Seedling
hand-holding-skull|Hand Holding Skull
hand-holding-star|Hand Holding Star
hand-horns|Hand Horns
hand-lizard|Hand Lizard
hand-love|Hand Love
hand-middle-finger|Hand Middle Finger
hand-peace|Hand Peace
hand-point-down|Hand Point Down
hand-point-left|Hand Point Left
hand-point-ribbon|Hand Point Ribbon
hand-point-right|Hand Point Right
hand-point-up|Hand Point Up
hand-pointer|Hand Pointer
hand-receiving|Hand Receiving|hands-holding-diamond
hand-scissors|Hand Scissors
hand-shaka|Hand Shaka
hand-sparkles|Hand Sparkles
hand-spock|Hand Spock
hand-wave|Hand Wave
handcuffs|Handcuffs
hands|Hands|sign-language,signing
hands-american-sign-language-interpreting|Hands American Sign Language Interpreting|american-sign-language-interpreting,asl-interpreting,hands-asl-interpreting
hands-bound|Hands Bound
hands-bubbles|Hands Bubbles|hands-wash
hands-clapping|Hands Clapping
hands-helping|Hands Helping|handshake-angle
hands-holding|Hands Holding
hands-holding-child|Hands Holding Child
hands-holding-circle|Hands Holding Circle
hands-holding-dollar|Hands Holding Dollar|hands-usd
hands-holding-heart|Hands Holding Heart|hands-heart
hands-praying|Hands Praying|praying-hands
handshake|Handshake|handshake-alt,handshake-simple
handshake-simple-slash|Handshake Simple Slash|handshake-alt-slash,handshake-slash
hanukiah|Hanukiah
hard-drive|Hard Drive|hdd
hashtag|Hashtag
hashtag-lock|Hashtag Lock
hat-beach|Hat Beach
hat-chef|Hat Chef
hat-cowboy|Hat Cowboy
hat-cowboy-side|Hat Cowboy Side
hat-hard|Hat Hard|hard-hat,helmet-safety
hat-santa|Hat Santa
hat-winter|Hat Winter
hat-witch|Hat Witch
hat-wizard|Hat Wizard
haykal|Haykal|bahai
head-side|Head Side
head-side-brain|Head Side Brain
head-side-circuit|Head Side Circuit
head-side-cough|Head Side Cough
head-side-cough-slash|Head Side Cough Slash
head-side-gear|Head Side Gear
head-side-goggles|Head Side Goggles|head-vr
head-side-headphones|Head Side Headphones
head-side-heart|Head Side Heart
head-side-mask|Head Side Mask
head-side-medical|Head Side Medical
head-side-speak|Head Side Speak
head-side-virus|Head Side Virus
heading|Heading|header
headphones|Headphones|headphones-alt,headphones-simple
headphones-slash|Headphones Slash
headset|Headset
heart|Heart
heart-circle-bolt|Heart Circle Bolt
heart-circle-check|Heart Circle Check
heart-circle-exclamation|Heart Circle Exclamation
heart-circle-minus|Heart Circle Minus
heart-circle-plus|Heart Circle Plus
heart-circle-xmark|Heart Circle Xmark
heart-crack|Heart Crack|heart-broken
heart-half|Heart Half
heart-half-stroke|Heart Half Stroke|heart-half-alt
heart-music-camera-bolt|Heart Music Camera Bolt|icons
heart-pulse|Heart Pulse|heartbeat
heart-rate|Heart Rate|wave-pulse
heart-slash|Heart Slash
hearts|Hearts
heat|Heat
helicopter|Helicopter
helicopter-symbol|Helicopter Symbol
helmet-battle|Helmet Battle
helmet-un|Helmet Un
heptagon|Heptagon|septagon
hexagon|Hexagon
hexagon-check|Hexagon Check
hexagon-divide|Hexagon Divide
hexagon-equals|Hexagon Equals
hexagon-exclamation|Hexagon Exclamation
hexagon-image|Hexagon Image
hexagon-minus|Hexagon Minus|minus-hexagon
hexagon-nodes|Hexagon Nodes
hexagon-nodes-bolt|Hexagon Nodes Bolt
hexagon-plus|Hexagon Plus|plus-hexagon
hexagon-vertical-nft|Hexagon Vertical Nft|hexagon-vertical-nft-slanted
hexagon-xmark|Hexagon Xmark|times-hexagon,xmark-hexagon
highlighter|Highlighter
highlighter-line|Highlighter Line
hill-avalanche|Hill Avalanche
hill-rockslide|Hill Rockslide
hippo|Hippo
hockey-mask|Hockey Mask
hockey-puck|Hockey Puck
hockey-stick|Hockey Stick
hockey-stick-puck|Hockey Stick Puck
hockey-sticks|Hockey Sticks
holly-berry|Holly Berry
honey-pot|Honey Pot
hood-cloak|Hood Cloak
horizontal-rule|Horizontal Rule
horse|Horse
horse-head|Horse Head
horse-saddle|Horse Saddle
horseshoe|Horseshoe
hose|Hose
hose-reel|Hose Reel
hospital|Hospital|hospital-alt,hospital-wide
hospital-symbol|Hospital Symbol|circle-h
hospital-user|Hospital User
hospitals|Hospitals
hot-tub|Hot Tub|hot-tub-person
hotdog|Hotdog
hotel|Hotel
hourglass|Hourglass|hourglass-empty
hourglass-clock|Hourglass Clock
hourglass-end|Hourglass End|hourglass-3
hourglass-half|Hourglass Half|hourglass-2
hourglass-start|Hourglass Start|hourglass-1
house|House|home,home-alt,home-lg-alt
house-blank|House Blank|home-blank
house-building|House Building
house-chimney|House Chimney|home-lg
house-chimney-blank|House Chimney Blank
house-chimney-crack|House Chimney Crack|house-damage
house-chimney-heart|House Chimney Heart
house-chimney-medical|House Chimney Medical|clinic-medical
house-chimney-user|House Chimney User
house-chimney-window|House Chimney Window
house-circle-check|House Circle Check
house-circle-exclamation|House Circle Exclamation
house-circle-xmark|House Circle Xmark
house-crack|House Crack
house-day|House Day
house-fire|House Fire
house-flag|House Flag
house-flood|House Flood|house-water
house-flood-water|House Flood Water
house-flood-water-circle-arrow-right|House Flood Water Circle Arrow Right
house-heart|House Heart|home-heart
house-laptop|House Laptop|laptop-house
house-lock|House Lock
house-medical|House Medical
house-medical-circle-check|House Medical Circle Check
house-medical-circle-exclamation|House Medical Circle Exclamation
house-medical-circle-xmark|House Medical Circle Xmark
house-medical-flag|House Medical Flag
house-night|House Night
house-person-arrive|House Person Arrive|house-person-return,house-return
house-person-depart|House Person Depart|house-leave,house-person-leave
house-signal|House Signal
house-tree|House Tree
house-tsunami|House Tsunami
house-turret|House Turret
house-unlock|House Unlock
house-user|House User|home-user
house-window|House Window
hryvnia|Hryvnia|hryvnia-sign
hundred-points|Hundred Points|100
hurricane|Hurricane
hydra|Hydra
hyphen|Hyphen
i|I
i-cursor|I Cursor
ice-cream|Ice Cream
ice-skate|Ice Skate
icicles|Icicles
id-badge|Id Badge
id-card|Id Card|drivers-license
id-card-clip|Id Card Clip|id-card-alt
igloo|Igloo
image|Image
image-broken|Image Broken
image-circle-arrow-down|Image Circle Arrow Down
image-circle-check|Image Circle Check
image-circle-plus|Image Circle Plus
image-circle-xmark|Image Circle Xmark
image-landscape|Image Landscape|landscape
image-music|Image Music
image-polaroid|Image Polaroid
image-polaroid-user|Image Polaroid User
image-portrait|Image Portrait|portrait
image-slash|Image Slash
image-stack|Image Stack
image-user|Image User
images|Images
images-user|Images User
inbox|Inbox
inbox-arrow-down|Inbox Arrow Down|inbox-in
inbox-arrow-up|Inbox Arrow Up|inbox-out
inbox-full|Inbox Full
inboxes|Inboxes
indent|Indent
indian-rupee|Indian Rupee|indian-rupee-sign,inr
industry|Industry
industry-windows|Industry Windows|industry-alt
infinity|Infinity
info|Info
inhaler|Inhaler
input-numeric|Input Numeric
input-password|Input Password
input-pipe|Input Pipe
input-text|Input Text
integral|Integral
interrobang|Interrobang
intersection|Intersection
island-tree-palm|Island Tree Palm|island-tropical
italic|Italic
j|J
jack-o-lantern|Jack O Lantern
jar|Jar
jar-wheat|Jar Wheat
jeans|Jeans
jeans-straight|Jeans Straight
jedi|Jedi
jet-fighter|Jet Fighter|fighter-jet
jet-fighter-up|Jet Fighter Up
joint|Joint
joystick|Joystick
jug|Jug
jug-bottle|Jug Bottle
jug-detergent|Jug Detergent
k|K
kaaba|Kaaba
kayak|Kayak
kazoo|Kazoo
kerning|Kerning
kettlebell|Kettlebell
key|Key
key-skeleton|Key Skeleton
key-skeleton-left-right|Key Skeleton Left Right
keyboard|Keyboard
keyboard-brightness|Keyboard Brightness
keyboard-brightness-low|Keyboard Brightness Low
keyboard-down|Keyboard Down
keyboard-left|Keyboard Left
keynote|Keynote
khanda|Khanda
kidneys|Kidneys
kip-sign|Kip Sign
kit-medical|Kit Medical|first-aid
kitchen-set|Kitchen Set
kite|Kite
kiwi-bird|Kiwi Bird
kiwi-fruit|Kiwi Fruit
knife-kitchen|Knife Kitchen
l|L
label|Label
lacrosse-stick|Lacrosse Stick
lacrosse-stick-ball|Lacrosse Stick Ball
lambda|Lambda
lamp|Lamp
lamp-desk|Lamp Desk
lamp-floor|Lamp Floor
lamp-street|Lamp Street
land-mine-on|Land Mine On
landmark|Landmark
landmark-dome|Landmark Dome|landmark-alt
landmark-flag|Landmark Flag
landmark-magnifying-glass|Landmark Magnifying Glass
language|Language
laptop|Laptop
laptop-arrow-down|Laptop Arrow Down
laptop-binary|Laptop Binary
laptop-code|Laptop Code
laptop-file|Laptop File
laptop-medical|Laptop Medical
laptop-slash|Laptop Slash
lari-sign|Lari Sign
lasso|Lasso
lasso-sparkles|Lasso Sparkles
layer|Layer
layer-group|Layer Group
layer-group-minus|Layer Group Minus|layer-minus
layer-group-plus|Layer Group Plus|layer-plus
leaf|Leaf
leaf-heart|Leaf Heart
leaf-maple|Leaf Maple
leaf-oak|Leaf Oak
leafy-green|Leafy Green
left|Left|arrow-alt-left
left-from-bracket|Left From Bracket
left-from-dotted-line|Left From Dotted Line
left-from-line|Left From Line|arrow-alt-from-right
left-long|Left Long|long-arrow-alt-left
left-long-to-line|Left Long To Line
left-right|Left Right|arrows-alt-h
left-to-bracket|Left To Bracket
left-to-dotted-line|Left To Dotted Line
left-to-line|Left To Line|arrow-alt-to-left
lemon|Lemon
leo|Leo
less-than|Less Than
less-than-equal|Less Than Equal
libra|Libra
life-ring|Life Ring
light-ceiling|Light Ceiling
light-emergency|Light Emergency
light-emergency-on|Light Emergency On
light-switch|Light Switch
light-switch-off|Light Switch Off
light-switch-on|Light Switch On
lightbulb|Lightbulb
lightbulb-cfl|Lightbulb Cfl
lightbulb-cfl-on|Lightbulb Cfl On
lightbulb-dollar|Lightbulb Dollar
lightbulb-exclamation|Lightbulb Exclamation
lightbulb-exclamation-on|Lightbulb Exclamation On
lightbulb-gear|Lightbulb Gear
lightbulb-message|Lightbulb Message
lightbulb-on|Lightbulb On
lightbulb-slash|Lightbulb Slash
lighthouse|Lighthouse
lights-holiday|Lights Holiday
line-columns|Line Columns
line-height|Line Height
lines-leaning|Lines Leaning
link|Link|chain
link-broken|Link Broken
link-horizontal|Link Horizontal|chain-horizontal
link-horizontal-slash|Link Horizontal Slash|chain-horizontal-slash
link-simple|Link Simple
link-simple-slash|Link Simple Slash
link-slash|Link Slash|chain-broken,chain-slash,unlink
lips|Lips
lira-sign|Lira Sign
list|List|list-squares
list-check|List Check|tasks
list-dots|List Dots|list-ul
list-dropdown|List Dropdown
list-music|List Music
list-numeric|List Numeric|list-1-2,list-ol
list-radio|List Radio
list-timeline|List Timeline
list-tree|List Tree
litecoin-sign|Litecoin Sign
loader|Loader
lobster|Lobster
location|Location|location-crosshairs
location-arrow|Location Arrow
location-arrow-slash|Location Arrow Slash
location-arrow-up|Location Arrow Up
location-check|Location Check|map-marker-check
location-crosshairs-slash|Location Crosshairs Slash|location-slash
location-dot|Location Dot|map-marker-alt
location-dot-slash|Location Dot Slash|map-marker-alt-slash
location-exclamation|Location Exclamation|map-marker-exclamation
location-minus|Location Minus|map-marker-minus
location-pen|Location Pen|map-marker-edit
location-pin|Location Pin|map-marker
location-pin-lock|Location Pin Lock
location-pin-slash|Location Pin Slash|map-marker-slash
location-plus|Location Plus|map-marker-plus
location-question|Location Question|map-marker-question
location-smile|Location Smile|map-marker-smile
location-xmark|Location Xmark|map-marker-times,map-marker-xmark
lock|Lock
lock-a|Lock A
lock-hashtag|Lock Hashtag
lock-keyhole|Lock Keyhole|lock-alt
lock-keyhole-open|Lock Keyhole Open|lock-open-alt
lock-open|Lock Open
locust|Locust
lollipop|Lollipop|lollypop
lungs|Lungs
lungs-virus|Lungs Virus
lychee|Lychee
m|M
mace|Mace
magnet|Magnet
magnifying-glass|Magnifying Glass|search
magnifying-glass-arrow-right|Magnifying Glass Arrow Right
magnifying-glass-arrows-rotate|Magnifying Glass Arrows Rotate
magnifying-glass-chart|Magnifying Glass Chart
magnifying-glass-dollar|Magnifying Glass Dollar|search-dollar
magnifying-glass-location|Magnifying Glass Location|search-location
magnifying-glass-minus|Magnifying Glass Minus|search-minus
magnifying-glass-music|Magnifying Glass Music
magnifying-glass-play|Magnifying Glass Play
magnifying-glass-plus|Magnifying Glass Plus|search-plus
magnifying-glass-waveform|Magnifying Glass Waveform
mail-bulk|Mail Bulk|envelopes-bulk
mail-reply|Mail Reply|reply
mail-reply-all|Mail Reply All|reply-all
mailbox|Mailbox
mailbox-flag-up|Mailbox Flag Up
mailbox-open-empty|Mailbox Open Empty
mailbox-open-letter|Mailbox Open Letter
malaysian-ringgit-sign|Malaysian Ringgit Sign
manat-sign|Manat Sign
mandolin|Mandolin
mango|Mango
manhole|Manhole
map|Map
map-location|Map Location|map-marked
map-location-dot|Map Location Dot|map-marked-alt
map-pin|Map Pin
map-signs|Map Signs|signs-post
marker|Marker
mars|Mars
mars-and-venus|Mars And Venus
mars-and-venus-burst|Mars And Venus Burst
mars-double|Mars Double
mars-stroke|Mars Stroke
mars-stroke-right|Mars Stroke Right|mars-stroke-h
mars-stroke-up|Mars Stroke Up|mars-stroke-v
martini-glass|Martini Glass|glass-martini-alt
martini-glass-citrus|Martini Glass Citrus|cocktail
mask|Mask
mask-face|Mask Face
mask-luchador|Mask Luchador|luchador,luchador-mask
mask-snorkel|Mask Snorkel
mask-ventilator|Mask Ventilator
masks-theater|Masks Theater|theater-masks
mattress-pillow|Mattress Pillow
maximize|Maximize|expand-arrows-alt
meat|Meat
medal|Medal
megaphone|Megaphone
melon|Melon
melon-slice|Melon Slice
memo|Memo
memo-circle-check|Memo Circle Check
memo-circle-info|Memo Circle Info
memo-pad|Memo Pad
memory|Memory
menorah|Menorah
mercury|Mercury
merge|Merge
message|Message|comment-alt
message-arrow-down|Message Arrow Down|comment-alt-arrow-down
message-arrow-up|Message Arrow Up|comment-alt-arrow-up
message-arrow-up-right|Message Arrow Up Right
message-bot|Message Bot
message-captions|Message Captions|comment-alt-captions
message-check|Message Check|comment-alt-check
message-code|Message Code
message-dollar|Message Dollar|comment-alt-dollar
message-dot|Message Dot
message-dots|Message Dots|comment-alt-dots,messaging
message-exclamation|Message Exclamation|comment-alt-exclamation
message-heart|Message Heart
message-image|Message Image|comment-alt-image
message-lines|Message Lines|comment-alt-lines
message-medical|Message Medical|comment-alt-medical
message-middle|Message Middle|comment-middle-alt
message-middle-top|Message Middle Top|comment-middle-top-alt
message-minus|Message Minus|comment-alt-minus
message-music|Message Music|comment-alt-music
message-pen|Message Pen|comment-alt-edit,message-edit
message-plus|Message Plus|comment-alt-plus
message-question|Message Question
message-quote|Message Quote|comment-alt-quote
message-slash|Message Slash|comment-alt-slash
message-smile|Message Smile|comment-alt-smile
message-sms|Message Sms
message-text|Message Text|comment-alt-text
message-waveform|Message Waveform
message-xmark|Message Xmark|comment-alt-times,message-times
messages|Messages|comments-alt
messages-dollar|Messages Dollar|comments-alt-dollar
messages-question|Messages Question
meteor|Meteor
meter|Meter
meter-bolt|Meter Bolt
meter-droplet|Meter Droplet
meter-fire|Meter Fire
microchip|Microchip
microchip-ai|Microchip Ai
microphone|Microphone
microphone-circle-plus|Microphone Circle Plus
microphone-circle-xmark|Microphone Circle Xmark
microphone-lines|Microphone Lines|microphone-alt
microphone-lines-slash|Microphone Lines Slash|microphone-alt-slash
microphone-signal-meter|Microphone Signal Meter
microphone-slash|Microphone Slash
microphone-stand|Microphone Stand
microscope|Microscope
microwave|Microwave
midi|Midi
mill-sign|Mill Sign
minimize|Minimize|compress-arrows-alt
minus|Minus|subtract
minus-large|Minus Large|dash
mistletoe|Mistletoe
mitten|Mitten
mobile|Mobile|mobile-android,mobile-phone
mobile-arrow-down|Mobile Arrow Down
mobile-button|Mobile Button
mobile-iphone|Mobile Iphone|mobile-notch
mobile-retro|Mobile Retro
mobile-rotate|Mobile Rotate
mobile-rotate-reverse|Mobile Rotate Reverse
mobile-screen|Mobile Screen|mobile-android-alt
mobile-screen-button|Mobile Screen Button|mobile-alt
mobile-signal|Mobile Signal
mobile-signal-out|Mobile Signal Out
mobile-slash|Mobile Slash
mobile-vibrate|Mobile Vibrate
mobile-vibrate-slash|Mobile Vibrate Slash
money-bill|Money Bill
money-bill-1-wave|Money Bill 1 Wave|money-bill-wave-alt
money-bill-alt|Money Bill Alt|money-bill-1
money-bill-simple|Money Bill Simple
money-bill-simple-wave|Money Bill Simple Wave
money-bill-transfer|Money Bill Transfer
money-bill-trend-up|Money Bill Trend Up
money-bill-wave|Money Bill Wave
money-bill-wheat|Money Bill Wheat
money-bills|Money Bills
money-bills-simple|Money Bills Simple|money-bills-alt
money-check|Money Check
money-check-dollar|Money Check Dollar|money-check-alt
money-check-dollar-pen|Money Check Dollar Pen|money-check-edit-alt
money-check-pen|Money Check Pen|money-check-edit
money-from-bracket|Money From Bracket
money-simple-from-bracket|Money Simple From Bracket
monitor-heart-rate|Monitor Heart Rate|monitor-waveform
monkey|Monkey
monument|Monument
moon|Moon
moon-cloud|Moon Cloud
moon-first-quarter-inverse|Moon First Quarter Inverse|moon-last-quarter
moon-full-inverse|Moon Full Inverse|moon-new
moon-last-quarter-inverse|Moon Last Quarter Inverse|moon-first-quarter
moon-new-inverse|Moon New Inverse|moon-full
moon-over-sun|Moon Over Sun|eclipse-alt
moon-star|Moon Star
moon-stars|Moon Stars
moon-waning-crescent-inverse|Moon Waning Crescent Inverse|moon-waxing-gibbous
moon-waning-gibbous-inverse|Moon Waning Gibbous Inverse|moon-waxing-crescent
moon-waxing-crescent-inverse|Moon Waxing Crescent Inverse|moon-waning-gibbous
moon-waxing-gibbous-inverse|Moon Waxing Gibbous Inverse|moon-waning-crescent
moped|Moped
mortar-board|Mortar Board|graduation-cap
mortar-pestle|Mortar Pestle
mosque|Mosque
mosquito|Mosquito
mosquito-net|Mosquito Net
motorcycle|Motorcycle
mound|Mound
mountain|Mountain
mountain-city|Mountain City
mountain-sun|Mountain Sun
mountains|Mountains
mouse-field|Mouse Field
mp3-player|Mp3 Player
mug|Mug
mug-hot|Mug Hot
mug-marshmallows|Mug Marshmallows
mug-saucer|Mug Saucer|coffee
mug-tea|Mug Tea
mug-tea-saucer|Mug Tea Saucer
mushroom|Mushroom
music|Music
music-magnifying-glass|Music Magnifying Glass
music-note|Music Note|music-alt
music-note-slash|Music Note Slash|music-alt-slash
music-slash|Music Slash
mustache|Mustache
n|N
naira-sign|Naira Sign
narwhal|Narwhal
nas|Nas
nesting-dolls|Nesting Dolls
network-wired|Network Wired
neuter|Neuter
newspaper|Newspaper
nfc|Nfc
nfc-lock|Nfc Lock
nfc-magnifying-glass|Nfc Magnifying Glass
nfc-pen|Nfc Pen
nfc-signal|Nfc Signal
nfc-slash|Nfc Slash
nfc-trash|Nfc Trash
non-binary|Non Binary
norwegian-krone-sign|Norwegian Krone Sign
nose|Nose
not-equal|Not Equal
notdef|Notdef
note|Note
note-medical|Note Medical
note-sticky|Note Sticky|sticky-note
notebook|Notebook
notes|Notes
notes-medical|Notes Medical
notes-sticky|Notes Sticky
o|O
oar|Oar
oars|Oars
object-exclude|Object Exclude
object-group|Object Group
object-intersect|Object Intersect
object-subtract|Object Subtract
object-ungroup|Object Ungroup
object-union|Object Union
objects-align-bottom|Objects Align Bottom
objects-align-center-horizontal|Objects Align Center Horizontal
objects-align-center-vertical|Objects Align Center Vertical
objects-align-left|Objects Align Left
objects-align-right|Objects Align Right
objects-align-top|Objects Align Top
objects-column|Objects Column
octagon|Octagon
octagon-check|Octagon Check
octagon-divide|Octagon Divide
octagon-equals|Octagon Equals
octagon-exclamation|Octagon Exclamation
octagon-minus|Octagon Minus|minus-octagon
octagon-plus|Octagon Plus|plus-octagon
octagon-xmark|Octagon Xmark|times-octagon,xmark-octagon
octopus|Octopus
oil-can|Oil Can
oil-can-drip|Oil Can Drip
oil-temperature|Oil Temperature|oil-temp
oil-well|Oil Well
olive|Olive
olive-branch|Olive Branch
om|Om
omega|Omega
onion|Onion
open-captioning|Open Captioning
opossum|Opossum|possum
option|Option
ornament|Ornament
otter|Otter
outdent|Outdent|dedent
outlet|Outlet
oven|Oven
overline|Overline
owl|Owl
p|P
page|Page
pager|Pager
paint-roller|Paint Roller
paintbrush|Paintbrush|paint-brush
paintbrush-fine|Paintbrush Fine|paint-brush-alt,paint-brush-fine,paintbrush-alt
paintbrush-fine-slash|Paintbrush Fine Slash
paintbrush-pencil|Paintbrush Pencil
paintbrush-slash|Paintbrush Slash
palette|Palette
pallet|Pallet
pallet-box|Pallet Box
pallet-boxes|Pallet Boxes|palette-boxes,pallet-alt
pan-food|Pan Food
pan-frying|Pan Frying
pancakes|Pancakes
panel-ews|Panel Ews
panel-fire|Panel Fire
panorama|Panorama
panties|Panties
pants|Pants
pants-straight|Pants Straight
paper-plane|Paper Plane
paper-plane-top|Paper Plane Top|paper-plane-alt,send
paperclip|Paperclip
paperclip-vertical|Paperclip Vertical
parachute-box|Parachute Box
paragraph|Paragraph
paragraph-left|Paragraph Left|paragraph-rtl
parking-circle-slash|Parking Circle Slash|ban-parking
party-bell|Party Bell
party-horn|Party Horn
passport|Passport
pause|Pause
paw|Paw
paw-claws|Paw Claws
paw-simple|Paw Simple|paw-alt
peace|Peace
peach|Peach
peanut|Peanut
peanuts|Peanuts
peapod|Peapod
pear|Pear
pedestal|Pedestal
pegasus|Pegasus
pen|Pen
pen-circle|Pen Circle
pen-clip|Pen Clip|pen-alt
pen-clip-slash|Pen Clip Slash|pen-alt-slash
pen-fancy|Pen Fancy
pen-fancy-slash|Pen Fancy Slash
pen-field|Pen Field
pen-line|Pen Line
pen-nib|Pen Nib
pen-nib-slash|Pen Nib Slash
pen-paintbrush|Pen Paintbrush|pencil-paintbrush
pen-ruler|Pen Ruler|pencil-ruler
pen-slash|Pen Slash
pen-swirl|Pen Swirl
pen-to-square|Pen To Square|edit
pencil|Pencil|pencil-alt
pencil-line|Pencil Line
pencil-mechanical|Pencil Mechanical
pencil-slash|Pencil Slash
pentagon|Pentagon
people|People
people-arrows|People Arrows|people-arrows-left-right
people-carry|People Carry|people-carry-box
people-dress|People Dress
people-dress-simple|People Dress Simple
people-group|People Group
people-line|People Line
people-pants|People Pants
people-pants-simple|People Pants Simple
people-pulling|People Pulling
people-robbery|People Robbery
people-roof|People Roof
people-simple|People Simple
pepper|Pepper
pepper-hot|Pepper Hot
percentage|Percentage|percent
period|Period
person|Person|male
person-arms-raised|Person Arms Raised
person-arrow-down-to-line|Person Arrow Down To Line
person-arrow-up-from-line|Person Arrow Up From Line
person-basketball|Person Basketball
person-biking|Person Biking|biking
person-biking-mountain|Person Biking Mountain|biking-mountain
person-booth|Person Booth
person-breastfeeding|Person Breastfeeding
person-burst|Person Burst
person-cane|Person Cane
person-carry|Person Carry|person-carry-box
person-carry-empty|Person Carry Empty
person-chalkboard|Person Chalkboard
person-circle-check|Person Circle Check
person-circle-exclamation|Person Circle Exclamation
person-circle-minus|Person Circle Minus
person-circle-plus|Person Circle Plus
person-circle-question|Person Circle Question
person-circle-xmark|Person Circle Xmark
person-digging|Person Digging|digging
person-dolly|Person Dolly
person-dolly-empty|Person Dolly Empty
person-dots-from-line|Person Dots From Line|diagnoses
person-dress|Person Dress|female
person-dress-burst|Person Dress Burst
person-dress-fairy|Person Dress Fairy
person-dress-simple|Person Dress Simple
person-drowning|Person Drowning
person-fairy|Person Fairy
person-falling|Person Falling
person-falling-burst|Person Falling Burst
person-from-portal|Person From Portal|portal-exit
person-golfing|Person Golfing
person-half-dress|Person Half Dress
person-harassing|Person Harassing
person-hiking|Person Hiking|hiking
person-limbs-wide|Person Limbs Wide
person-meditating|Person Meditating
person-military-pointing|Person Military Pointing
person-military-rifle|Person Military Rifle
person-military-to-person|Person Military To Person
person-pinball|Person Pinball
person-praying|Person Praying|pray
person-pregnant|Person Pregnant
person-rays|Person Rays
person-rifle|Person Rifle
person-running|Person Running|running
person-running-fast|Person Running Fast
person-seat|Person Seat
person-seat-reclined|Person Seat Reclined
person-seat-window|Person Seat Window
person-shelter|Person Shelter
person-sign|Person Sign
person-simple|Person Simple
person-skating|Person Skating|skating
person-ski-jumping|Person Ski Jumping|ski-jump
person-ski-lift|Person Ski Lift|ski-lift
person-skiing|Person Skiing|skiing
person-skiing-nordic|Person Skiing Nordic|skiing-nordic
person-sledding|Person Sledding|sledding
person-snowboarding|Person Snowboarding|snowboarding
person-snowmobiling|Person Snowmobiling|snowmobile
person-soccer|Person Soccer
person-swimming|Person Swimming|swimmer
person-swimming-pool|Person Swimming Pool
person-swimming-water|Person Swimming Water
person-through-window|Person Through Window
person-to-door|Person To Door
person-to-portal|Person To Portal|portal-enter
person-walking|Person Walking|walking
person-walking-arrow-loop-left|Person Walking Arrow Loop Left
person-walking-arrow-right|Person Walking Arrow Right
person-walking-dashed-line-arrow-right|Person Walking Dashed Line Arrow Right
person-walking-luggage|Person Walking Luggage
person-walking-with-cane|Person Walking With Cane|blind
person-water-arms-raised|Person Water Arms Raised
person-waving|Person Waving
peruvian-soles-sign|Peruvian Soles Sign
peseta-sign|Peseta Sign
peso-sign|Peso Sign
phone|Phone
phone-arrow-down|Phone Arrow Down|phone-arrow-down-left,phone-incoming
phone-arrow-right|Phone Arrow Right
phone-arrow-up|Phone Arrow Up|phone-arrow-up-right,phone-outgoing
phone-connection|Phone Connection
phone-flip|Phone Flip|phone-alt
phone-hangup|Phone Hangup
phone-intercom|Phone Intercom
phone-laptop|Phone Laptop|laptop-mobile
phone-missed|Phone Missed
phone-office|Phone Office
phone-plus|Phone Plus
phone-rotary|Phone Rotary
phone-slash|Phone Slash
phone-volume|Phone Volume|volume-control-phone
phone-waveform|Phone Waveform
phone-xmark|Phone Xmark
photo-film-music|Photo Film Music
photo-video|Photo Video|photo-film
pi|Pi
piano|Piano
piano-keyboard|Piano Keyboard
pickaxe|Pickaxe
pickleball|Pickleball
picture-in-picture|Picture In Picture
pie|Pie
pig|Pig
piggy-bank|Piggy Bank
pills|Pills
pinata|Pinata
pinball|Pinball
pineapple|Pineapple
pipe|Pipe
pipe-circle-check|Pipe Circle Check
pipe-collar|Pipe Collar
pipe-section|Pipe Section
pipe-smoking|Pipe Smoking
pipe-valve|Pipe Valve
pisces|Pisces
pizza|Pizza
pizza-slice|Pizza Slice
place-of-worship|Place Of Worship
plane|Plane
plane-arrival|Plane Arrival
plane-circle-check|Plane Circle Check
plane-circle-exclamation|Plane Circle Exclamation
plane-circle-xmark|Plane Circle Xmark
plane-departure|Plane Departure
plane-engines|Plane Engines|plane-alt
plane-flying|Plane Flying
plane-landing-gear|Plane Landing Gear
plane-lock|Plane Lock
plane-prop|Plane Prop
plane-slash|Plane Slash
plane-tail|Plane Tail
plane-up|Plane Up
plane-up-slash|Plane Up Slash
planet-moon|Planet Moon
planet-ringed|Planet Ringed
plant-wilt|Plant Wilt
plate-utensils|Plate Utensils
plate-wheat|Plate Wheat
play|Play
play-flip|Play Flip
play-pause|Play Pause
plug|Plug
plug-circle-bolt|Plug Circle Bolt
plug-circle-check|Plug Circle Check
plug-circle-exclamation|Plug Circle Exclamation
plug-circle-minus|Plug Circle Minus
plug-circle-plus|Plug Circle Plus
plug-circle-xmark|Plug Circle Xmark
plus|Plus|add
plus-large|Plus Large
plus-minus|Plus Minus
podcast|Podcast
podium|Podium
podium-star|Podium Star
poker-chip|Poker Chip
police-box|Police Box
polish-zloty-sign|Polish Zloty Sign
poll-people|Poll People
pompebled|Pompebled
poo|Poo
poo-storm|Poo Storm|poo-bolt
pool-8-ball|Pool 8 Ball
poop|Poop
popcorn|Popcorn
popsicle|Popsicle
postage-stamp|Postage Stamp
pot-food|Pot Food
potato|Potato
power-off|Power Off
prescription|Prescription
prescription-bottle|Prescription Bottle
prescription-bottle-medical|Prescription Bottle Medical|prescription-bottle-alt
prescription-bottle-pill|Prescription Bottle Pill
presentation|Presentation|presentation-screen
pretzel|Pretzel
print|Print
print-magnifying-glass|Print Magnifying Glass|print-search
print-slash|Print Slash
projector|Projector
pronoun|Pronoun|circles-overlap-3
pump|Pump
pump-impeller|Pump Impeller
pump-medical|Pump Medical
pump-soap|Pump Soap
pumpkin|Pumpkin
puzzle|Puzzle
puzzle-piece|Puzzle Piece
puzzle-piece-simple|Puzzle Piece Simple|puzzle-piece-alt
q|Q
qrcode|Qrcode
qrcode-read|Qrcode Read
question|Question
quote-left|Quote Left|quote-left-alt
quote-right|Quote Right|quote-right-alt
quotes|Quotes
r|R
rabbit|Rabbit
rabbit-running|Rabbit Running|rabbit-fast
raccoon|Raccoon
racquet|Racquet
radar|Radar
radiation|Radiation
radio|Radio
radio-tuner|Radio Tuner|radio-alt
rainbow|Rainbow
rainbow-half|Rainbow Half
raindrops|Raindrops
ram|Ram
ramp-loading|Ramp Loading
ranking-star|Ranking Star
raygun|Raygun
receipt|Receipt
record-vinyl|Record Vinyl
rectangle|Rectangle|rectangle-landscape
rectangle-4k|Rectangle 4k
rectangle-ad|Rectangle Ad|ad
rectangle-api|Rectangle Api
rectangle-barcode|Rectangle Barcode|barcode-alt
rectangle-beta|Rectangle Beta
rectangle-code|Rectangle Code
rectangle-hd|Rectangle Hd|high-definition
rectangle-high-dynamic-range|Rectangle High Dynamic Range|rectangle-hdr
rectangle-history|Rectangle History
rectangle-history-circle-plus|Rectangle History Circle Plus
rectangle-history-circle-user|Rectangle History Circle User
rectangle-irc|Rectangle Irc
rectangle-list|Rectangle List|list-alt
rectangle-minus|Rectangle Minus
rectangle-n-a|Rectangle N A
rectangle-new|Rectangle New
rectangle-plus|Rectangle Plus
rectangle-portrait|Rectangle Portrait|rectangle-vertical
rectangle-pro|Rectangle Pro|pro
rectangle-sd|Rectangle Sd|standard-definition
rectangle-tall|Rectangle Tall
rectangle-terminal|Rectangle Terminal
rectangle-vertical-history|Rectangle Vertical History
rectangle-video-on-demand|Rectangle Video On Demand
rectangle-wide|Rectangle Wide
rectangle-xmark|Rectangle Xmark|rectangle-times,times-rectangle,window-close
rectangles-mixed|Rectangles Mixed
recycle|Recycle
reel|Reel
reflect-both|Reflect Both
reflect-horizontal|Reflect Horizontal
reflect-vertical|Reflect Vertical
refrigerator|Refrigerator
registered|Registered
remote|Remote
renminbi-sign|Renminbi Sign
repeat|Repeat
repeat-1|Repeat 1
reply-clock|Reply Clock|reply-time
republican|Republican
restroom|Restroom
restroom-simple|Restroom Simple
retweet|Retweet
rhombus|Rhombus
ribbon|Ribbon
right|Right|arrow-alt-right
right-from-bracket|Right From Bracket|sign-out-alt
right-from-dotted-line|Right From Dotted Line
right-from-line|Right From Line|arrow-alt-from-left
right-left|Right Left|exchange-alt
right-left-large|Right Left Large
right-long|Right Long|long-arrow-alt-right
right-long-to-line|Right Long To Line
right-to-bracket|Right To Bracket|sign-in-alt
right-to-dotted-line|Right To Dotted Line
right-to-line|Right To Line|arrow-alt-to-right
ring|Ring
ring-diamond|Ring Diamond
rings-wedding|Rings Wedding
road|Road
road-barrier|Road Barrier
road-bridge|Road Bridge
road-circle-check|Road Circle Check
road-circle-exclamation|Road Circle Exclamation
road-circle-xmark|Road Circle Xmark
road-lock|Road Lock
road-spikes|Road Spikes
robot|Robot
robot-astromech|Robot Astromech
rocket|Rocket
rocket-launch|Rocket Launch
rocket-vertical|Rocket Vertical
roller-coaster|Roller Coaster
rotate|Rotate|sync-alt
rotate-backward|Rotate Backward|rotate-back,rotate-left,undo-alt
rotate-exclamation|Rotate Exclamation
rotate-forward|Rotate Forward|redo-alt,rotate-right
rotate-reverse|Rotate Reverse
route|Route
route-highway|Route Highway
route-interstate|Route Interstate
router|Router
rows-3|Rows 3
rss|Rss|feed
ruble|Ruble|rouble,rub,ruble-sign
rug|Rug
rugby-ball|Rugby Ball
ruler|Ruler
ruler-combined|Ruler Combined
ruler-horizontal|Ruler Horizontal
ruler-triangle|Ruler Triangle
ruler-vertical|Ruler Vertical
rupee|Rupee|rupee-sign
rupiah-sign|Rupiah Sign
rv|Rv
s|S
sack|Sack
sack-dollar|Sack Dollar
sack-xmark|Sack Xmark
sagittarius|Sagittarius
sailboat|Sailboat
salt-shaker|Salt Shaker
sandwich|Sandwich
satellite|Satellite
satellite-dish|Satellite Dish
sausage|Sausage
saxophone|Saxophone
saxophone-fire|Saxophone Fire|sax-hot
scale-balanced|Scale Balanced|balance-scale
scale-unbalanced-flip|Scale Unbalanced Flip|balance-scale-right
scalpel|Scalpel
scalpel-line-dashed|Scalpel Line Dashed|scalpel-path
scanner|Scanner|scanner-gun
scanner-image|Scanner Image
scanner-keyboard|Scanner Keyboard
scanner-touchscreen|Scanner Touchscreen
scarecrow|Scarecrow
scarf|Scarf
school|School
school-circle-check|School Circle Check
school-circle-exclamation|School Circle Exclamation
school-circle-xmark|School Circle Xmark
school-flag|School Flag
school-lock|School Lock
school-unlock|School Unlock
scissors|Scissors|cut
scooter|Scooter
scorpio|Scorpio
screencast|Screencast
screwdriver|Screwdriver
screwdriver-wrench|Screwdriver Wrench|tools
scribble|Scribble
scroll|Scroll
scroll-old|Scroll Old
scroll-ribbon|Scroll Ribbon|diploma
scroll-torah|Scroll Torah|torah
scrubber|Scrubber
scythe|Scythe
sd-card|Sd Card
sd-cards|Sd Cards
seal|Seal
seal-exclamation|Seal Exclamation
seal-question|Seal Question
seat|Seat
seat-airline|Seat Airline
seat-airline-window|Seat Airline Window
seats|Seats
section|Section
seedling|Seedling|sprout
semicolon|Semicolon
send-back|Send Back
send-backward|Send Backward
sensor|Sensor
sensor-cloud|Sensor Cloud|sensor-smoke
sensor-fire|Sensor Fire
sensor-on|Sensor On
sensor-triangle-exclamation|Sensor Triangle Exclamation|sensor-alert
server|Server
share|Share|mail-forward
share-all|Share All
share-from-square|Share From Square|share-square
share-nodes|Share Nodes|share-alt
sheep|Sheep
sheet-plastic|Sheet Plastic
shekel|Shekel|ils,shekel-sign,sheqel,sheqel-sign
shelves|Shelves|inventory
shelves-empty|Shelves Empty
shield|Shield|shield-blank
shield-cat|Shield Cat
shield-check|Shield Check
shield-cross|Shield Cross
shield-dog|Shield Dog
shield-exclamation|Shield Exclamation
shield-halved|Shield Halved|shield-alt
shield-heart|Shield Heart
shield-keyhole|Shield Keyhole
shield-minus|Shield Minus
shield-plus|Shield Plus
shield-quartered|Shield Quartered
shield-slash|Shield Slash
shield-user|Shield User
shield-virus|Shield Virus
shield-xmark|Shield Xmark|shield-times
ship|Ship
ship-large|Ship Large
shirt|Shirt|t-shirt,tshirt
shirt-jersey|Shirt Jersey
shirt-long-sleeve|Shirt Long Sleeve
shirt-running|Shirt Running
shirt-tank-top|Shirt Tank Top
shish-kebab|Shish Kebab
shoe|Shoe
shoe-prints|Shoe Prints
shop|Shop|store-alt
shop-24|Shop 24
shop-lock|Shop Lock
shop-slash|Shop Slash|store-alt-slash
shorts|Shorts
shovel|Shovel
shovel-snow|Shovel Snow
shower|Shower
shower-down|Shower Down|shower-alt
shredder|Shredder
shrimp|Shrimp
shuffle|Shuffle|random
shutters|Shutters
shuttle-space-vertical|Shuttle Space Vertical
shuttle-van|Shuttle Van|van-shuttle
shuttlecock|Shuttlecock
sickle|Sickle
sidebar|Sidebar
sidebar-flip|Sidebar Flip
sigma|Sigma
sign|Sign|sign-hanging
sign-post|Sign Post
sign-posts|Sign Posts
sign-posts-wrench|Sign Posts Wrench
signal|Signal|signal-5,signal-perfect
signal-bars|Signal Bars|signal-alt,signal-alt-4,signal-bars-strong
signal-bars-fair|Signal Bars Fair|signal-alt-2
signal-bars-good|Signal Bars Good|signal-alt-3
signal-bars-slash|Signal Bars Slash|signal-alt-slash
signal-bars-weak|Signal Bars Weak|signal-alt-1
signal-fair|Signal Fair|signal-2
signal-good|Signal Good|signal-3
signal-slash|Signal Slash
signal-stream|Signal Stream
signal-stream-slash|Signal Stream Slash
signal-strong|Signal Strong|signal-4
signal-weak|Signal Weak|signal-1
signapore-dollar-sign|Signapore Dollar Sign
signature|Signature
signature-lock|Signature Lock
signature-slash|Signature Slash
sim-card|Sim Card
sim-cards|Sim Cards
single-quote-left|Single Quote Left
single-quote-right|Single Quote Right
sink|Sink
siren|Siren
siren-on|Siren On
sitemap|Sitemap
skeleton|Skeleton
skeleton-ribs|Skeleton Ribs
ski-boot|Ski Boot
ski-boot-ski|Ski Boot Ski
skull|Skull
skull-cow|Skull Cow
skull-crossbones|Skull Crossbones
slash|Slash
slash-back|Slash Back
slash-forward|Slash Forward
sleigh|Sleigh
slider|Slider
slider-circle|Slider Circle
sliders|Sliders|sliders-h
sliders-simple|Sliders Simple
sliders-up|Sliders Up|sliders-v
slot-machine|Slot Machine
smog|Smog
smoke|Smoke
smoking|Smoking
snake|Snake
sneaker|Sneaker
sneaker-running|Sneaker Running
snooze|Snooze|zzz
snow-blowing|Snow Blowing
snowflake|Snowflake
snowflake-droplets|Snowflake Droplets
snowflakes|Snowflakes
snowman|Snowman
snowman-head|Snowman Head|frosty-head
snowmobile-blank|Snowmobile Blank
snowplow|Snowplow
soap|Soap
socks|Socks
soft-serve|Soft Serve|creemee
solar-panel|Solar Panel
solar-system|Solar System
sort|Sort|unsorted
sort-asc|Sort Asc|sort-up
sort-desc|Sort Desc|sort-down
sort-numeric-desc|Sort Numeric Desc|arrow-down-9-1,sort-numeric-down-alt
sort-numeric-down|Sort Numeric Down|arrow-down-1-9,sort-numeric-asc
sort-numeric-up|Sort Numeric Up|arrow-up-1-9
spa|Spa
space-shuttle|Space Shuttle|shuttle-space
space-station-moon|Space Station Moon
space-station-moon-construction|Space Station Moon Construction|space-station-moon-alt
spade|Spade
spaghetti-monster-flying|Spaghetti Monster Flying|pastafarianism
sparkle|Sparkle
sparkles|Sparkles
speaker|Speaker
speakers|Speakers
spell-check|Spell Check
spider|Spider
spider-black-widow|Spider Black Widow
spider-web|Spider Web
spine|Spine
spinner|Spinner
spinner-scale|Spinner Scale
spinner-third|Spinner Third
spiral|Spiral
split|Split
splotch|Splotch
sportsball|Sportsball
spray-can|Spray Can
spray-can-sparkles|Spray Can Sparkles|air-freshener
sprinkler|Sprinkler
sprinkler-ceiling|Sprinkler Ceiling
square|Square
square-0|Square 0
square-1|Square 1
square-2|Square 2
square-3|Square 3
square-4|Square 4
square-5|Square 5
square-6|Square 6
square-7|Square 7
square-8|Square 8
square-9|Square 9
square-a|Square A
square-a-lock|Square A Lock
square-ampersand|Square Ampersand
square-arrow-down|Square Arrow Down|arrow-square-down
square-arrow-down-left|Square Arrow Down Left
square-arrow-down-right|Square Arrow Down Right
square-arrow-left|Square Arrow Left|arrow-square-left
square-arrow-right|Square Arrow Right|arrow-square-right
square-arrow-up|Square Arrow Up|arrow-square-up
square-arrow-up-left|Square Arrow Up Left
square-arrow-up-right|Square Arrow Up Right|external-link-square
square-austral|Square Austral
square-australian-dollar|Square Australian Dollar
square-b|Square B
square-baht|Square Baht
square-bangladeshi-taka|Square Bangladeshi Taka
square-binary|Square Binary
square-bitcoin|Square Bitcoin
square-bolt|Square Bolt
square-brazilian-real|Square Brazilian Real
square-c|Square C
square-caret-down|Square Caret Down|caret-square-down
square-caret-left|Square Caret Left|caret-square-left
square-caret-right|Square Caret Right|caret-square-right
square-caret-up|Square Caret Up|caret-square-up
square-cedi|Square Cedi
square-cent|Square Cent
square-check|Square Check|check-square
square-chevron-down|Square Chevron Down|chevron-square-down
square-chevron-left|Square Chevron Left|chevron-square-left
square-chevron-right|Square Chevron Right|chevron-square-right
square-chevron-up|Square Chevron Up|chevron-square-up
square-chf|Square Chf
square-code|Square Code
square-colon|Square Colon
square-cruzeiro|Square Cruzeiro
square-currency|Square Currency
square-d|Square D
square-danish-krone|Square Danish Krone
square-dashed|Square Dashed
square-dashed-circle-plus|Square Dashed Circle Plus
square-divide|Square Divide
square-dollar|Square Dollar|dollar-square,usd-square
square-dong|Square Dong
square-down|Square Down|arrow-alt-square-down
square-down-left|Square Down Left
square-down-right|Square Down Right
square-e|Square E
square-ellipsis|Square Ellipsis
square-ellipsis-vertical|Square Ellipsis Vertical
square-envelope|Square Envelope|envelope-square
square-equals|Square Equals
square-euro|Square Euro
square-eurozone|Square Eurozone
square-exclamation|Square Exclamation|exclamation-square
square-f|Square F
square-florin|Square Florin
square-franc|Square Franc
square-full|Square Full
square-g|Square G
square-guarani|Square Guarani
square-half|Square Half
square-half-horizontal|Square Half Horizontal
square-half-stroke|Square Half Stroke
square-half-stroke-horizontal|Square Half Stroke Horizontal
square-heart|Square Heart|heart-square
square-hryvnia|Square Hryvnia
square-i|Square I
square-indian-rupee|Square Indian Rupee
square-info|Square Info|info-square
square-j|Square J
square-k|Square K
square-kanban|Square Kanban
square-kip|Square Kip
square-l|Square L
square-lari|Square Lari
square-left|Square Left|arrow-alt-square-left
square-lira|Square Lira
square-list|Square List
square-litecoin|Square Litecoin
square-m|Square M
square-malaysian-ringgit|Square Malaysian Ringgit
square-manat|Square Manat
square-microphone|Square Microphone
square-mill|Square Mill
square-minus|Square Minus|minus-square
square-n|Square N
square-naira|Square Naira
square-nfi|Square Nfi
square-norwegian-krone|Square Norwegian Krone
square-o|Square O
square-p|Square P
square-parking|Square Parking|parking
square-parking-slash|Square Parking Slash|parking-slash
square-pen|Square Pen|pen-square,pencil-square
square-person-confined|Square Person Confined
square-peruvian-soles|Square Peruvian Soles
square-peseta|Square Peseta
square-peso|Square Peso
square-phone|Square Phone|phone-square
square-phone-flip|Square Phone Flip|phone-square-alt
square-phone-hangup|Square Phone Hangup|phone-square-down
square-plus|Square Plus|plus-square
square-polish-zloty|Square Polish Zloty
square-poll-horizontal|Square Poll Horizontal|poll-h
square-poll-vertical|Square Poll Vertical|poll
square-q|Square Q
square-quarters|Square Quarters
square-question|Square Question|question-square
square-quote|Square Quote
square-r|Square R
square-renminbi|Square Renminbi
square-right|Square Right|arrow-alt-square-right
square-ring|Square Ring
square-root|Square Root
square-root-variable|Square Root Variable|square-root-alt
square-rss|Square Rss|rss-square
square-ruble|Square Ruble
square-rupee|Square Rupee
square-rupiah|Square Rupiah
square-s|Square S
square-share-nodes|Square Share Nodes|share-alt-square
square-shekel|Square Shekel
square-sliders|Square Sliders|sliders-h-square
square-sliders-vertical|Square Sliders Vertical|sliders-v-square
square-small|Square Small
square-star|Square Star
square-sterling|Square Sterling
square-swedish-krona|Square Swedish Krona
square-t|Square T
square-tenge|Square Tenge
square-terminal|Square Terminal
square-this-way-up|Square This Way Up|box-up
square-tugrik|Square Tugrik
square-turkish-lira|Square Turkish Lira
square-u|Square U
square-up|Square Up|arrow-alt-square-up
square-up-left|Square Up Left
square-up-right|Square Up Right|external-link-square-alt
square-user|Square User
square-v|Square V
square-virus|Square Virus
square-w|Square W
square-wine-glass-crack|Square Wine Glass Crack|box-fragile,square-fragile
square-won|Square Won
square-x|Square X
square-xmark|Square Xmark|times-square,xmark-square
square-y|Square Y
square-yen|Square Yen
square-z|Square Z
squareapore-dollar|Squareapore Dollar
squid|Squid
squirrel|Squirrel
stadium|Stadium
staff|Staff
staff-aesculapius|Staff Aesculapius|rod-asclepius,rod-snake,staff-snake
stair-car|Stair Car
stairs|Stairs
stamp|Stamp
stapler|Stapler
star|Star
star-and-crescent|Star And Crescent
star-christmas|Star Christmas
star-exclamation|Star Exclamation
star-half|Star Half
star-half-stroke|Star Half Stroke|star-half-alt
star-of-david|Star Of David
star-of-life|Star Of Life
star-sharp|Star Sharp
star-sharp-half|Star Sharp Half
star-sharp-half-stroke|Star Sharp Half Stroke|star-sharp-half-alt
star-shooting|Star Shooting
starfighter|Starfighter
starfighter-twin-ion-engine|Starfighter Twin Ion Engine|starfighter-alt
starfighter-twin-ion-engine-advanced|Starfighter Twin Ion Engine Advanced|starfighter-alt-advanced
stars|Stars
starship|Starship
starship-freighter|Starship Freighter
steak|Steak
steering-wheel|Steering Wheel
sterling-sign|Sterling Sign|gbp,pound-sign
stethoscope|Stethoscope
stocking|Stocking
stomach|Stomach
stool|Stool
stop|Stop
stopwatch|Stopwatch
stopwatch-20|Stopwatch 20
store|Store
store-24|Store 24
store-lock|Store Lock
store-slash|Store Slash
strawberry|Strawberry
street-view|Street View
stretcher|Stretcher
strikethrough|Strikethrough
stroopwafel|Stroopwafel
subscript|Subscript
subtitles|Subtitles
subtitles-slash|Subtitles Slash
suitcase|Suitcase
suitcase-medical|Suitcase Medical|medkit
suitcase-rolling|Suitcase Rolling
sun|Sun
sun-bright|Sun Bright|sun-alt
sun-cloud|Sun Cloud
sun-dust|Sun Dust
sun-haze|Sun Haze
sun-plant-wilt|Sun Plant Wilt
sunglasses|Sunglasses
sunrise|Sunrise
sunset|Sunset
superscript|Superscript
sushi|Sushi|nigiri
sushi-roll|Sushi Roll|maki-roll,makizushi
swap|Swap
swap-arrows|Swap Arrows
swatchbook|Swatchbook
swedish-krona-sign|Swedish Krona Sign
sword|Sword
sword-laser|Sword Laser
sword-laser-alt|Sword Laser Alt
swords|Swords
swords-laser|Swords Laser
symbols|Symbols|icons-alt
synagogue|Synagogue
syringe|Syringe
t|T
t-rex|T Rex
table|Table
table-bar|Table Bar
table-cells|Table Cells|th
table-cells-column-lock|Table Cells Column Lock
table-cells-column-unlock|Table Cells Column Unlock
table-cells-columns|Table Cells Columns
table-cells-header|Table Cells Header
table-cells-header-lock|Table Cells Header Lock
table-cells-header-unlock|Table Cells Header Unlock
table-cells-large|Table Cells Large|th-large
table-cells-lock|Table Cells Lock
table-cells-merge|Table Cells Merge
table-cells-row-lock|Table Cells Row Lock
table-cells-row-unlock|Table Cells Row Unlock
table-cells-rows|Table Cells Rows
table-cells-split|Table Cells Split
table-cells-unlock|Table Cells Unlock
table-columns|Table Columns|columns
table-columns-add-after|Table Columns Add After
table-columns-add-before|Table Columns Add Before
table-columns-merge-next|Table Columns Merge Next
table-columns-merge-previous|Table Columns Merge Previous
table-columns-remove-after|Table Columns Remove After
table-columns-remove-before|Table Columns Remove Before
table-dining|Table Dining
table-layout|Table Layout
table-list|Table List|th-list
table-picnic|Table Picnic
table-pivot|Table Pivot
table-rows|Table Rows|rows
table-rows-add-above|Table Rows Add Above
table-rows-add-below|Table Rows Add Below
table-rows-merge-next|Table Rows Merge Next
table-rows-merge-previous|Table Rows Merge Previous
table-rows-remove-above|Table Rows Remove Above
table-rows-remove-below|Table Rows Remove Below
table-slash|Table Slash
table-tennis|Table Tennis|ping-pong-paddle-ball,table-tennis-paddle-ball
table-tree|Table Tree
tablet|Tablet|tablet-android
tablet-button|Tablet Button
tablet-rugged|Tablet Rugged
tablet-screen|Tablet Screen|tablet-android-alt
tablet-screen-button|Tablet Screen Button|tablet-alt
tablets|Tablets
taco|Taco
tag|Tag
tags|Tags
tally|Tally|tally-5
tally-1|Tally 1
tally-2|Tally 2
tally-3|Tally 3
tally-4|Tally 4
tamale|Tamale
tank-recovery|Tank Recovery
tank-water|Tank Water
tape|Tape
tarp|Tarp
tarp-droplet|Tarp Droplet
taurus|Taurus
taxi|Taxi|cab
taxi-bus|Taxi Bus
teddy-bear|Teddy Bear
teeth|Teeth
teeth-open|Teeth Open
telescope|Telescope
teletype|Teletype|tty
teletype-answer|Teletype Answer|tty-answer
temperature-arrow-down|Temperature Arrow Down|temperature-down
temperature-arrow-up|Temperature Arrow Up|temperature-up
temperature-empty|Temperature Empty|temperature-0,thermometer-0,thermometer-empty
temperature-frigid|Temperature Frigid|temperature-snow
temperature-full|Temperature Full|temperature-4,thermometer-4,thermometer-full
temperature-half|Temperature Half|temperature-2,thermometer-2,thermometer-half
temperature-high|Temperature High
temperature-hot|Temperature Hot|temperature-sun
temperature-list|Temperature List
temperature-low|Temperature Low
temperature-quarter|Temperature Quarter|temperature-1,thermometer-1,thermometer-quarter
temperature-slash|Temperature Slash
temperature-three-quarters|Temperature Three Quarters|temperature-3,thermometer-3,thermometer-three-quarters
tenge|Tenge|tenge-sign
tennis-ball|Tennis Ball
tent|Tent
tent-arrow-down-to-line|Tent Arrow Down To Line
tent-arrow-left-right|Tent Arrow Left Right
tent-arrow-turn-left|Tent Arrow Turn Left
tent-arrows-down|Tent Arrows Down
tent-circus|Tent Circus
tent-double-peak|Tent Double Peak
tents|Tents
terminal|Terminal
text|Text
text-height|Text Height
text-size|Text Size
text-slash|Text Slash|remove-format
text-width|Text Width
thermometer|Thermometer
theta|Theta
thought-bubble|Thought Bubble
thumbs-down|Thumbs Down
thumbs-up|Thumbs Up
thumbtack|Thumbtack|thumb-tack
thumbtack-angle|Thumbtack Angle
thumbtack-angle-slash|Thumbtack Angle Slash
thumbtack-slash|Thumbtack Slash|thumb-tack-slash
tick|Tick
ticket|Ticket
ticket-perforated|Ticket Perforated
ticket-perforated-plane|Ticket Perforated Plane|ticket-airline,ticket-plane
ticket-simple|Ticket Simple|ticket-alt
tickets|Tickets
tickets-perforated|Tickets Perforated
tickets-perforated-plane|Tickets Perforated Plane|tickets-airline,tickets-plane
tickets-simple|Tickets Simple
tilde|Tilde
timeline|Timeline
timeline-arrow|Timeline Arrow
timer|Timer
times-to-slot|Times To Slot|vote-nay,xmark-to-slot
tire|Tire
tire-flat|Tire Flat
tire-pressure-warning|Tire Pressure Warning
tire-rugged|Tire Rugged
toggle-large-off|Toggle Large Off
toggle-large-on|Toggle Large On
toggle-off|Toggle Off
toggle-on|Toggle On
toilet|Toilet
toilet-paper|Toilet Paper|toilet-paper-alt,toilet-paper-blank
toilet-paper-blank-under|Toilet Paper Blank Under|toilet-paper-reverse,toilet-paper-reverse-alt,toilet-paper-under
toilet-paper-check|Toilet Paper Check
toilet-paper-reverse-slash|Toilet Paper Reverse Slash|toilet-paper-under-slash
toilet-paper-slash|Toilet Paper Slash
toilet-paper-xmark|Toilet Paper Xmark
toilet-portable|Toilet Portable
toilets-portable|Toilets Portable
tomato|Tomato
tombstone|Tombstone
tombstone-blank|Tombstone Blank|tombstone-alt
toolbox|Toolbox
tooth|Tooth
toothbrush|Toothbrush
torii-gate|Torii Gate
tornado|Tornado
tower-broadcast|Tower Broadcast|broadcast-tower
tower-cell|Tower Cell
tower-control|Tower Control
tower-observation|Tower Observation
tower-receive|Tower Receive
tractor|Tractor
trademark|Trademark
traffic-cone|Traffic Cone
traffic-light|Traffic Light
traffic-light-go|Traffic Light Go
traffic-light-slow|Traffic Light Slow
traffic-light-stop|Traffic Light Stop
trailer|Trailer
train|Train
train-stop|Train Stop
train-subway|Train Subway|subway
train-subway-tunnel|Train Subway Tunnel|subway-tunnel
train-track|Train Track
train-tram|Train Tram
train-tunnel|Train Tunnel
transducer|Transducer
transformer-bolt|Transformer Bolt
transgender|Transgender|transgender-alt
transmission|Transmission
transporter|Transporter
transporter-1|Transporter 1
transporter-2|Transporter 2
transporter-3|Transporter 3
transporter-4|Transporter 4
transporter-5|Transporter 5
transporter-6|Transporter 6
transporter-7|Transporter 7
transporter-empty|Transporter Empty
trash|Trash
trash-arrow-turn-left|Trash Arrow Turn Left|trash-undo
trash-arrow-up|Trash Arrow Up|trash-restore
trash-can|Trash Can|trash-alt
trash-can-arrow-turn-left|Trash Can Arrow Turn Left|trash-can-undo,trash-undo-alt
trash-can-arrow-up|Trash Can Arrow Up|trash-restore-alt
trash-can-check|Trash Can Check
trash-can-clock|Trash Can Clock
trash-can-list|Trash Can List
trash-can-plus|Trash Can Plus
trash-can-slash|Trash Can Slash|trash-alt-slash
trash-can-xmark|Trash Can Xmark
trash-check|Trash Check
trash-clock|Trash Clock
trash-list|Trash List
trash-plus|Trash Plus
trash-slash|Trash Slash
trash-xmark|Trash Xmark
treasure-chest|Treasure Chest
tree|Tree
tree-christmas|Tree Christmas
tree-city|Tree City
tree-deciduous|Tree Deciduous|tree-alt
tree-decorated|Tree Decorated
tree-large|Tree Large
tree-palm|Tree Palm
trees|Trees
triangle|Triangle
triangle-circle-square|Triangle Circle Square|shapes
triangle-exclamation|Triangle Exclamation|exclamation-triangle,warning
triangle-instrument|Triangle Instrument|triangle-music
triangle-person-digging|Triangle Person Digging|construction
tricycle|Tricycle
tricycle-adult|Tricycle Adult
trillium|Trillium
triple-chevrons-down|Triple Chevrons Down
triple-chevrons-left|Triple Chevrons Left
triple-chevrons-right|Triple Chevrons Right
triple-chevrons-up|Triple Chevrons Up
trombone|Trombone
trophy|Trophy
trophy-star|Trophy Star|trophy-alt
trowel|Trowel
trowel-bricks|Trowel Bricks
truck|Truck
truck-arrow-right|Truck Arrow Right
truck-bolt|Truck Bolt
truck-clock|Truck Clock|shipping-timed
truck-container|Truck Container
truck-container-empty|Truck Container Empty
truck-droplet|Truck Droplet
truck-fast|Truck Fast|shipping-fast
truck-field|Truck Field
truck-field-un|Truck Field Un
truck-fire|Truck Fire
truck-flatbed|Truck Flatbed
truck-front|Truck Front
truck-ladder|Truck Ladder
truck-medical|Truck Medical|ambulance
truck-monster|Truck Monster
truck-moving|Truck Moving
truck-pickup|Truck Pickup
truck-plane|Truck Plane
truck-plow|Truck Plow
truck-ramp|Truck Ramp
truck-ramp-box|Truck Ramp Box|truck-loading
truck-ramp-couch|Truck Ramp Couch|truck-couch
truck-suv|Truck Suv
truck-tow|Truck Tow
truck-utensils|Truck Utensils
trumpet|Trumpet
tugrik-sign|Tugrik Sign
turkey|Turkey
turkish-lira|Turkish Lira|try,turkish-lira-sign
turn-down|Turn Down|level-down-alt
turn-down-left|Turn Down Left
turn-down-right|Turn Down Right
turn-left|Turn Left
turn-left-down|Turn Left Down
turn-left-up|Turn Left Up
turn-right|Turn Right
turn-up|Turn Up|level-up-alt
turntable|Turntable
turtle|Turtle
tv|Tv|television,tv-alt
tv-music|Tv Music
tv-retro|Tv Retro
typewriter|Typewriter
u|U
u-turn|U Turn|u-turn-left-down
u-turn-down-left|U Turn Down Left
u-turn-down-right|U Turn Down Right
u-turn-left-up|U Turn Left Up
u-turn-right-down|U Turn Right Down
u-turn-right-up|U Turn Right Up
u-turn-up-left|U Turn Up Left
u-turn-up-right|U Turn Up Right
ufo|Ufo
ufo-beam|Ufo Beam
umbrella|Umbrella
umbrella-beach|Umbrella Beach
umbrella-simple|Umbrella Simple|umbrella-alt
underline|Underline
unicorn|Unicorn
unicycle|Unicycle
uniform-martial-arts|Uniform Martial Arts
union|Union
universal-access|Universal Access
unlock|Unlock
unlock-keyhole|Unlock Keyhole|unlock-alt
up|Up|arrow-alt-up
up-down|Up Down|arrows-alt-v
up-down-left-right|Up Down Left Right|arrows-alt
up-from-bracket|Up From Bracket
up-from-dotted-line|Up From Dotted Line
up-from-line|Up From Line|arrow-alt-from-bottom
up-left|Up Left
up-long|Up Long|long-arrow-alt-up
up-long-to-line|Up Long To Line
up-right|Up Right
up-right-and-down-left-from-center|Up Right And Down Left From Center|expand-alt
up-right-from-square|Up Right From Square|external-link-alt
up-to-bracket|Up To Bracket
up-to-dotted-line|Up To Dotted Line
up-to-line|Up To Line|arrow-alt-to-top
upload|Upload
usb-drive|Usb Drive
user|User|user-alt,user-large
user-alien|User Alien
user-astronaut|User Astronaut
user-beard|User Beard
user-beard-bolt|User Beard Bolt
user-bounty-hunter|User Bounty Hunter
user-chart|User Chart|chart-user
user-check|User Check
user-chef|User Chef
user-chef-hair-long|User Chef Hair Long
user-circle-minus|User Circle Minus
user-circle-plus|User Circle Plus
user-clock|User Clock
user-cowboy|User Cowboy
user-crown|User Crown
user-dashed|User Dashed
user-doctor|User Doctor|user-md
user-doctor-hair|User Doctor Hair
user-doctor-hair-long|User Doctor Hair Long
user-doctor-hair-mullet|User Doctor Hair Mullet
user-doctor-message|User Doctor Message|user-md-chat
user-friends|User Friends|user-group
user-gear|User Gear|user-cog
user-graduate|User Graduate
user-group-crown|User Group Crown|users-crown
user-group-simple|User Group Simple
user-hair|User Hair
user-hair-buns|User Hair Buns
user-hair-long|User Hair Long
user-hair-mullet|User Hair Mullet|business-front,party-back,trian-balbot
user-hat-tie|User Hat Tie
user-hat-tie-magnifying-glass|User Hat Tie Magnifying Glass
user-headset|User Headset
user-helmet-safety|User Helmet Safety|user-construction,user-hard-hat
user-hoodie|User Hoodie
user-injured|User Injured
user-key|User Key
user-large-slash|User Large Slash|user-alt-slash,user-slash
user-lock|User Lock
user-magnifying-glass|User Magnifying Glass
user-message|User Message
user-microphone|User Microphone
user-minus|User Minus
user-music|User Music
user-ninja|User Ninja
user-nurse|User Nurse
user-nurse-hair|User Nurse Hair
user-nurse-hair-long|User Nurse Hair Long
user-pen|User Pen|user-edit
user-pilot|User Pilot
user-pilot-hair-long|User Pilot Hair Long
user-pilot-tie|User Pilot Tie
user-pilot-tie-hair-long|User Pilot Tie Hair Long
user-plus|User Plus
user-police|User Police
user-police-hair-long|User Police Hair Long
user-police-tie|User Police Tie
user-police-tie-hair-long|User Police Tie Hair Long
user-question|User Question
user-robot|User Robot
user-robot-xmarks|User Robot Xmarks
user-secret|User Secret
user-shakespeare|User Shakespeare
user-shield|User Shield
user-sith|User Sith
user-tag|User Tag
user-tie|User Tie
user-tie-hair|User Tie Hair
user-tie-hair-long|User Tie Hair Long
user-tie-hair-mullet|User Tie Hair Mullet
user-unlock|User Unlock
user-viewfinder|User Viewfinder
user-visor|User Visor
user-vneck|User Vneck
user-vneck-hair|User Vneck Hair
user-vneck-hair-long|User Vneck Hair Long
user-vneck-hair-mullet|User Vneck Hair Mullet
user-xmark|User Xmark|user-times
users|Users
users-between-lines|Users Between Lines
users-class|Users Class|screen-users
users-gear|Users Gear|users-cog
users-line|Users Line
users-medical|Users Medical
users-rays|Users Rays
users-rectangle|Users Rectangle
users-slash|Users Slash
users-viewfinder|Users Viewfinder
utensil-fork|Utensil Fork|fork
utensil-knife|Utensil Knife|knife
utensil-spoon|Utensil Spoon|spoon
utensils|Utensils|cutlery
utensils-slash|Utensils Slash
utility-can|Utility Can
utility-pole|Utility Pole
utility-pole-double|Utility Pole Double
v|V
vacuum|Vacuum
vacuum-robot|Vacuum Robot
value-absolute|Value Absolute
van|Van
vault|Vault
vector-circle|Vector Circle|draw-circle
vector-polygon|Vector Polygon|draw-polygon
vector-square|Vector Square|draw-square
vent-damper|Vent Damper
venus|Venus
venus-double|Venus Double
venus-mars|Venus Mars
vest|Vest
vest-patches|Vest Patches
vial|Vial
vial-circle-check|Vial Circle Check
vial-vertical|Vial Vertical
vial-virus|Vial Virus
vials|Vials
video|Video|video-camera
video-arrow-down-left|Video Arrow Down Left
video-arrow-up-right|Video Arrow Up Right
video-down-to-line|Video Down To Line
video-handheld|Video Handheld|camcorder
video-plus|Video Plus
video-question|Video Question
video-slash|Video Slash
vihara|Vihara
violin|Violin
virgo|Virgo
virus|Virus
virus-covid|Virus Covid
virus-covid-slash|Virus Covid Slash
virus-slash|Virus Slash
viruses|Viruses
voicemail|Voicemail
volcano|Volcano
volleyball|Volleyball|volleyball-ball
volume|Volume|volume-medium
volume-down|Volume Down|volume-low
volume-high|Volume High|volume-up
volume-off|Volume Off
volume-slash|Volume Slash
volume-xmark|Volume Xmark|volume-mute,volume-times
vr-cardboard|Vr Cardboard
w|W
waffle|Waffle
wagon-covered|Wagon Covered
walker|Walker
walkie-talkie|Walkie Talkie
wallet|Wallet
wand|Wand
wand-magic|Wand Magic|magic
wand-magic-sparkles|Wand Magic Sparkles|magic-wand-sparkles
wand-sparkles|Wand Sparkles
wardrobe|Wardrobe
warehouse|Warehouse
warehouse-full|Warehouse Full|warehouse-alt
washing-machine|Washing Machine|washer
watch|Watch
watch-apple|Watch Apple
watch-calculator|Watch Calculator
watch-fitness|Watch Fitness
watch-smart|Watch Smart
water|Water
water-arrow-down|Water Arrow Down|water-lower
water-arrow-up|Water Arrow Up|water-rise
water-ladder|Water Ladder|ladder-water,swimming-pool
water-temperature|Water Temperature|water-temp
watermelon-slice|Watermelon Slice
wave|Wave
wave-sine|Wave Sine
wave-square|Wave Square
wave-triangle|Wave Triangle
waveform|Waveform
waveform-lines|Waveform Lines|waveform-path
waves-sine|Waves Sine
webhook|Webhook
weight|Weight|weight-scale
weight-hanging|Weight Hanging
whale|Whale
wheat|Wheat
wheat-awn|Wheat Awn|wheat-alt
wheat-awn-circle-exclamation|Wheat Awn Circle Exclamation
wheat-awn-slash|Wheat Awn Slash
wheat-slash|Wheat Slash
wheelchair|Wheelchair
wheelchair-move|Wheelchair Move|wheelchair-alt
whistle|Whistle
wifi|Wifi|wifi-3,wifi-strong
wifi-exclamation|Wifi Exclamation
wifi-fair|Wifi Fair|wifi-2
wifi-slash|Wifi Slash
wifi-weak|Wifi Weak|wifi-1
wind|Wind
wind-circle-exclamation|Wind Circle Exclamation|wind-warning
wind-turbine|Wind Turbine
window|Window
window-flip|Window Flip|window-alt
window-frame|Window Frame
window-frame-open|Window Frame Open
window-maximize|Window Maximize
window-minimize|Window Minimize
window-restore|Window Restore
windsock|Windsock
wine-bottle|Wine Bottle
wine-glass|Wine Glass
wine-glass-crack|Wine Glass Crack|fragile
wine-glass-empty|Wine Glass Empty|wine-glass-alt
wireless|Wireless
won|Won|krw,won-sign
worm|Worm
wreath|Wreath
wreath-laurel|Wreath Laurel
wrench|Wrench
wrench-simple|Wrench Simple
x|X
x-ray|X Ray
xmark|Xmark|close,multiply,remove,times
xmark-large|Xmark Large
xmarks-lines|Xmarks Lines
y|Y
yen|Yen|cny,jpy,rmb,yen-sign
yin-yang|Yin Yang
z|Z
`;

const definitions = ICON_ROWS.split('\n')
  .filter((row) => row.length > 0)
  .map((row) => {
    const [iconCode, label, aliases] = row.split('|');
    return Object.freeze({
      iconCode,
      label,
      aliases: Object.freeze(aliases === undefined ? [] : aliases.split(',')),
    });
  });

/**
 * Every icon Foundry's bundled Font Awesome can render, brands excluded.
 *
 * Frozen ENTRY BY ENTRY, not just as an array: `Object.freeze` is shallow, and the curated
 * vocabulary is a filter of this array, so an unfrozen entry would hand any caller a writable
 * handle on a row every Fabricate picker renders from.
 *
 * @type {ReadonlyArray<{ iconCode: string, label: string, aliases: ReadonlyArray<string> }>}
 */
export const FOUNDRY_ICON_DEFINITIONS = Object.freeze(definitions);

/** The Font Awesome release this catalogue was generated from. */
export const FOUNDRY_ICON_BUNDLE_RELEASE = Object.freeze({
  edition: 'Pro',
  version: '7.2.0',
  foundryVersion: '14.365.0',
});
