// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/generate-icon-catalogue.mjs <foundry>/resources/app/public/fonts/fontawesome
//
// The icons Fabricate offers: every glyph the Font Awesome bundle Foundry ships can render whose
// name Font Awesome ALSO publishes in its free release. Both halves are measured rather than taken
// from published metadata — the first from the stylesheet a Foundry install serves, the second
// from the `@fortawesome/fontawesome-free` devDependency.
//
// Foundry bundles Font Awesome Pro 7.2.0.
// The free release intersected against is Font Awesome Free 7.3.1.
//
// WHY THE INTERSECTION IS NOT OPTIONAL. Foundry ships Font Awesome Pro under its own commercial
// licence and puts the terms in the bundle, at `public/fonts/fontawesome/LICENSE.txt`, in both
// the 13 and the 14 lines:
//
//   "Font Awesome Pro is included under commercial license by Foundry Gaming LLC for their own
//    usage in Foundry Virtual Tabletop. Font Awesome icons included in the Font Awesome Pro icon
//    set may not be used, re-packaged, or referenced in code by third party package developers
//    unless they obtain their own Font Awesome Pro license from https://fontawesome.com/."
//
// Fabricate is a third-party package developer and holds no Pro licence, and a catalogue of names
// is exactly what "referenced in code" describes. Shipping no `.woff2` is therefore not enough to
// clear the clause — the NAME is the thing it names. So a glyph is offered only when at least one
// of the names Foundry's bundle gives it also appears in the free stylesheet, and only its free
// names are recorded, because an alias is a referenced name too: it is searched by the picker and
// resolved for data a GM already saved.
//
// What that leaves is a name Font Awesome publishes itself, under CC BY 4.0 for the icons and SIL
// OFL 1.1 for the fonts. Fabricate may write it. Foundry then draws it from whichever face that
// client has loaded — the Pro face, on a Pro-bundled Foundry — which is Foundry's own licensed use
// of its own font, from a name Fabricate did not take from Foundry's copy of it.
//
// The oracle is a devDependency and NOTHING under `src/` imports it: it is read at generation
// time, and by the licensing guard in tests/iconCatalogueGenerator.test.js that fails CI when any
// committed name leaves the free set. It is version-pinned exactly rather than by range, because
// the names it publishes are what decide what this file is allowed to contain.
//
// Measured from Foundry 14.365.0's bundle:
//   4318 rules assign a glyph, over 5371 `.fa-` names.
//   3768 of those glyphs are classic; the rest are the 550 the brands face draws.
//   The classic solid and regular faces carry an identical 4580-codepoint cmap.
//   1420 classic glyphs carry a free name and are the entries below.
//   The other 2348 are Pro-only names, every one of which Foundry draws and this declines to write.
//
// `candle-holder` is the worked example, and it now runs the other way round. Foundry renders it,
// a companion module offers it, and this catalogue deliberately does NOT — it is a Pro-only name,
// so writing `fas fa-candle-holder` would be Fabricate referencing a Pro icon in code. It is not
// absent because it could not be measured; it was measured, and then declined.
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
// `aliases` — every other FREE name the bundle gives the same glyph, kept rather than discarded.
// They are searchable and they resolve, so offering one name refuses none: a GM who types `cog`
// finds the gear, and a module that persisted `fas fa-cog` gets the gear's row. They also make the
// curated vocabulary's exclusions sound, because an exclusion describes what a glyph DEPICTS and a
// depiction cannot be dodged by spelling: `automobile` is the same drawing as `car`.
//
// `hasRegular` — GONE, and deliberately so rather than left stale. It was meaningful under the
// old free-metadata catalogue, where the regular weight covered a small subset. It is not
// meaningful here, because the classic solid and regular faces Foundry ships carry the same
// 4580 codepoints: the field would read `true` for every entry and distinguish nothing,
// while making a picker offer two rows of the same drawing at two weights. The `far` prefix is
// still accepted and still renders; it is simply not a second row.
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
// VERSION COUPLING, on both sides. This file describes ONE Foundry release's bundle narrowed by
// ONE free release's names. When Foundry bumps Font Awesome, rerun the generator against the new
// install: names are added, and Font Awesome does retire and re-alias names between majors, so an
// icon a GM chose can become an alias of another glyph. When the free release moves, rerun it too
// — Font Awesome promotes Pro icons into the free set, and each promotion is an icon Fabricate may
// now offer and does not. Running the generator with `--check` reports whether either moved
// without writing.

