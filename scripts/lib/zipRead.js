/**
 * Minimal random-access ZIP reader (issue: full-window View Lab).
 *
 * The View Lab harvests Foundry's window chrome out of the release archive that
 * `scripts/foundry-test-up.mjs` already caches under `.foundry-e2e/cache/`. That archive is
 * ~156 MB and we want four or five members out of ~21 000, so the reader has to be
 * random-access: parse the central directory, then inflate only the members asked for.
 *
 * Why not something else:
 * - `unzip` is absent on stock Windows.
 * - PowerShell `Expand-Archive` cannot extract selected members without expanding the whole
 *   archive to disk.
 * - A `yauzl`/`adm-zip` dependency is not worth adding to read a file we already have.
 *
 * Scope: stored (method 0) and deflate (method 8) members, with ZIP64 end-of-central-directory
 * and ZIP64 extra-field overrides. Encryption, split archives, and the other compression
 * methods are not supported and throw rather than returning wrong bytes.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const SIG_EOCD = 0x06_05_4b_50;
const SIG_EOCD64 = 0x06_06_4b_50;
const SIG_EOCD64_LOCATOR = 0x07_06_4b_50;
const SIG_CENTRAL = 0x02_01_4b_50;
const SIG_LOCAL = 0x04_03_4b_50;

const EOCD_MIN_SIZE = 22;
// The EOCD may be followed by an archive comment of up to 0xFFFF bytes, so the signature can
// sit at most 64 KiB + the record itself from the end of the file.
const EOCD_SEARCH_WINDOW = 0xff_ff + EOCD_MIN_SIZE;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const ZIP64_MARKER_32 = 0xff_ff_ff_ff;
const ZIP64_MARKER_16 = 0xff_ff;

function readChunk(fd, position, length) {
  const buffer = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const bytes = readSync(fd, buffer, read, length - read, position + read);
    if (bytes === 0) break;
    read += bytes;
  }
  if (read !== length) {
    throw new Error(`zipRead: short read at offset ${position} (wanted ${length}, got ${read})`);
  }
  return buffer;
}

/**
 * A UInt64 read that refuses to silently truncate. Zip64 sizes are 8 bytes; Node's Buffer
 * gives us a BigInt, and anything past Number.MAX_SAFE_INTEGER cannot be a Buffer length
 * anyway — so throwing here is strictly better than handing back a rounded offset.
 */
function readUInt64(buffer, offset) {
  const value = buffer.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`zipRead: 64-bit value at ${offset} exceeds the safe integer range`);
  }
  return Number(value);
}

function findEndOfCentralDirectory(fd, fileSize) {
  const windowSize = Math.min(fileSize, EOCD_SEARCH_WINDOW);
  const windowStart = fileSize - windowSize;
  const window = readChunk(fd, windowStart, windowSize);
  for (let i = window.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (window.readUInt32LE(i) !== SIG_EOCD) continue;
    return {
      buffer: window,
      offsetInWindow: i,
      absoluteOffset: windowStart + i,
      window,
      windowStart,
    };
  }
  throw new Error('zipRead: end-of-central-directory record not found (not a zip file?)');
}

function readCentralDirectoryLocation(fd, fileSize) {
  const eocd = findEndOfCentralDirectory(fd, fileSize);
  const { window, offsetInWindow } = eocd;
  let entryCount = window.readUInt16LE(offsetInWindow + 10);
  let directorySize = window.readUInt32LE(offsetInWindow + 12);
  let directoryOffset = window.readUInt32LE(offsetInWindow + 16);

  const needsZip64 =
    entryCount === ZIP64_MARKER_16 ||
    directorySize === ZIP64_MARKER_32 ||
    directoryOffset === ZIP64_MARKER_32;
  if (!needsZip64) return { entryCount, directorySize, directoryOffset };

  // ZIP64: the locator sits immediately before the EOCD and points at the ZIP64 EOCD record.
  const locatorOffset = eocd.absoluteOffset - 20;
  if (locatorOffset < 0) throw new Error('zipRead: zip64 markers present but no zip64 locator');
  const locator = readChunk(fd, locatorOffset, 20);
  if (locator.readUInt32LE(0) !== SIG_EOCD64_LOCATOR) {
    throw new Error('zipRead: zip64 end-of-central-directory locator signature mismatch');
  }
  const zip64Offset = readUInt64(locator, 8);
  const zip64 = readChunk(fd, zip64Offset, 56);
  if (zip64.readUInt32LE(0) !== SIG_EOCD64) {
    throw new Error('zipRead: zip64 end-of-central-directory signature mismatch');
  }
  entryCount = readUInt64(zip64, 32);
  directorySize = readUInt64(zip64, 40);
  directoryOffset = readUInt64(zip64, 48);
  return { entryCount, directorySize, directoryOffset };
}

/**
 * Apply the ZIP64 extended-information extra field (header id 0x0001), which carries the real
 * sizes and local-header offset whenever the 32-bit fields are saturated. The fields appear in
 * a fixed order but ONLY for those that were saturated, so the cursor advances conditionally.
 */
