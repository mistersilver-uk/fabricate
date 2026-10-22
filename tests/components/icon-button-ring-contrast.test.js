/**
 * Issue 2601: the published `IconButton`'s keyboard ring is the accent, 2px wide and 2px clear of
 * the button, from the module ring every Fabricate window draws and from the button's own rule
 * alike, and it clears 3:1 in all seven themes against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`
 * and `--fab-bg-2`, the grounds its group names, and falls short against `--fab-bg-3` in two.
 */
import { defineAccentRingContrast } from '../helpers/accentRingContrast.js';

defineAccentRingContrast('.fabricate-icon-button:focus-visible');
