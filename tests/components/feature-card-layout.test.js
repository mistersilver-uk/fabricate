import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../../src/ui/svelte/apps/FeatureCard.svelte');
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const componentSource = readFileSync(componentPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');

describe('FeatureCard layout contract', () => {
  it('wraps rendered child controls in a dedicated content container', () => {
    assert.match(
      componentSource,
      /\{#if enabled \|\| !showToggle\}\s*<div class="feature-card-content">\s*\{@render children\?\.\(\)\}\s*<\/div>\s*\{\/if\}/s
    );
  });

  it('keeps the header block ahead of the content container', () => {
    const headerIndex = componentSource.indexOf('<div class="feature-card-header">');
    const contentIndex = componentSource.indexOf('<div class="feature-card-content">');

    assert.notEqual(headerIndex, -1, 'feature-card header should exist');
    assert.notEqual(contentIndex, -1, 'feature-card content wrapper should exist');
    assert.ok(contentIndex > headerIndex, 'content wrapper should render after the header');
  });
});

describe('FeatureCard layout CSS', () => {
  it('defines top spacing for the shared feature-card content wrapper', () => {
    const match = css.match(/\.fabricate-admin \.feature-card-content \{[\s\S]*?\}/);
    assert.ok(match, '.feature-card-content selector should exist');
    const block = match[0];

    assert.ok(block.includes('margin-top: 10px'), 'content wrapper should separate controls from the header');
    assert.ok(block.includes('min-width: 0'), 'content wrapper should allow child layouts to shrink within the card');
  });
});
