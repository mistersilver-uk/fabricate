# Design: Adopt OpenSpec And Shared Skills

## Decisions

1. Canonical specs move to `openspec/specs/*/spec.md`.
2. Legacy `spec/*.md` files remain as compatibility symlinks.
3. Root `PLAN.md` becomes a deprecation notice instead of a live task plan.
4. Shared skills live in `skills/`.
5. `.codex/skills`, `.claude/skills`, and `.opencode/skill` point to `skills/`.
6. Provider-specific OpenAI metadata stays inside each skill via `agents/openai.yaml`.

## Tradeoffs

- Compatibility symlinks preserve existing references while making the canonical location explicit.
- Keeping `PLAN.md` as a stub avoids breaking older habits immediately, but the file must stay clearly deprecated.
- Installing external skills into the repo vendors their instructions locally, which improves reproducibility but creates an update burden.

## Validation

- verify canonical spec files exist under `openspec/specs/`
- verify compatibility links exist under `spec/`
- verify provider-specific skill roots resolve to `skills/`
- verify prompts and local skills reference `openspec/` and `skills/`
