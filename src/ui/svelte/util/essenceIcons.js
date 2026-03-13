export const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

const RAW_ESSENCE_ICON_OPTIONS = [
  { label: 'Alchemy', iconClass: DEFAULT_ESSENCE_ICON, keywords: ['craft', 'mix', 'potion'] },
  { label: 'Water', iconClass: 'fas fa-tint', keywords: ['droplet', 'liquid'] },
  { label: 'Fire', iconClass: 'fas fa-fire', keywords: ['flame', 'heat'] },
  { label: 'Nature', iconClass: 'fas fa-leaf', keywords: ['verdant', 'plant', 'growth'] },
  { label: 'Poison', iconClass: 'fas fa-skull-crossbones', keywords: ['toxic', 'venom', 'harm'] },
  { label: 'Restoration', iconClass: 'fas fa-heart', keywords: ['healing', 'life', 'mend'] },
  { label: 'Lightning', iconClass: 'fas fa-bolt', keywords: ['shock', 'energy'] },
  { label: 'Light', iconClass: 'fas fa-sun', keywords: ['positive', 'holy', 'radiance'] },
  { label: 'Shadow', iconClass: 'fas fa-moon', keywords: ['negative', 'dark', 'entropy'] },
  { label: 'Ice', iconClass: 'fas fa-snowflake', keywords: ['cold', 'frost'] },
  { label: 'Air', iconClass: 'fas fa-wind', keywords: ['storm', 'breath'] },
  { label: 'Earth', iconClass: 'fas fa-mountain', keywords: ['stone', 'rock'] },
  { label: 'Beast', iconClass: 'fas fa-paw', keywords: ['animal', 'wild'] },
  { label: 'Bone', iconClass: 'fas fa-bone', keywords: ['skeletal', 'undead'] },
  { label: 'Mind', iconClass: 'fas fa-brain', keywords: ['thought', 'psyche'] },
  { label: 'Sight', iconClass: 'fas fa-eye', keywords: ['vision', 'perception'] },
  { label: 'Spirit', iconClass: 'fas fa-ghost', keywords: ['soul', 'ethereal'] },
  { label: 'Time', iconClass: 'fas fa-hourglass-half', keywords: ['temporal', 'clock'] },
  { label: 'Flask', iconClass: 'fas fa-flask', keywords: ['chemical', 'science'] },
  { label: 'Vial', iconClass: 'fas fa-vial', keywords: ['liquid', 'potion'] },
  { label: 'Crystal', iconClass: 'fas fa-gem', keywords: ['arcane', 'precious'] },
  { label: 'Star', iconClass: 'fas fa-star', keywords: ['celestial'] },
  { label: 'Shield', iconClass: 'fas fa-shield-alt', keywords: ['ward', 'defense'] },
  { label: 'Feather', iconClass: 'fas fa-feather-alt', keywords: ['grace', 'lightness'] },
  { label: 'Cloud', iconClass: 'fas fa-cloud', keywords: ['mist', 'vapour'] },
  { label: 'Spider', iconClass: 'fas fa-spider', keywords: ['venom', 'web'] },
  { label: 'Seedling', iconClass: 'fas fa-seedling', keywords: ['growth', 'sprout'] },
  { label: 'Atom', iconClass: 'fas fa-atom', keywords: ['arcane', 'unstable'] },
  { label: 'Radiation', iconClass: 'fas fa-radiation-alt', keywords: ['mutagenic', 'hazard'] },
  { label: 'Anchor', iconClass: 'fas fa-anchor', keywords: ['sea', 'depth'] }
];

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function createSearchText(option) {
  return normalizeSearch([
    option.label,
    option.iconClass,
    ...(Array.isArray(option.keywords) ? option.keywords : [])
  ].join(' '));
}

export const ESSENCE_ICON_OPTIONS = Object.freeze(
  RAW_ESSENCE_ICON_OPTIONS.map(option => Object.freeze({
    label: option.label,
    iconClass: option.iconClass,
    keywords: Object.freeze([...(option.keywords || [])]),
    searchText: createSearchText(option)
  }))
);

export function normalizeEssenceIcon(iconClass) {
  return String(iconClass || '').trim() || DEFAULT_ESSENCE_ICON;
}

export function getEssenceIconOptions() {
  return ESSENCE_ICON_OPTIONS;
}

export function getEssenceIconOption(iconClass) {
  const normalizedIcon = normalizeEssenceIcon(iconClass);
  return ESSENCE_ICON_OPTIONS.find(option => option.iconClass === normalizedIcon) || {
    label: normalizedIcon,
    iconClass: normalizedIcon,
    keywords: Object.freeze([]),
    searchText: normalizeSearch(normalizedIcon)
  };
}

export function filterEssenceIconOptions(searchTerm = '') {
  const normalizedSearch = normalizeSearch(searchTerm);
  if (!normalizedSearch) return ESSENCE_ICON_OPTIONS;

  const tokens = normalizedSearch.split(' ').filter(Boolean);
  return ESSENCE_ICON_OPTIONS.filter(option =>
    tokens.every(token => option.searchText.includes(token))
  );
}