const ICON_ROWS = `
0|0
1|1
2|2
3|3
4|4
5|5
6|6
7|7
8|8
9|9
a|A
address-book|Address Book|contact-book
address-card|Address Card|contact-card,vcard
alarm-clock|Alarm Clock
align-center|Align Center
align-justify|Align Justify
align-left|Align Left
align-right|Align Right
anchor|Anchor
anchor-circle-check|Anchor Circle Check
anchor-circle-exclamation|Anchor Circle Exclamation
anchor-circle-xmark|Anchor Circle Xmark
anchor-lock|Anchor Lock
angle-double-down|Angle Double Down|angles-down
angle-double-left|Angle Double Left|angles-left
angle-double-right|Angle Double Right|angles-right
angle-double-up|Angle Double Up|angles-up
angle-down|Angle Down
angle-left|Angle Left
angle-right|Angle Right
angle-up|Angle Up
ankh|Ankh
apple-whole|Apple Whole|apple-alt
aquarius|Aquarius
archway|Archway
aries|Aries
arrow-down|Arrow Down
arrow-down-a-z|Arrow Down A Z|sort-alpha-asc,sort-alpha-down
arrow-down-long|Arrow Down Long|long-arrow-down
arrow-down-short-wide|Arrow Down Short Wide|sort-amount-desc,sort-amount-down-alt
arrow-down-up-across-line|Arrow Down Up Across Line
arrow-down-up-lock|Arrow Down Up Lock
arrow-down-wide-short|Arrow Down Wide Short|sort-amount-asc,sort-amount-down
arrow-down-z-a|Arrow Down Z A|sort-alpha-desc,sort-alpha-down-alt
arrow-left|Arrow Left
arrow-left-long|Arrow Left Long|long-arrow-left
arrow-pointer|Arrow Pointer|mouse-pointer
arrow-right|Arrow Right
arrow-right-arrow-left|Arrow Right Arrow Left|exchange
arrow-right-from-bracket|Arrow Right From Bracket|sign-out
arrow-right-from-file|Arrow Right From File|file-export
arrow-right-long|Arrow Right Long|long-arrow-right
arrow-right-to-bracket|Arrow Right To Bracket|sign-in
arrow-right-to-city|Arrow Right To City
arrow-right-to-file|Arrow Right To File|file-import
arrow-rotate-backward|Arrow Rotate Backward|arrow-left-rotate,arrow-rotate-back,arrow-rotate-left,undo
arrow-rotate-forward|Arrow Rotate Forward|arrow-right-rotate,arrow-rotate-right,redo
arrow-trend-down|Arrow Trend Down
arrow-trend-up|Arrow Trend Up
arrow-turn-down|Arrow Turn Down|level-down
arrow-turn-up|Arrow Turn Up|level-up
arrow-up|Arrow Up
arrow-up-9-1|Arrow Up 9 1|sort-numeric-up-alt
arrow-up-a-z|Arrow Up A Z|sort-alpha-up
arrow-up-from-bracket|Arrow Up From Bracket
arrow-up-from-ground-water|Arrow Up From Ground Water
arrow-up-from-water-pump|Arrow Up From Water Pump
arrow-up-long|Arrow Up Long|long-arrow-up
arrow-up-right-dots|Arrow Up Right Dots
arrow-up-right-from-square|Arrow Up Right From Square|external-link
arrow-up-short-wide|Arrow Up Short Wide|sort-amount-up-alt
arrow-up-wide-short|Arrow Up Wide Short|sort-amount-up
arrow-up-z-a|Arrow Up Z A|sort-alpha-up-alt
arrows|Arrows|arrows-up-down-left-right
arrows-down-to-line|Arrows Down To Line
arrows-down-to-people|Arrows Down To People
arrows-left-right|Arrows Left Right|arrows-h
arrows-left-right-to-line|Arrows Left Right To Line
arrows-rotate|Arrows Rotate|refresh,sync
arrows-spin|Arrows Spin
arrows-split-up-and-left|Arrows Split Up And Left
arrows-to-circle|Arrows To Circle
arrows-to-dot|Arrows To Dot
arrows-to-eye|Arrows To Eye
arrows-turn-right|Arrows Turn Right
arrows-turn-to-dots|Arrows Turn To Dots
arrows-up-down|Arrows Up Down|arrows-v
arrows-up-to-line|Arrows Up To Line
asterisk|Asterisk
at|At
atom|Atom
audio-description|Audio Description
austral-sign|Austral Sign
award|Award
b|B
baby|Baby
baby-carriage|Baby Carriage|carriage-baby
backward|Backward
backward-fast|Backward Fast|fast-backward
backward-step|Backward Step|step-backward
bacon|Bacon
bacteria|Bacteria
bacterium|Bacterium
bag-shopping|Bag Shopping|shopping-bag
baht-sign|Baht Sign
balance-scale-left|Balance Scale Left|scale-unbalanced
ban|Ban|cancel
ban-smoking|Ban Smoking|smoking-ban
band-aid|Band Aid|bandage
bangladeshi-taka-sign|Bangladeshi Taka Sign
barcode|Barcode
bars|Bars|navicon
bars-progress|Bars Progress|tasks-alt
bars-staggered|Bars Staggered|reorder,stream
baseball|Baseball|baseball-ball
baseball-bat-ball|Baseball Bat Ball
basket-shopping|Basket Shopping|shopping-basket
basketball|Basketball|basketball-ball
bathtub|Bathtub|bath
battery|Battery|battery-5,battery-full
battery-empty|Battery Empty|battery-0
battery-half|Battery Half|battery-3
battery-quarter|Battery Quarter|battery-2
battery-three-quarters|Battery Three Quarters|battery-4
bed|Bed
bed-pulse|Bed Pulse|procedures
beer|Beer|beer-mug-empty
bell|Bell
bell-concierge|Bell Concierge|concierge-bell
bell-slash|Bell Slash
bezier-curve|Bezier Curve
bicycle|Bicycle
binoculars|Binoculars
biohazard|Biohazard
bitcoin-sign|Bitcoin Sign
blender|Blender
blender-phone|Blender Phone
blog|Blog
bold|Bold
bolt|Bolt|zap
bolt-lightning|Bolt Lightning
bomb|Bomb
bone|Bone
bong|Bong
book|Book
book-atlas|Book Atlas|atlas
book-bible|Book Bible|bible
book-bookmark|Book Bookmark
book-journal-whills|Book Journal Whills|journal-whills
book-medical|Book Medical
book-open|Book Open
book-open-reader|Book Open Reader|book-reader
book-quran|Book Quran|quran
book-skull|Book Skull|book-dead
book-tanakh|Book Tanakh|tanakh
bookmark|Bookmark
border-all|Border All
border-none|Border None
border-top-left|Border Top Left|border-style
bore-hole|Bore Hole
bottle-droplet|Bottle Droplet
bottle-water|Bottle Water
bowl-food|Bowl Food
bowl-rice|Bowl Rice
bowling-ball|Bowling Ball
box|Box
box-archive|Box Archive|archive
box-open|Box Open
box-tissue|Box Tissue
boxes|Boxes|boxes-alt,boxes-stacked
boxes-packing|Boxes Packing
braille|Braille
brain|Brain
brazilian-real-sign|Brazilian Real Sign
bread-slice|Bread Slice
bridge|Bridge
bridge-circle-check|Bridge Circle Check
bridge-circle-exclamation|Bridge Circle Exclamation
bridge-circle-xmark|Bridge Circle Xmark
bridge-lock|Bridge Lock
bridge-water|Bridge Water
briefcase|Briefcase
briefcase-clock|Briefcase Clock|business-time
briefcase-medical|Briefcase Medical
broom|Broom
broom-ball|Broom Ball|quidditch,quidditch-broom-ball
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
building-ngo|Building Ngo
building-shield|Building Shield
building-un|Building Un
building-user|Building User
building-wheat|Building Wheat
bullhorn|Bullhorn
bullseye|Bullseye
burger|Burger|hamburger
burst|Burst
bus|Bus
bus-side|Bus Side
bus-simple|Bus Simple|bus-alt
c|C
cable-car|Cable Car|tram
cake|Cake|birthday-cake,cake-candles
calculator|Calculator
calendar|Calendar
calendar-check|Calendar Check
calendar-day|Calendar Day
calendar-days|Calendar Days|calendar-alt
calendar-minus|Calendar Minus
calendar-plus|Calendar Plus
calendar-week|Calendar Week
calendar-xmark|Calendar Xmark|calendar-times
camera|Camera|camera-alt
camera-retro|Camera Retro
camera-rotate|Camera Rotate
campground|Campground
cancer|Cancer
candy-cane|Candy Cane
cannabis|Cannabis
capricorn|Capricorn
capsules|Capsules
car|Car|automobile
car-battery|Car Battery|battery-car
car-burst|Car Burst|car-crash
car-on|Car On
car-rear|Car Rear|car-alt
car-side|Car Side
car-tunnel|Car Tunnel
caravan|Caravan
caret-down|Caret Down
caret-left|Caret Left
caret-right|Caret Right
caret-up|Caret Up
carrot|Carrot
cart-arrow-down|Cart Arrow Down
cart-flatbed|Cart Flatbed|dolly-flatbed
cart-flatbed-suitcase|Cart Flatbed Suitcase|luggage-cart
cart-plus|Cart Plus
cart-shopping|Cart Shopping|shopping-cart
cash-register|Cash Register
cat|Cat
cedi-sign|Cedi Sign
cent-sign|Cent Sign
certificate|Certificate
chair|Chair
chalkboard|Chalkboard|blackboard
chalkboard-teacher|Chalkboard Teacher|chalkboard-user
charging-station|Charging Station
chart-area|Chart Area|area-chart
chart-bar|Chart Bar|bar-chart
chart-column|Chart Column
chart-diagram|Chart Diagram
chart-gantt|Chart Gantt
chart-line|Chart Line|line-chart
chart-pie|Chart Pie|pie-chart
chart-simple|Chart Simple
check|Check
check-double|Check Double
check-to-slot|Check To Slot|vote-yea
cheese|Cheese
chess|Chess
chess-bishop|Chess Bishop
chess-board|Chess Board
chess-king|Chess King
chess-knight|Chess Knight
chess-pawn|Chess Pawn
chess-queen|Chess Queen
chess-rook|Chess Rook
chevron-down|Chevron Down
chevron-left|Chevron Left
chevron-right|Chevron Right
chevron-up|Chevron Up
child|Child
child-combatant|Child Combatant|child-rifle
child-dress|Child Dress
child-reaching|Child Reaching
children|Children
church|Church
circle|Circle
circle-arrow-down|Circle Arrow Down|arrow-circle-down
circle-arrow-left|Circle Arrow Left|arrow-circle-left
circle-arrow-right|Circle Arrow Right|arrow-circle-right
circle-arrow-up|Circle Arrow Up|arrow-circle-up
circle-check|Circle Check|check-circle
circle-chevron-down|Circle Chevron Down|chevron-circle-down
circle-chevron-left|Circle Chevron Left|chevron-circle-left
circle-chevron-right|Circle Chevron Right|chevron-circle-right
circle-chevron-up|Circle Chevron Up|chevron-circle-up
circle-dollar-to-slot|Circle Dollar To Slot|donate
circle-dot|Circle Dot|dot-circle
circle-down|Circle Down|arrow-alt-circle-down
circle-exclamation|Circle Exclamation|exclamation-circle
circle-half-stroke|Circle Half Stroke|adjust
circle-info|Circle Info|info-circle
circle-left|Circle Left|arrow-alt-circle-left
circle-minus|Circle Minus|minus-circle
circle-nodes|Circle Nodes
circle-notch|Circle Notch
circle-pause|Circle Pause|pause-circle
circle-play|Circle Play|play-circle
circle-plus|Circle Plus|plus-circle
circle-question|Circle Question|question-circle
circle-radiation|Circle Radiation|radiation-alt
circle-right|Circle Right|arrow-alt-circle-right
circle-stop|Circle Stop|stop-circle
circle-up|Circle Up|arrow-alt-circle-up
circle-user|Circle User|user-circle
circle-xmark|Circle Xmark|times-circle,xmark-circle
city|City
clapperboard|Clapperboard
clipboard|Clipboard
clipboard-check|Clipboard Check
clipboard-list|Clipboard List
clipboard-question|Clipboard Question
clipboard-user|Clipboard User
clock|Clock|clock-four
clock-rotate-left|Clock Rotate Left|history
clone|Clone
closed-captioning|Closed Captioning
closed-captioning-slash|Closed Captioning Slash
cloud|Cloud
cloud-arrow-down|Cloud Arrow Down|cloud-download,cloud-download-alt
cloud-arrow-up|Cloud Arrow Up|cloud-upload,cloud-upload-alt
cloud-bolt|Cloud Bolt|thunderstorm
cloud-meatball|Cloud Meatball
cloud-moon|Cloud Moon
cloud-moon-rain|Cloud Moon Rain
cloud-rain|Cloud Rain
cloud-showers-heavy|Cloud Showers Heavy
cloud-showers-water|Cloud Showers Water
cloud-sun|Cloud Sun
cloud-sun-rain|Cloud Sun Rain
clover|Clover
code|Code
code-branch|Code Branch
code-commit|Code Commit
code-compare|Code Compare
code-fork|Code Fork
code-merge|Code Merge
code-pull-request|Code Pull Request
coins|Coins
colon-sign|Colon Sign
comment|Comment
comment-dollar|Comment Dollar
comment-dots|Comment Dots|commenting
comment-medical|Comment Medical
comment-nodes|Comment Nodes
comment-slash|Comment Slash
comment-sms|Comment Sms|sms
comments|Comments
comments-dollar|Comments Dollar
compact-disc|Compact Disc
compass|Compass
compass-drafting|Compass Drafting|drafting-compass
compress|Compress
computer|Computer
computer-mouse|Computer Mouse|mouse
cookie|Cookie
cookie-bite|Cookie Bite
copy|Copy
copyright|Copyright
couch|Couch
cow|Cow
credit-card|Credit Card|credit-card-alt
crop|Crop
crop-simple|Crop Simple|crop-alt
cross|Cross
crosshairs|Crosshairs
crow|Crow
crown|Crown
crutch|Crutch
cruzeiro-sign|Cruzeiro Sign
cube|Cube
cubes|Cubes
cubes-stacked|Cubes Stacked
d|D
database|Database
delete-left|Delete Left|backspace
democrat|Democrat
desktop|Desktop|desktop-alt
dharmachakra|Dharmachakra
diagram-next|Diagram Next
diagram-predecessor|Diagram Predecessor
diagram-project|Diagram Project|project-diagram
diagram-successor|Diagram Successor
diamond|Diamond
diamond-turn-right|Diamond Turn Right|directions
dice|Dice
dice-d20|Dice D20
dice-d6|Dice D6
dice-five|Dice Five
dice-four|Dice Four
dice-one|Dice One
dice-six|Dice Six
dice-three|Dice Three
dice-two|Dice Two
digital-tachograph|Digital Tachograph|tachograph-digital
disease|Disease
display|Display
divide|Divide
dna|Dna
dog|Dog
dollar|Dollar|dollar-sign,usd
dolly|Dolly|dolly-box
dong-sign|Dong Sign
door-closed|Door Closed
door-open|Door Open
dove|Dove
down-left-and-up-right-to-center|Down Left And Up Right To Center|compress-alt
down-long|Down Long|long-arrow-alt-down
download|Download
dragon|Dragon
droplet|Droplet|tint
droplet-slash|Droplet Slash|tint-slash
drum|Drum
drum-steelpan|Drum Steelpan
drumstick-bite|Drumstick Bite
dumbbell|Dumbbell
dumpster|Dumpster
dumpster-fire|Dumpster Fire
dungeon|Dungeon
e|E
ear-deaf|Ear Deaf|deaf,deafness,hard-of-hearing
ear-listen|Ear Listen|assistive-listening-systems
egg|Egg
eject|Eject
elevator|Elevator
ellipsis|Ellipsis|ellipsis-h
ellipsis-vertical|Ellipsis Vertical|ellipsis-v
envelope|Envelope
envelope-circle-check|Envelope Circle Check
envelope-open|Envelope Open
envelope-open-text|Envelope Open Text
equals|Equals
eraser|Eraser
ethernet|Ethernet
euro|Euro|eur,euro-sign
exclamation|Exclamation
expand|Expand
explosion|Explosion
eye|Eye
eye-dropper|Eye Dropper|eye-dropper-empty,eyedropper
eye-low-vision|Eye Low Vision|low-vision
eye-slash|Eye Slash
f|F
face-angry|Face Angry|angry
face-dizzy|Face Dizzy|dizzy
face-flushed|Face Flushed|flushed
face-frown|Face Frown|frown
face-frown-open|Face Frown Open|frown-open
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
face-kiss|Face Kiss|kiss
face-kiss-beam|Face Kiss Beam|kiss-beam
face-kiss-wink-heart|Face Kiss Wink Heart|kiss-wink-heart
face-laugh|Face Laugh|laugh
face-laugh-beam|Face Laugh Beam|laugh-beam
face-laugh-squint|Face Laugh Squint|laugh-squint
face-laugh-wink|Face Laugh Wink|laugh-wink
face-meh|Face Meh|meh
face-meh-blank|Face Meh Blank|meh-blank
face-rolling-eyes|Face Rolling Eyes|meh-rolling-eyes
face-sad-cry|Face Sad Cry|sad-cry
face-sad-tear|Face Sad Tear|sad-tear
face-smile|Face Smile|smile
face-smile-beam|Face Smile Beam|smile-beam
face-smile-wink|Face Smile Wink|smile-wink
face-surprise|Face Surprise|surprise
face-tired|Face Tired|tired
fan|Fan
faucet|Faucet
faucet-drip|Faucet Drip
fax|Fax
feather|Feather
feather-pointed|Feather Pointed|feather-alt
ferry|Ferry
file|File
file-archive|File Archive|file-zipper
file-arrow-down|File Arrow Down|file-download
file-arrow-up|File Arrow Up|file-upload
file-audio|File Audio
file-circle-check|File Circle Check
file-circle-exclamation|File Circle Exclamation
file-circle-minus|File Circle Minus
file-circle-plus|File Circle Plus
file-circle-question|File Circle Question
file-circle-xmark|File Circle Xmark
file-clipboard|File Clipboard|paste
file-code|File Code
file-contract|File Contract
file-csv|File Csv
file-excel|File Excel
file-fragment|File Fragment
file-half-dashed|File Half Dashed
file-image|File Image
file-invoice|File Invoice
file-invoice-dollar|File Invoice Dollar
file-lines|File Lines|file-alt,file-text
file-medical|File Medical
file-pdf|File Pdf
file-pen|File Pen|file-edit
file-powerpoint|File Powerpoint
file-prescription|File Prescription
file-shield|File Shield
file-signature|File Signature
file-video|File Video
file-waveform|File Waveform|file-medical-alt
file-word|File Word
fill|Fill
fill-drip|Fill Drip
film|Film|film-alt,film-simple
filter|Filter
filter-circle-dollar|Filter Circle Dollar|funnel-dollar
filter-circle-xmark|Filter Circle Xmark
fingerprint|Fingerprint
fire|Fire
fire-burner|Fire Burner
fire-extinguisher|Fire Extinguisher
fire-flame-curved|Fire Flame Curved|fire-alt
fire-flame-simple|Fire Flame Simple|burn
fish|Fish
fish-fins|Fish Fins
flag|Flag
flag-checkered|Flag Checkered
flag-usa|Flag Usa
flask|Flask
flask-vial|Flask Vial
floppy-disk|Floppy Disk|save
florin-sign|Florin Sign
folder|Folder|folder-blank
folder-closed|Folder Closed
folder-minus|Folder Minus
folder-open|Folder Open
folder-plus|Folder Plus
folder-tree|Folder Tree
font|Font
football|Football|football-ball
forward|Forward
forward-fast|Forward Fast|fast-forward
forward-step|Forward Step|step-forward
franc-sign|Franc Sign
frog|Frog
futbol|Futbol|futbol-ball,soccer-ball
g|G
gamepad|Gamepad
gas-pump|Gas Pump
gauge|Gauge|dashboard,gauge-med,tachometer-alt-average
gauge-high|Gauge High|tachometer-alt,tachometer-alt-fast
gauge-simple|Gauge Simple|gauge-simple-med,tachometer-average
gauge-simple-high|Gauge Simple High|tachometer,tachometer-fast
gavel|Gavel|legal
gear|Gear|cog
gears|Gears|cogs
gem|Gem
gemini|Gemini
genderless|Genderless
ghost|Ghost
gift|Gift
gifts|Gifts
glass-cheers|Glass Cheers|champagne-glasses
glass-martini|Glass Martini|martini-glass-empty
glass-water|Glass Water
glass-water-droplet|Glass Water Droplet
glass-whiskey|Glass Whiskey|whiskey-glass
glasses|Glasses
globe|Globe
globe-africa|Globe Africa|earth-africa
globe-americas|Globe Americas|earth,earth-america,earth-americas
globe-asia|Globe Asia|earth-asia
globe-europe|Globe Europe|earth-europe
globe-oceania|Globe Oceania|earth-oceania
golf-ball|Golf Ball|golf-ball-tee
gopuram|Gopuram
greater-than|Greater Than
greater-than-equal|Greater Than Equal
grid-horizontal|Grid Horizontal|grip,grip-horizontal
grid-vertical|Grid Vertical|grip-vertical
grip-lines|Grip Lines
grip-lines-vertical|Grip Lines Vertical
group-arrows-rotate|Group Arrows Rotate
guarani-sign|Guarani Sign
guitar|Guitar
gun|Gun
h|H
h-square|H Square|square-h
hammer|Hammer
hamsa|Hamsa
hand|Hand|hand-paper
hand-back-fist|Hand Back Fist|hand-rock
hand-dots|Hand Dots|allergies
hand-fist|Hand Fist|fist-raised
hand-holding|Hand Holding
hand-holding-dollar|Hand Holding Dollar|hand-holding-usd
hand-holding-droplet|Hand Holding Droplet|hand-holding-water
hand-holding-hand|Hand Holding Hand
hand-holding-heart|Hand Holding Heart
hand-holding-medical|Hand Holding Medical
hand-lizard|Hand Lizard
hand-middle-finger|Hand Middle Finger
hand-peace|Hand Peace
hand-point-down|Hand Point Down
hand-point-left|Hand Point Left
hand-point-right|Hand Point Right
hand-point-up|Hand Point Up
hand-pointer|Hand Pointer
hand-scissors|Hand Scissors
hand-sparkles|Hand Sparkles
hand-spock|Hand Spock
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
hands-praying|Hands Praying|praying-hands
handshake|Handshake|handshake-alt,handshake-simple
handshake-simple-slash|Handshake Simple Slash|handshake-alt-slash,handshake-slash
hanukiah|Hanukiah
hard-drive|Hard Drive|hdd
hashtag|Hashtag
hat-cowboy|Hat Cowboy
hat-cowboy-side|Hat Cowboy Side
hat-hard|Hat Hard|hard-hat,helmet-safety
hat-wizard|Hat Wizard
haykal|Haykal|bahai
head-side-cough|Head Side Cough
head-side-cough-slash|Head Side Cough Slash
head-side-mask|Head Side Mask
head-side-virus|Head Side Virus
heading|Heading|header
headphones|Headphones|headphones-alt,headphones-simple
headset|Headset
heart|Heart
heart-circle-bolt|Heart Circle Bolt
heart-circle-check|Heart Circle Check
heart-circle-exclamation|Heart Circle Exclamation
heart-circle-minus|Heart Circle Minus
heart-circle-plus|Heart Circle Plus
heart-circle-xmark|Heart Circle Xmark
heart-crack|Heart Crack|heart-broken
heart-music-camera-bolt|Heart Music Camera Bolt|icons
heart-pulse|Heart Pulse|heartbeat
helicopter|Helicopter
helicopter-symbol|Helicopter Symbol
helmet-un|Helmet Un
heptagon|Heptagon|septagon
hexagon|Hexagon
hexagon-nodes|Hexagon Nodes
hexagon-nodes-bolt|Hexagon Nodes Bolt
highlighter|Highlighter
hill-avalanche|Hill Avalanche
hill-rockslide|Hill Rockslide
hippo|Hippo
hockey-puck|Hockey Puck
holly-berry|Holly Berry
horse|Horse
horse-head|Horse Head
hospital|Hospital|hospital-alt,hospital-wide
hospital-symbol|Hospital Symbol|circle-h
hospital-user|Hospital User
hot-tub|Hot Tub|hot-tub-person
hotdog|Hotdog
hotel|Hotel
hourglass|Hourglass|hourglass-empty
hourglass-end|Hourglass End|hourglass-3
hourglass-half|Hourglass Half|hourglass-2
hourglass-start|Hourglass Start|hourglass-1
house|House|home,home-alt,home-lg-alt
house-chimney|House Chimney|home-lg
house-chimney-crack|House Chimney Crack|house-damage
house-chimney-medical|House Chimney Medical|clinic-medical
house-chimney-user|House Chimney User
house-chimney-window|House Chimney Window
house-circle-check|House Circle Check
house-circle-exclamation|House Circle Exclamation
house-circle-xmark|House Circle Xmark
house-crack|House Crack
house-fire|House Fire
house-flag|House Flag
house-flood-water|House Flood Water
house-flood-water-circle-arrow-right|House Flood Water Circle Arrow Right
house-laptop|House Laptop|laptop-house
house-lock|House Lock
house-medical|House Medical
house-medical-circle-check|House Medical Circle Check
house-medical-circle-exclamation|House Medical Circle Exclamation
house-medical-circle-xmark|House Medical Circle Xmark
house-medical-flag|House Medical Flag
house-signal|House Signal
house-tsunami|House Tsunami
house-user|House User|home-user
hryvnia|Hryvnia|hryvnia-sign
hurricane|Hurricane
i|I
i-cursor|I Cursor
ice-cream|Ice Cream
icicles|Icicles
id-badge|Id Badge
id-card|Id Card|drivers-license
id-card-clip|Id Card Clip|id-card-alt
igloo|Igloo
image|Image
image-portrait|Image Portrait|portrait
images|Images
inbox|Inbox
indent|Indent
indian-rupee|Indian Rupee|indian-rupee-sign,inr
industry|Industry
infinity|Infinity
info|Info
italic|Italic
j|J
jar|Jar
jar-wheat|Jar Wheat
jedi|Jedi
jet-fighter|Jet Fighter|fighter-jet
jet-fighter-up|Jet Fighter Up
joint|Joint
jug-detergent|Jug Detergent
k|K
kaaba|Kaaba
key|Key
keyboard|Keyboard
khanda|Khanda
kip-sign|Kip Sign
kit-medical|Kit Medical|first-aid
kitchen-set|Kitchen Set
kiwi-bird|Kiwi Bird
l|L
land-mine-on|Land Mine On
landmark|Landmark
landmark-dome|Landmark Dome|landmark-alt
landmark-flag|Landmark Flag
language|Language
laptop|Laptop
laptop-code|Laptop Code
laptop-file|Laptop File
laptop-medical|Laptop Medical
lari-sign|Lari Sign
layer-group|Layer Group
leaf|Leaf
left-long|Left Long|long-arrow-alt-left
left-right|Left Right|arrows-alt-h
lemon|Lemon
leo|Leo
less-than|Less Than
less-than-equal|Less Than Equal
libra|Libra
life-ring|Life Ring
lightbulb|Lightbulb
lines-leaning|Lines Leaning
link|Link|chain
link-slash|Link Slash|chain-broken,chain-slash,unlink
lira-sign|Lira Sign
list|List|list-squares
list-check|List Check|tasks
list-dots|List Dots|list-ul
list-numeric|List Numeric|list-1-2,list-ol
litecoin-sign|Litecoin Sign
location|Location|location-crosshairs
location-arrow|Location Arrow
location-dot|Location Dot|map-marker-alt
location-pin|Location Pin|map-marker
location-pin-lock|Location Pin Lock
lock|Lock
lock-open|Lock Open
locust|Locust
lungs|Lungs
lungs-virus|Lungs Virus
m|M
magnet|Magnet
magnifying-glass|Magnifying Glass|search
magnifying-glass-arrow-right|Magnifying Glass Arrow Right
magnifying-glass-chart|Magnifying Glass Chart
magnifying-glass-dollar|Magnifying Glass Dollar|search-dollar
magnifying-glass-location|Magnifying Glass Location|search-location
magnifying-glass-minus|Magnifying Glass Minus|search-minus
magnifying-glass-plus|Magnifying Glass Plus|search-plus
mail-bulk|Mail Bulk|envelopes-bulk
mail-reply|Mail Reply|reply
mail-reply-all|Mail Reply All|reply-all
manat-sign|Manat Sign
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
mask-ventilator|Mask Ventilator
masks-theater|Masks Theater|theater-masks
mattress-pillow|Mattress Pillow
maximize|Maximize|expand-arrows-alt
medal|Medal
memory|Memory
menorah|Menorah
mercury|Mercury
message|Message|comment-alt
meteor|Meteor
microchip|Microchip
microphone|Microphone
microphone-lines|Microphone Lines|microphone-alt
microphone-lines-slash|Microphone Lines Slash|microphone-alt-slash
microphone-slash|Microphone Slash
microscope|Microscope
mill-sign|Mill Sign
minimize|Minimize|compress-arrows-alt
minus|Minus|subtract
mitten|Mitten
mobile|Mobile|mobile-android,mobile-phone
mobile-button|Mobile Button
mobile-retro|Mobile Retro
mobile-screen|Mobile Screen|mobile-android-alt
mobile-screen-button|Mobile Screen Button|mobile-alt
mobile-vibrate|Mobile Vibrate
money-bill|Money Bill
money-bill-1-wave|Money Bill 1 Wave|money-bill-wave-alt
money-bill-alt|Money Bill Alt|money-bill-1
money-bill-transfer|Money Bill Transfer
money-bill-trend-up|Money Bill Trend Up
money-bill-wave|Money Bill Wave
money-bill-wheat|Money Bill Wheat
money-bills|Money Bills
money-check|Money Check
money-check-dollar|Money Check Dollar|money-check-alt
monument|Monument
moon|Moon
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
mug-hot|Mug Hot
mug-saucer|Mug Saucer|coffee
music|Music
n|N
naira-sign|Naira Sign
network-wired|Network Wired
neuter|Neuter
newspaper|Newspaper
non-binary|Non Binary
not-equal|Not Equal
notdef|Notdef
note-sticky|Note Sticky|sticky-note
notes-medical|Notes Medical
o|O
object-group|Object Group
object-ungroup|Object Ungroup
octagon|Octagon
oil-can|Oil Can
oil-well|Oil Well
om|Om
otter|Otter
outdent|Outdent|dedent
p|P
pager|Pager
paint-roller|Paint Roller
paintbrush|Paintbrush|paint-brush
palette|Palette
pallet|Pallet
panorama|Panorama
paper-plane|Paper Plane
paperclip|Paperclip
parachute-box|Parachute Box
paragraph|Paragraph
passport|Passport
pause|Pause
paw|Paw
peace|Peace
pen|Pen
pen-clip|Pen Clip|pen-alt
pen-fancy|Pen Fancy
pen-nib|Pen Nib
pen-ruler|Pen Ruler|pencil-ruler
pen-to-square|Pen To Square|edit
pencil|Pencil|pencil-alt
pentagon|Pentagon
people-arrows|People Arrows|people-arrows-left-right
people-carry|People Carry|people-carry-box
people-group|People Group
people-line|People Line
people-pulling|People Pulling
people-robbery|People Robbery
people-roof|People Roof
pepper-hot|Pepper Hot
percentage|Percentage|percent
person|Person|male
person-arrow-down-to-line|Person Arrow Down To Line
person-arrow-up-from-line|Person Arrow Up From Line
person-biking|Person Biking|biking
person-booth|Person Booth
person-breastfeeding|Person Breastfeeding
person-burst|Person Burst
person-cane|Person Cane
person-chalkboard|Person Chalkboard
person-circle-check|Person Circle Check
person-circle-exclamation|Person Circle Exclamation
person-circle-minus|Person Circle Minus
person-circle-plus|Person Circle Plus
person-circle-question|Person Circle Question
person-circle-xmark|Person Circle Xmark
person-digging|Person Digging|digging
person-dots-from-line|Person Dots From Line|diagnoses
person-dress|Person Dress|female
person-dress-burst|Person Dress Burst
person-drowning|Person Drowning
person-falling|Person Falling
person-falling-burst|Person Falling Burst
person-half-dress|Person Half Dress
person-harassing|Person Harassing
person-hiking|Person Hiking|hiking
person-military-pointing|Person Military Pointing
person-military-rifle|Person Military Rifle
person-military-to-person|Person Military To Person
person-praying|Person Praying|pray
person-pregnant|Person Pregnant
person-rays|Person Rays
person-rifle|Person Rifle
person-running|Person Running|running
person-shelter|Person Shelter
person-skating|Person Skating|skating
person-skiing|Person Skiing|skiing
person-skiing-nordic|Person Skiing Nordic|skiing-nordic
person-snowboarding|Person Snowboarding|snowboarding
person-swimming|Person Swimming|swimmer
person-through-window|Person Through Window
person-walking|Person Walking|walking
person-walking-arrow-loop-left|Person Walking Arrow Loop Left
person-walking-arrow-right|Person Walking Arrow Right
person-walking-dashed-line-arrow-right|Person Walking Dashed Line Arrow Right
person-walking-luggage|Person Walking Luggage
person-walking-with-cane|Person Walking With Cane|blind
peseta-sign|Peseta Sign
peso-sign|Peso Sign
phone|Phone
phone-flip|Phone Flip|phone-alt
phone-slash|Phone Slash
phone-volume|Phone Volume|volume-control-phone
photo-video|Photo Video|photo-film
picture-in-picture|Picture In Picture
piggy-bank|Piggy Bank
pills|Pills
pisces|Pisces
pizza-slice|Pizza Slice
place-of-worship|Place Of Worship
plane|Plane
plane-arrival|Plane Arrival
plane-circle-check|Plane Circle Check
plane-circle-exclamation|Plane Circle Exclamation
plane-circle-xmark|Plane Circle Xmark
plane-departure|Plane Departure
plane-lock|Plane Lock
plane-slash|Plane Slash
plane-up|Plane Up
plant-wilt|Plant Wilt
plate-wheat|Plate Wheat
play|Play
plug|Plug
plug-circle-bolt|Plug Circle Bolt
plug-circle-check|Plug Circle Check
plug-circle-exclamation|Plug Circle Exclamation
plug-circle-minus|Plug Circle Minus
plug-circle-plus|Plug Circle Plus
plug-circle-xmark|Plug Circle Xmark
plus|Plus|add
plus-minus|Plus Minus
podcast|Podcast
poo|Poo
poo-storm|Poo Storm|poo-bolt
poop|Poop
power-off|Power Off
prescription|Prescription
prescription-bottle|Prescription Bottle
prescription-bottle-medical|Prescription Bottle Medical|prescription-bottle-alt
print|Print
pump-medical|Pump Medical
pump-soap|Pump Soap
puzzle-piece|Puzzle Piece
q|Q
qrcode|Qrcode
question|Question
quote-left|Quote Left|quote-left-alt
quote-right|Quote Right|quote-right-alt
r|R
radiation|Radiation
radio|Radio
rainbow|Rainbow
ranking-star|Ranking Star
receipt|Receipt
record-vinyl|Record Vinyl
rectangle-ad|Rectangle Ad|ad
rectangle-list|Rectangle List|list-alt
rectangle-xmark|Rectangle Xmark|rectangle-times,times-rectangle,window-close
recycle|Recycle
registered|Registered
repeat|Repeat
republican|Republican
restroom|Restroom
retweet|Retweet
ribbon|Ribbon
right-from-bracket|Right From Bracket|sign-out-alt
right-left|Right Left|exchange-alt
right-long|Right Long|long-arrow-alt-right
right-to-bracket|Right To Bracket|sign-in-alt
ring|Ring
road|Road
road-barrier|Road Barrier
road-bridge|Road Bridge
road-circle-check|Road Circle Check
road-circle-exclamation|Road Circle Exclamation
road-circle-xmark|Road Circle Xmark
road-lock|Road Lock
road-spikes|Road Spikes
robot|Robot
rocket|Rocket
rotate|Rotate|sync-alt
rotate-backward|Rotate Backward|rotate-back,rotate-left,undo-alt
rotate-forward|Rotate Forward|redo-alt,rotate-right
route|Route
rss|Rss|feed
ruble|Ruble|rouble,rub,ruble-sign
rug|Rug
ruler|Ruler
ruler-combined|Ruler Combined
ruler-horizontal|Ruler Horizontal
ruler-vertical|Ruler Vertical
rupee|Rupee|rupee-sign
rupiah-sign|Rupiah Sign
s|S
sack-dollar|Sack Dollar
sack-xmark|Sack Xmark
sagittarius|Sagittarius
sailboat|Sailboat
satellite|Satellite
satellite-dish|Satellite Dish
scale-balanced|Scale Balanced|balance-scale
scale-unbalanced-flip|Scale Unbalanced Flip|balance-scale-right
school|School
school-circle-check|School Circle Check
school-circle-exclamation|School Circle Exclamation
school-circle-xmark|School Circle Xmark
school-flag|School Flag
school-lock|School Lock
scissors|Scissors|cut
scorpio|Scorpio
screwdriver|Screwdriver
screwdriver-wrench|Screwdriver Wrench|tools
scroll|Scroll
scroll-torah|Scroll Torah|torah
sd-card|Sd Card
section|Section
seedling|Seedling|sprout
server|Server
share|Share|mail-forward
share-from-square|Share From Square|share-square
share-nodes|Share Nodes|share-alt
sheet-plastic|Sheet Plastic
shekel|Shekel|ils,shekel-sign,sheqel,sheqel-sign
shield|Shield|shield-blank
shield-cat|Shield Cat
shield-dog|Shield Dog
shield-halved|Shield Halved|shield-alt
shield-heart|Shield Heart
shield-virus|Shield Virus
ship|Ship
shirt|Shirt|t-shirt,tshirt
shoe-prints|Shoe Prints
shop|Shop|store-alt
shop-lock|Shop Lock
shop-slash|Shop Slash|store-alt-slash
shower|Shower
shrimp|Shrimp
shuffle|Shuffle|random
shuttle-van|Shuttle Van|van-shuttle
sign|Sign|sign-hanging
signal|Signal|signal-5,signal-perfect
signature|Signature
sim-card|Sim Card
single-quote-left|Single Quote Left
single-quote-right|Single Quote Right
sink|Sink
sitemap|Sitemap
skull|Skull
skull-crossbones|Skull Crossbones
slash|Slash
sleigh|Sleigh
sliders|Sliders|sliders-h
smog|Smog
smoking|Smoking
snowflake|Snowflake
snowman|Snowman
snowplow|Snowplow
soap|Soap
socks|Socks
solar-panel|Solar Panel
sort|Sort|unsorted
sort-asc|Sort Asc|sort-up
sort-desc|Sort Desc|sort-down
sort-numeric-desc|Sort Numeric Desc|arrow-down-9-1,sort-numeric-down-alt
sort-numeric-down|Sort Numeric Down|arrow-down-1-9,sort-numeric-asc
sort-numeric-up|Sort Numeric Up|arrow-up-1-9
spa|Spa
space-shuttle|Space Shuttle|shuttle-space
spaghetti-monster-flying|Spaghetti Monster Flying|pastafarianism
spell-check|Spell Check
spider|Spider
spinner|Spinner
spiral|Spiral
splotch|Splotch
spray-can|Spray Can
spray-can-sparkles|Spray Can Sparkles|air-freshener
square|Square
square-arrow-up-right|Square Arrow Up Right|external-link-square
square-binary|Square Binary
square-caret-down|Square Caret Down|caret-square-down
square-caret-left|Square Caret Left|caret-square-left
square-caret-right|Square Caret Right|caret-square-right
square-caret-up|Square Caret Up|caret-square-up
square-check|Square Check|check-square
square-envelope|Square Envelope|envelope-square
square-full|Square Full
square-minus|Square Minus|minus-square
square-nfi|Square Nfi
square-parking|Square Parking|parking
square-pen|Square Pen|pen-square,pencil-square
square-person-confined|Square Person Confined
square-phone|Square Phone|phone-square
square-phone-flip|Square Phone Flip|phone-square-alt
square-plus|Square Plus|plus-square
square-poll-horizontal|Square Poll Horizontal|poll-h
square-poll-vertical|Square Poll Vertical|poll
square-root-variable|Square Root Variable|square-root-alt
square-rss|Square Rss|rss-square
square-share-nodes|Square Share Nodes|share-alt-square
square-up-right|Square Up Right|external-link-square-alt
square-virus|Square Virus
square-xmark|Square Xmark|times-square,xmark-square
staff-aesculapius|Staff Aesculapius|rod-asclepius,rod-snake,staff-snake
stairs|Stairs
stamp|Stamp
stapler|Stapler
star|Star
star-and-crescent|Star And Crescent
star-half|Star Half
star-half-stroke|Star Half Stroke|star-half-alt
star-of-david|Star Of David
star-of-life|Star Of Life
sterling-sign|Sterling Sign|gbp,pound-sign
stethoscope|Stethoscope
stop|Stop
stopwatch|Stopwatch
stopwatch-20|Stopwatch 20
store|Store
store-slash|Store Slash
street-view|Street View
strikethrough|Strikethrough
stroopwafel|Stroopwafel
subscript|Subscript
suitcase|Suitcase
suitcase-medical|Suitcase Medical|medkit
suitcase-rolling|Suitcase Rolling
sun|Sun
sun-plant-wilt|Sun Plant Wilt
superscript|Superscript
swatchbook|Swatchbook
synagogue|Synagogue
syringe|Syringe
t|T
table|Table
table-cells|Table Cells|th
table-cells-column-lock|Table Cells Column Lock
table-cells-large|Table Cells Large|th-large
table-cells-row-lock|Table Cells Row Lock
table-cells-row-unlock|Table Cells Row Unlock
table-columns|Table Columns|columns
table-list|Table List|th-list
table-tennis|Table Tennis|ping-pong-paddle-ball,table-tennis-paddle-ball
tablet|Tablet|tablet-android
tablet-button|Tablet Button
tablet-screen-button|Tablet Screen Button|tablet-alt
tablets|Tablets
tag|Tag
tags|Tags
tape|Tape
tarp|Tarp
tarp-droplet|Tarp Droplet
taurus|Taurus
taxi|Taxi|cab
teeth|Teeth
teeth-open|Teeth Open
teletype|Teletype|tty
temperature-arrow-down|Temperature Arrow Down|temperature-down
temperature-arrow-up|Temperature Arrow Up|temperature-up
temperature-empty|Temperature Empty|temperature-0,thermometer-0,thermometer-empty
temperature-full|Temperature Full|temperature-4,thermometer-4,thermometer-full
temperature-half|Temperature Half|temperature-2,thermometer-2,thermometer-half
temperature-high|Temperature High
temperature-low|Temperature Low
temperature-quarter|Temperature Quarter|temperature-1,thermometer-1,thermometer-quarter
temperature-three-quarters|Temperature Three Quarters|temperature-3,thermometer-3,thermometer-three-quarters
tenge|Tenge|tenge-sign
tent|Tent
tent-arrow-down-to-line|Tent Arrow Down To Line
tent-arrow-left-right|Tent Arrow Left Right
tent-arrow-turn-left|Tent Arrow Turn Left
tent-arrows-down|Tent Arrows Down
tents|Tents
terminal|Terminal
text-height|Text Height
text-slash|Text Slash|remove-format
text-width|Text Width
thermometer|Thermometer
thumbs-down|Thumbs Down
thumbs-up|Thumbs Up
thumbtack|Thumbtack|thumb-tack
thumbtack-slash|Thumbtack Slash|thumb-tack-slash
ticket|Ticket
ticket-simple|Ticket Simple|ticket-alt
timeline|Timeline
toggle-off|Toggle Off
toggle-on|Toggle On
toilet|Toilet
toilet-paper|Toilet Paper|toilet-paper-alt,toilet-paper-blank
toilet-paper-slash|Toilet Paper Slash
toilet-portable|Toilet Portable
toilets-portable|Toilets Portable
toolbox|Toolbox
tooth|Tooth
torii-gate|Torii Gate
tornado|Tornado
tower-broadcast|Tower Broadcast|broadcast-tower
tower-cell|Tower Cell
tower-observation|Tower Observation
tractor|Tractor
trademark|Trademark
traffic-light|Traffic Light
trailer|Trailer
train|Train
train-subway|Train Subway|subway
train-tram|Train Tram
transgender|Transgender|transgender-alt
trash|Trash
trash-arrow-up|Trash Arrow Up|trash-restore
trash-can|Trash Can|trash-alt
trash-can-arrow-up|Trash Can Arrow Up|trash-restore-alt
tree|Tree
tree-city|Tree City
triangle-circle-square|Triangle Circle Square|shapes
triangle-exclamation|Triangle Exclamation|exclamation-triangle,warning
trophy|Trophy
trowel|Trowel
trowel-bricks|Trowel Bricks
truck|Truck
truck-arrow-right|Truck Arrow Right
truck-droplet|Truck Droplet
truck-fast|Truck Fast|shipping-fast
truck-field|Truck Field
truck-field-un|Truck Field Un
truck-front|Truck Front
truck-medical|Truck Medical|ambulance
truck-monster|Truck Monster
truck-moving|Truck Moving
truck-pickup|Truck Pickup
truck-plane|Truck Plane
truck-ramp-box|Truck Ramp Box|truck-loading
turkish-lira|Turkish Lira|try,turkish-lira-sign
turn-down|Turn Down|level-down-alt
turn-up|Turn Up|level-up-alt
tv|Tv|television,tv-alt
u|U
umbrella|Umbrella
umbrella-beach|Umbrella Beach
underline|Underline
universal-access|Universal Access
unlock|Unlock
unlock-keyhole|Unlock Keyhole|unlock-alt
up-down|Up Down|arrows-alt-v
up-down-left-right|Up Down Left Right|arrows-alt
up-long|Up Long|long-arrow-alt-up
up-right-and-down-left-from-center|Up Right And Down Left From Center|expand-alt
up-right-from-square|Up Right From Square|external-link-alt
upload|Upload
user|User|user-alt,user-large
user-astronaut|User Astronaut
user-check|User Check
user-clock|User Clock
user-doctor|User Doctor|user-md
user-friends|User Friends|user-group
user-gear|User Gear|user-cog
user-graduate|User Graduate
user-injured|User Injured
user-large-slash|User Large Slash|user-alt-slash,user-slash
user-lock|User Lock
user-minus|User Minus
user-ninja|User Ninja
user-nurse|User Nurse
user-pen|User Pen|user-edit
user-plus|User Plus
user-secret|User Secret
user-shield|User Shield
user-tag|User Tag
user-tie|User Tie
user-xmark|User Xmark|user-times
users|Users
users-between-lines|Users Between Lines
users-gear|Users Gear|users-cog
users-line|Users Line
users-rays|Users Rays
users-rectangle|Users Rectangle
users-slash|Users Slash
users-viewfinder|Users Viewfinder
utensil-spoon|Utensil Spoon|spoon
utensils|Utensils|cutlery
v|V
vault|Vault
vector-polygon|Vector Polygon|draw-polygon
venus|Venus
venus-double|Venus Double
venus-mars|Venus Mars
vest|Vest
vest-patches|Vest Patches
vial|Vial
vial-circle-check|Vial Circle Check
vial-virus|Vial Virus
vials|Vials
video|Video|video-camera
video-slash|Video Slash
vihara|Vihara
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
volume-xmark|Volume Xmark|volume-mute,volume-times
vr-cardboard|Vr Cardboard
w|W
walkie-talkie|Walkie Talkie
wallet|Wallet
wand-magic|Wand Magic|magic
wand-magic-sparkles|Wand Magic Sparkles|magic-wand-sparkles
wand-sparkles|Wand Sparkles
warehouse|Warehouse
water|Water
water-ladder|Water Ladder|ladder-water,swimming-pool
wave-square|Wave Square
weight|Weight|weight-scale
weight-hanging|Weight Hanging
wheat-awn|Wheat Awn|wheat-alt
wheat-awn-circle-exclamation|Wheat Awn Circle Exclamation
wheelchair|Wheelchair
wheelchair-move|Wheelchair Move|wheelchair-alt
wifi|Wifi|wifi-3,wifi-strong
wind|Wind
window-maximize|Window Maximize
window-minimize|Window Minimize
window-restore|Window Restore
wine-bottle|Wine Bottle
wine-glass|Wine Glass
wine-glass-empty|Wine Glass Empty|wine-glass-alt
won|Won|krw,won-sign
worm|Worm
wrench|Wrench
x|X
x-ray|X Ray
xmark|Xmark|close,multiply,remove,times
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
 * Every icon Foundry's bundled Font Awesome can render under a name Font Awesome publishes for
 * free, brands excluded.
 *
 * Frozen ENTRY BY ENTRY, not just as an array: `Object.freeze` is shallow, and the curated
 * vocabulary is a filter of this array, so an unfrozen entry would hand any caller a writable
 * handle on a row every Fabricate picker renders from.
 *
 * @type {ReadonlyArray<{ iconCode: string, label: string, aliases: ReadonlyArray<string> }>}
 */
export const FOUNDRY_ICON_DEFINITIONS = Object.freeze(definitions);

/** The Font Awesome release Foundry bundles, which this catalogue was measured from. */
export const FOUNDRY_ICON_BUNDLE_RELEASE = Object.freeze({
  edition: 'Pro',
  version: '7.2.0',
  foundryVersion: '14.365.0',
});

/**
 * The free release whose names this catalogue was narrowed to.
 *
 * Recorded rather than inferred so the licensing guard can say WHICH free set the committed names
 * were checked against, and fail when the pinned devDependency moves away from it.
 */
export const FOUNDRY_ICON_FREE_INTERSECTION = Object.freeze({
  edition: 'Free',
  version: '7.3.1',
});
