import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let ChanceBar;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function mountBar(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(ChanceBar, { target, props });
  flushSync();
  return target;
}

before(async () => {
  setupDOM();

  globalThis.game = {
    i18n: {
      localize: (key) => key,
      format: (key, data) => `${key}:${JSON.stringify(data)}`
    }
  };

  tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-chance-bar-'));
  symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

  const bridgeDestination = join(tempRoot, 'src/ui/svelte/util/foundryBridge.js');
  mkdirSync(dirname(bridgeDestination), { recursive: true });
  writeFileSync(bridgeDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/foundryBridge.js'), 'utf8'));

  const formatDestination = join(tempRoot, 'src/ui/svelte/util/gatheringFormat.js');
  writeFileSync(formatDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/gatheringFormat.js'), 'utf8'));

  writeCompiledSvelte('src/ui/svelte/apps/gathering/ChanceBar.svelte');

  const moduleUrl = pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/gathering/ChanceBar.svelte.js')).href;
  ({ default: ChanceBar } = await import(moduleUrl));
});

afterEach(() => {
  if (mounted) {
    unmount(mounted);
    mounted = undefined;
  }
  if (target?.parentNode) {
    target.parentNode.removeChild(target);
  }
  target = undefined;
});

after(() => {
  teardownDOM();
  delete globalThis.game;
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('ChanceBar (mounted)', () => {
  it('renders nothing when value is null', () => {
    const root = mountBar({ value: null, scale: 'success' });
    assert.equal(root.querySelector('[role="meter"]'), null);
  });

  it('renders a success meter with the success data-attribute and no tier', () => {
    const root = mountBar({ value: 1, scale: 'success' });
    const meter = root.querySelector('.chance-bar');
    assert.ok(meter, 'expected a .chance-bar root (success)');
    assert.equal(meter.getAttribute('data-gathering-success-value'), '100');
    assert.equal(meter.getAttribute('aria-valuenow'), '100');
    assert.equal(meter.getAttribute('aria-valuemin'), '0');
    assert.equal(meter.getAttribute('aria-valuemax'), '100');
    assert.equal(meter.getAttribute('data-gathering-event-value'), null);
    assert.equal(root.querySelector('.chance-bar-caption') !== null, true);
    assert.match(root.querySelector('.chance-bar-fill').getAttribute('style'), /^width: 100%;?$/);
    assert.equal(root.querySelector('.chance-bar-percent').textContent, '100%');
  });

  it('hides the caption when showCaption is false', () => {
    const root = mountBar({ value: 0.5, scale: 'success', showCaption: false });
    assert.equal(root.querySelector('.chance-bar-caption'), null);
    assert.ok(root.querySelector('.chance-bar'));
  });

  it('renders an event meter with the event data-attributes', () => {
    const root = mountBar({ value: 0.5, scale: 'event' });
    const meter = root.querySelector('.chance-bar');
    assert.ok(meter, 'expected a .chance-bar root (event)');
    assert.equal(meter.getAttribute('data-gathering-event-value'), '50');
    assert.equal(meter.getAttribute('data-gathering-success-value'), null);
    assert.equal(meter.getAttribute('aria-valuenow'), '50');
  });

  it('maps the event tier ladder to the right class and data-attribute', () => {
    const cases = [
      [0.8, 'red'],
      [0.6, 'amber'],
      [0.3, 'yellow'],
      [0.1, 'green']
    ];
    for (const [value, tier] of cases) {
      const root = mountBar({ value, scale: 'event' });
      const meter = root.querySelector('.chance-bar');
      assert.ok(meter.classList.contains(`tier-${tier}`), `value ${value} should be tier-${tier}`);
      assert.equal(meter.getAttribute('data-gathering-event-tier'), tier);
      unmount(mounted);
      mounted = undefined;
      target.parentNode.removeChild(target);
      target = undefined;
    }
  });
});
