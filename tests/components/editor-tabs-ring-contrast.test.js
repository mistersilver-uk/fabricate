/**
 * Issue 2601: the published `EditorTabs`' keyboard ring on a tab is the accent, 2px wide and 2px
 * clear of the tab, from the module ring every Fabricate window draws and from the strip's own
 * rule alike, and it clears 3:1 in all seven themes against `--fab-bg-0`, `--fab-bg-1`,
 * `--fab-surface` and `--fab-bg-2`, the grounds its group names, and falls short against
 * `--fab-bg-3` in two.
 */
import { defineAccentRingContrast } from '../helpers/accentRingContrast.js';

defineAccentRingContrast('.fabricate-tabs button:focus-visible');