function applyZip64Extra(entry, extra) {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const headerId = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const body = extra.subarray(cursor + 4, cursor + 4 + size);
    cursor += 4 + size;
    if (headerId !== 0x00_01) continue;
    let bodyCursor = 0;
    if (entry.uncompressedSize === ZIP64_MARKER_32 && bodyCursor + 8 <= body.length) {
      entry.uncompressedSize = readUInt64(body, bodyCursor);
      bodyCursor += 8;
    }
    if (entry.compressedSize === ZIP64_MARKER_32 && bodyCursor + 8 <= body.length) {
      entry.compressedSize = readUInt64(body, bodyCursor);
      bodyCursor += 8;
    }
    if (entry.localHeaderOffset === ZIP64_MARKER_32 && bodyCursor + 8 <= body.length) {
      entry.localHeaderOffset = readUInt64(body, bodyCursor);
    }
    return;
  }
}

function parseCentralDirectory(directory) {
  const entries = [];
  let cursor = 0;
  while (cursor + 46 <= directory.length) {
    if (directory.readUInt32LE(cursor) !== SIG_CENTRAL) break;
    const flags = directory.readUInt16LE(cursor + 8);
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const entry = {
      name: directory.toString('utf8', cursor + 46, cursor + 46 + nameLength),
      method: directory.readUInt16LE(cursor + 10),
      compressedSize: directory.readUInt32LE(cursor + 20),
      uncompressedSize: directory.readUInt32LE(cursor + 24),
      localHeaderOffset: directory.readUInt32LE(cursor + 42),
      encrypted: (flags & 0x00_01) !== 0,
    };
    const extraStart = cursor + 46 + nameLength;
    if (extraLength)
      applyZip64Extra(entry, directory.subarray(extraStart, extraStart + extraLength));
    // Directory members are recorded like any other entry but carry no data.
    if (!entry.name.endsWith('/')) entries.push(entry);
    cursor = extraStart + extraLength + commentLength;
  }
  return entries;
}

function withArchive(zipPath, run) {
  const fd = openSync(zipPath, 'r');
  try {
    return run(fd, statSync(zipPath).size);
  } finally {
    closeSync(fd);
  }
}

/**
 * List every non-directory member of the archive.
 *
 * @param {string} zipPath Absolute path to the archive.
 * @returns {Array<{name: string, method: number, compressedSize: number, uncompressedSize: number}>}
 */
export function listEntries(zipPath) {
  return withArchive(zipPath, (fd, fileSize) => {
    const { directorySize, directoryOffset } = readCentralDirectoryLocation(fd, fileSize);
    return parseCentralDirectory(readChunk(fd, directoryOffset, directorySize));
  });
}

function inflateEntry(fd, entry) {
  if (entry.encrypted) throw new Error(`zipRead: ${entry.name} is encrypted; not supported`);
  // The central directory's name/extra lengths are NOT authoritative for the local header —
  // writers routinely emit a different extra field there — so re-read them from the local
  // header to find where the data actually starts.
  const local = readChunk(fd, entry.localHeaderOffset, 30);
  if (local.readUInt32LE(0) !== SIG_LOCAL) {
    throw new Error(`zipRead: local header signature mismatch for ${entry.name}`);
  }
  const dataOffset = entry.localHeaderOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  const raw = readChunk(fd, dataOffset, entry.compressedSize);
  if (entry.method === METHOD_STORE) return raw;
  if (entry.method === METHOD_DEFLATE) return inflateRawSync(raw);
  throw new Error(`zipRead: ${entry.name} uses unsupported compression method ${entry.method}`);
}

/**
 * Read one member by exact name.
 *
 * @param {string} zipPath Absolute path to the archive.
 * @param {string} entryName Archive-relative member name, forward slashes.
 * @returns {Buffer} The inflated bytes.
 */
export function readEntry(zipPath, entryName) {
  return withArchive(zipPath, (fd, fileSize) => {
    const { directorySize, directoryOffset } = readCentralDirectoryLocation(fd, fileSize);
    const entries = parseCentralDirectory(readChunk(fd, directoryOffset, directorySize));
    const entry = entries.find((candidate) => candidate.name === entryName);
    if (!entry) throw new Error(`zipRead: ${entryName} not found in ${zipPath}`);
    return inflateEntry(fd, entry);
  });
}

/**
 * Read many members in one pass over the central directory. Reading N members with
 * {@link readEntry} would re-parse ~21 000 central-directory records N times; the harvest
 * pulls hundreds of assets, so it uses this instead.
 *
 * @param {string} zipPath Absolute path to the archive.
 * @param {(name: string) => boolean} predicate Selects members by archive-relative name.
 * @returns {Map<string, Buffer>} Inflated bytes keyed by member name.
 */
export function readEntries(zipPath, predicate) {
  return withArchive(zipPath, (fd, fileSize) => {
    const { directorySize, directoryOffset } = readCentralDirectoryLocation(fd, fileSize);
    const entries = parseCentralDirectory(readChunk(fd, directoryOffset, directorySize));
    const selected = new Map();
    for (const entry of entries) {
      if (!predicate(entry.name)) continue;
      selected.set(entry.name, inflateEntry(fd, entry));
    }
    return selected;
  });
}
