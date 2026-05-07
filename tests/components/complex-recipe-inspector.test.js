/**
 * Source-contract tests for the V2 Complex recipe inspector + companion
 * components (ComplexityChips, IngredientSetCard, StepTimeline,
 * SelectedRecipeInspector dispatcher).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return readFileSync(resolve(__dirname, '../../src/ui/svelte/apps/actor-app', rel), 'utf8');
}

const inspectorSrc = read('ComplexRecipeInspector.svelte');
const chipsSrc = read('ComplexityChips.svelte');
const ingSrc = read('IngredientSetCard.svelte');
const timelineSrc = read('StepTimeline.svelte');
const dispatcherSrc = read('SelectedRecipeInspector.svelte');

test('ComplexRecipeInspector: renders ComplexityChips, path selector, IngredientSetCard, outcome, and step timeline', () => {
  assert.ok(inspectorSrc.includes("import ComplexityChips from './ComplexityChips.svelte'"));
  assert.ok(inspectorSrc.includes("import IngredientSetCard from './IngredientSetCard.svelte'"));
  assert.ok(inspectorSrc.includes("import StepTimeline from './StepTimeline.svelte'"));
  assert.ok(inspectorSrc.includes('FABRICATE.ActorApp.CraftPlan.SelectPath'));
  assert.ok(inspectorSrc.includes('FABRICATE.ActorApp.CraftPlan.IngredientSets'));
  assert.ok(inspectorSrc.includes('FABRICATE.ActorApp.CraftPlan.OutcomeHeading'));
  assert.ok(inspectorSrc.includes('FABRICATE.ActorApp.CraftPlan.StepTimeline'));
});

test('ComplexRecipeInspector: path selector dispatches to onSelectPath', () => {
  assert.ok(inspectorSrc.includes('onSelectPath(recipe.id, next)'));
  assert.ok(inspectorSrc.includes('handlePathChange'));
});

test('ComplexRecipeInspector: hides path selector when there is only one path', () => {
  assert.ok(
    inspectorSrc.includes('recipe.craftPlan?.paths?.length > 1'),
    'must gate path selector on > 1 paths'
  );
});

test('ComplexRecipeInspector: outcome card has fixed / routed / progressive variants', () => {
  assert.ok(inspectorSrc.includes('outcome--fixed'));
  assert.ok(inspectorSrc.includes('outcome--routed'));
  assert.ok(inspectorSrc.includes('outcome--progressive'));
  assert.ok(inspectorSrc.includes('FABRICATE.ActorApp.CraftPlan.OutcomeFixed'));
  assert.ok(inspectorSrc.includes('FABRICATE.ActorApp.CraftPlan.OutcomeRouted'));
  assert.ok(inspectorSrc.includes('FABRICATE.ActorApp.CraftPlan.OutcomeProgressive'));
});

test('ComplexRecipeInspector: scoped CSS uses --fab-* tokens, no legacy --fabricate-*', () => {
  const styleMatch = inspectorSrc.match(/<style>([\s\S]*?)<\/style>/);
  const scoped = styleMatch[1];
  assert.ok(scoped.includes('var(--fab-accent)'));
  assert.ok(!scoped.includes('--fabricate-primary'));
});

test('ComplexityChips: renders Complex / Multi-step / N Paths / N Choice chips', () => {
  assert.ok(chipsSrc.includes('FABRICATE.ActorApp.CraftPlan.ChipComplex'));
  assert.ok(chipsSrc.includes('FABRICATE.ActorApp.CraftPlan.ChipMultiStep'));
  assert.ok(chipsSrc.includes('FABRICATE.ActorApp.CraftPlan.ChipPaths'));
  assert.ok(chipsSrc.includes('FABRICATE.ActorApp.CraftPlan.ChipChoices'));
});

test('ComplexityChips: returns empty when classification is not complex', () => {
  assert.ok(chipsSrc.includes('classification?.isComplex'));
});

test('IngredientSetCard: renders AND-grouped options with read-only source allocation', () => {
  assert.ok(ingSrc.includes('FABRICATE.ActorApp.CraftPlan.OrChooseOne'));
  assert.ok(ingSrc.includes('option.satisfied'));
  assert.ok(ingSrc.includes('option.source'));
  assert.ok(ingSrc.includes('FABRICATE.ActorApp.CraftPlan.SourceMissing'));
});

test('IngredientSetCard: shows essence and catalyst sections only when present', () => {
  assert.ok(ingSrc.includes('path.essences?.length > 0'));
  assert.ok(ingSrc.includes('path.catalysts?.length > 0'));
});

test('IngredientSetCard: source allocation is read-only display only', () => {
  // The card must not expose a re-assignment control. Confirm there is no
  // dispatch of any "reassign source" action in the source.
  assert.ok(!ingSrc.includes('onReassignSource'), 'must not expose source-reassignment hooks');
  assert.ok(!ingSrc.includes('onChangeSource'), 'must not expose source-reassignment hooks');
});

test('StepTimeline: renders completed / current / pending pills', () => {
  assert.ok(timelineSrc.includes('step-timeline__step--completed'));
  assert.ok(timelineSrc.includes('step-timeline__step--current'));
  assert.ok(timelineSrc.includes('step-timeline__step--pending') || timelineSrc.includes("step.status === 'pending'") || timelineSrc.includes('step-timeline__step--{step.status}'));
  assert.ok(timelineSrc.includes('FABRICATE.ActorApp.CraftPlan.StepCompleted'));
  assert.ok(timelineSrc.includes('FABRICATE.ActorApp.CraftPlan.StepCurrent'));
  assert.ok(timelineSrc.includes('FABRICATE.ActorApp.CraftPlan.StepPending'));
});

test('StepTimeline: marks current step with aria-current="step"', () => {
  assert.ok(timelineSrc.includes("aria-current={step.status === 'current' ? 'step' : undefined}"));
});

test('SelectedRecipeInspector: dispatches based on classification.isComplex', () => {
  assert.ok(dispatcherSrc.includes("import SimpleRecipeInspector from './SimpleRecipeInspector.svelte'"));
  assert.ok(dispatcherSrc.includes("import ComplexRecipeInspector from './ComplexRecipeInspector.svelte'"));
  assert.ok(dispatcherSrc.includes('recipe?.classification?.isComplex === true'));
  assert.ok(dispatcherSrc.includes('{#if isComplex}'));
});

test('SelectedRecipeInspector: forwards onSelectPath to ComplexRecipeInspector', () => {
  assert.ok(dispatcherSrc.includes('onSelectPath'));
});
