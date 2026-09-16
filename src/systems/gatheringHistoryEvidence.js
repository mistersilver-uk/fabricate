/** Attribute recorded awards by full identity; evaluated quantities are never receipts. */
const list = (value) => (Array.isArray(value) ? value : []);
const named = (value) => typeof value === 'string' && value.trim() !== '';
function number(value) {
  if (typeof value !== 'number' && !named(value)) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

// Every caller here owns an Item-bearing field. Only simple pack Item spellings are aliases.
function itemAddress(value) {
  if (!named(value)) return null;
  const pack = /^Compendium\.([^.]+)\.([^.]+)\.(?:Item\.)?([^.]+)$/.exec(value);
  if (pack) return `Compendium.${pack[1]}.${pack[2]}.Item.${pack[3]}`;
  return /^(?:Item\.[^.]+|Actor\.[^.]+\.Item\.[^.]+|Scene\.[^.]+\.Token\.[^.]+\.Actor\.[^.]+\.Item\.[^.]+)$/.test(
    value
  )
    ? value
    : null;
}

function scoped(row, systemId) {
  return [row?.craftingSystemId, row?.systemId].every((id) => !named(id) || id === systemId);
}

function sources(row, components) {
  const values = [row?.sourceItemUuid, row?.itemUuid];
  if (named(row?.componentId)) {
    for (const component of components) {
      if (component?.id !== row.componentId) continue;
      values.push(
        component.registeredItemUuid,
        component.originItemUuid,
        ...list(component.aliasItemUuids)
      );
    }
  }
  return new Set(values.map(itemAddress).filter(Boolean));
}

function compatiblePhysicalActor(row) {
  const match = /^(Actor\.[^.]+|Scene\.[^.]+\.Token\.[^.]+\.Actor\.[^.]+)\.Item\.[^.]+$/.exec(
    row?.itemUuid ?? ''
  );
  return !match || !named(row.actorUuid) || row.actorUuid === match[1];
}

function sourceMatchFor(row, award, components) {
  const rowSources = sources(row, components);
  // A source UUID is distinct from the owned destination; use the source when recorded.
  const awardSource = named(award.sourceItemUuid) ? award.sourceItemUuid : award.itemUuid;
  const address = itemAddress(awardSource);
  const sourceMatch = address && rowSources.has(address);
  const explicitSource = named(awardSource);
  const destinationOnly =
    !named(award.sourceItemUuid) && /^(?:Actor|Scene)\./.test(awardSource ?? '');
  const physicalRow = /^(?:Actor|Scene)\./.test(row.itemUuid ?? '');
  if (physicalRow && destinationOnly && row.itemUuid !== award.itemUuid) return 'conflict';
  if (explicitSource && !address) return 'conflict';
  if (rowSources.size > 0 && explicitSource && !destinationOnly && !sourceMatch) return 'conflict';
  return sourceMatch ? 'match' : 'unknown';
}

function matches(row, award, { systemId, components }) {
  if (!row || !award) return false;
  if ([row, award].some((entry) => !scoped(entry, systemId) || !compatiblePhysicalActor(entry)))
    return false;
  const sameComponent = named(row.componentId) && named(award.componentId);
  if (sameComponent && row.componentId !== award.componentId) return false;
  const source = sourceMatchFor(row, award, components);
  if (source === 'conflict') return false;
  if (named(award.resultRowId)) return row.resultRowId === award.resultRowId;
  return (sameComponent && named(systemId)) || source === 'match';
}

function selectedRows(result, rows) {
  if (!Array.isArray(result.items)) return rows.filter((row) => row?.dropped === true);
  return rows.filter(
    (row) =>
      row?.dropped !== false &&
      result.items.some((selected) => {
        if (named(row.resultRowId)) return selected?.resultRowId === row.resultRowId;
        return named(row.id) && selected?.id === row.id;
      })
  );
}

function actualQuantity(row, selected, receipts, awards, selectionRecorded) {
  if (!Array.isArray(awards)) return null;
  if (row.dropped === false) return 0;
  if (!selected.includes(row)) return selectionRecorded ? 0 : null;
  if (receipts.length === 0) return awards.length === 0 ? 0 : null;
  const values = receipts.map((receipt) => number(receipt.quantity));
  return values.some((value) => value === null || value < 0)
    ? null
    : values.reduce((sum, value) => sum + value, 0);
}

function consistentMetadata(row, receipts, field) {
  if (named(row[field])) return row[field];
  const values = new Set(receipts.map((receipt) => receipt[field]).filter(named));
  return values.size === 1 ? [...values][0] : null;
}

/** Inputs are already entitled; output indexes identify each receipt exactly once. */
export function gatheringHistoryEvidence({
  result = {},
  awards = null,
  systemId = null,
  components = [],
} = {}) {
  const rows = Array.isArray(result.itemRows) ? result.itemRows : list(result.items);
  const selected = selectedRows(result, rows);
  const matchesByRow = new Map(rows.map((row) => [row, []]));
  const unassigned = [];
  for (const [index, award] of list(awards).entries()) {
    const candidates = selected.filter((row) => matches(row, award, { systemId, components }));
    if (candidates.length === 1) matchesByRow.get(candidates[0]).push(index);
    else unassigned.push(index);
  }
  const entries = rows.map((row, index) => {
    const indexes = matchesByRow.get(row);
    const receipts = indexes.map((receiptIndex) => awards[receiptIndex]);
    const qty = actualQuantity(row, selected, receipts, awards, Array.isArray(result.items));
    if (qty === null) unassigned.push(...indexes);
    return {
      ...structuredClone(row),
      id: row.resultRowId || row.id || `drop-${index + 1}`,
      name: consistentMetadata(row, receipts, 'name'),
      img: consistentMetadata(row, receipts, 'img'),
      chance: number(row.finalDropRate),
      rawRoll: number(row.roll),
      effectiveRoll: number(row.effectiveRoll),
      threshold: number(row.threshold),
      cleared: typeof row.dropped === 'boolean' ? row.dropped : null,
      qty,
    };
  });
  const roll =
    [result.value, result.roll, result.data?.total].map(number).find((value) => value !== null) ??
    null;
  let rollModel = 'unknown';
  if (roll !== null) rollModel = 'shared';
  else if (entries.some((row) => row.rawRoll !== null || row.effectiveRoll !== null))
    rollModel = 'perRow';
  return { entries, roll, rollModel, unattributedAwardIndexes: unassigned.sort((a, b) => a - b) };
}
