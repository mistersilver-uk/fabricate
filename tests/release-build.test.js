import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { rewriteModuleJson, getRequiredFiles, validateDist } = await import('../scripts/release.js');

// ───────────────────────────────────────────────────────────────────────────
// rewriteModuleJson() tests
// ───────────────────────────────────────────────────────────────────────────

test('rewriteModuleJson strips dist/ prefix from esmodules', () => {
  const manifest = {
    id: 'fabricate',
    esmodules: ['dist/main.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, ['main.js']);
});

test('rewriteModuleJson strips dist/ prefix from multiple esmodules', () => {
  const manifest = {
    esmodules: ['dist/main.js', 'dist/vendor.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, ['main.js', 'vendor.js']);
});

test('rewriteModuleJson leaves esmodules without dist/ prefix unchanged', () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, ['main.js']);
});

test('rewriteModuleJson preserves styles paths unchanged', () => {
  const manifest = {
    esmodules: [],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.styles, ['styles/fabricate.css']);
});

test('rewriteModuleJson preserves languages paths unchanged', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [{ lang: 'en', name: 'English', path: 'lang/en.json' }],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.languages[0].path, 'lang/en.json');
});

test('rewriteModuleJson normalizes legacy .db pack paths', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [
      { name: 'alchemists-supplies', path: 'packs/alchemists-supplies-v16.db', type: 'Item' }
    ]
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.packs[0].path, 'packs/alchemists-supplies-v16');
});

test('rewriteModuleJson leaves pack paths without .db suffix unchanged', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [
      { name: 'test-pack', path: 'packs/test-pack', type: 'Item' }
    ]
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.packs[0].path, 'packs/test-pack');
});

test('rewriteModuleJson preserves non-path fields on packs', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [
      { name: 'alchemists-supplies', label: "Alchemist's Supplies", path: 'packs/alchemists-supplies-v16.db', type: 'Item', system: 'dnd5e' }
    ]
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.packs[0].name, 'alchemists-supplies');
  assert.equal(result.packs[0].label, "Alchemist's Supplies");
  assert.equal(result.packs[0].type, 'Item');
  assert.equal(result.packs[0].system, 'dnd5e');
});

test('rewriteModuleJson preserves non-path top-level fields', () => {
  const manifest = {
    id: 'fabricate',
    title: 'Fabricate',
    version: '0.1.0',
    esmodules: ['dist/main.js'],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: [],
    url: 'https://example.com',
    manifest: 'https://example.com/module.json',
    download: 'https://example.com/module.zip'
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.id, 'fabricate');
  assert.equal(result.title, 'Fabricate');
  assert.equal(result.version, '0.1.0');
  assert.equal(result.url, 'https://example.com');
});

test('rewriteModuleJson does not mutate the original manifest', () => {
  const manifest = {
    esmodules: ['dist/main.js'],
    styles: [],
    languages: [],
    packs: [{ name: 'test', path: 'packs/test.db', type: 'Item' }]
  };
  rewriteModuleJson(manifest);
  assert.equal(manifest.esmodules[0], 'dist/main.js');
  assert.equal(manifest.packs[0].path, 'packs/test.db');
});

test('rewriteModuleJson handles missing optional fields gracefully', () => {
  const manifest = { id: 'fabricate', version: '1.0.0' };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, []);
  assert.deepEqual(result.styles, []);
  assert.deepEqual(result.languages, []);
  assert.deepEqual(result.packs, []);
  assert.equal(result.id, 'fabricate');
});

// ───────────────────────────────────────────────────────────────────────────
// getRequiredFiles() tests
// ───────────────────────────────────────────────────────────────────────────

test('getRequiredFiles returns esmodule paths', () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('main.js'), 'should include main.js');
});

test('getRequiredFiles returns styles paths', () => {
  const manifest = {
    esmodules: [],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('styles/fabricate.css'), 'should include styles path');
});

test('getRequiredFiles returns language paths', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [{ lang: 'en', name: 'English', path: 'lang/en.json' }],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('lang/en.json'), 'should include language path');
});

test('getRequiredFiles includes module.json itself', () => {
  const manifest = { esmodules: [], styles: [], languages: [], packs: [] };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('module.json'), 'should include module.json');
});

test('getRequiredFiles returns all entries from full manifest', () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [{ path: 'lang/en.json' }],
    packs: [{ path: 'packs/alchemists-supplies-v16' }]
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('main.js'));
  assert.ok(files.includes('styles/fabricate.css'));
  assert.ok(files.includes('lang/en.json'));
  assert.ok(files.includes('packs/alchemists-supplies-v16'));
  assert.ok(files.includes('module.json'));
});

test('getRequiredFiles returns pack paths', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [{ path: 'packs/alchemists-supplies-v16' }]
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('packs/alchemists-supplies-v16'), 'should include pack path');
});

test('getRequiredFiles handles multiple esmodules', () => {
  const manifest = {
    esmodules: ['main.js', 'vendor.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('main.js'));
  assert.ok(files.includes('vendor.js'));
});

// ───────────────────────────────────────────────────────────────────────────
// validateDist() tests
// ───────────────────────────────────────────────────────────────────────────

async function makeTempDist(files, moduleJson) {
  const dir = await mkdtemp(join(tmpdir(), 'fabricate-dist-'));

  for (const file of files) {
    const fullPath = join(dir, file);
    const dirPath = join(fullPath, '..');
    await mkdir(dirPath, { recursive: true });
    await writeFile(fullPath, 'placeholder');
  }

  if (moduleJson !== undefined) {
    await writeFile(join(dir, 'module.json'), JSON.stringify(moduleJson));
  }

  return dir;
}

test('validateDist returns success when all required files are present', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [{ path: 'lang/en.json' }],
    packs: [{ path: 'packs/alchemists-supplies-v16' }]
  };
  const distManifest = { ...manifest, id: 'fabricate', version: '0.1.0' };
  const dir = await makeTempDist(['main.js', 'styles/fabricate.css', 'lang/en.json', 'packs/alchemists-supplies-v16/CURRENT'], distManifest);
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, true);
    assert.equal(result.missing.length, 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when a pack path is missing', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: [],
    languages: [],
    packs: [{ path: 'packs/alchemists-supplies-v16' }]
  };
  const distManifest = { ...manifest, id: 'fabricate', version: '0.1.0' };
  const dir = await makeTempDist(['main.js'], distManifest);
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(f => f.includes('alchemists-supplies-v16')), `Expected missing to include pack path, got: ${result.missing}`);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when a required file is missing', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: []
  };
  // Only create main.js, not fabricate.css
  const distManifest = { ...manifest, id: 'fabricate', version: '0.1.0' };
  const dir = await makeTempDist(['main.js'], distManifest);
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(f => f.includes('fabricate.css')), `Expected missing to include fabricate.css, got: ${result.missing}`);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when module.json is missing', async () => {
  const manifest = { esmodules: ['main.js'], styles: [], languages: [], packs: [] };
  const dir = await makeTempDist(['main.js']);
  // No module.json written
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(f => f.includes('module.json')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when module.json is invalid JSON', async () => {
  const manifest = { esmodules: ['main.js'], styles: [], languages: [], packs: [] };
  const dir = await makeTempDist(['main.js']);
  await writeFile(join(dir, 'module.json'), 'not valid json {{{');
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.toLowerCase().includes('module.json')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when multiple files are missing', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [{ path: 'lang/en.json' }],
    packs: []
  };
  const distManifest = { id: 'fabricate' };
  const dir = await makeTempDist([], distManifest); // nothing in dist
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.length >= 3);
  } finally {
    await rm(dir, { recursive: true });
  }
});
