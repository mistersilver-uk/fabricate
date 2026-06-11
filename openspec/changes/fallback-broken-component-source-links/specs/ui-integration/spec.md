## Component Import Warnings

### ADDED Requirements

1. When a single component import or replace-source operation falls back because
   the dropped Item's recorded canonical source UUID no longer resolves, the GM
   manager UI must warn that the original source link is broken and Fabricate
   used the live dropped Item UUID instead.
2. When a folder or compendium pack import falls back for one or more Items, the
   GM manager UI must emit one summary warning with the number of affected
   Items, rather than one warning per Item.
