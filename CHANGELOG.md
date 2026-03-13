# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Module Configuration bounded context in DOMAIN.md: explicit boundary statement, full settings tables by scope, and cross-context note for `chatOutput`. (#117)
- `Module Setting` entry added to DOMAIN.md Ubiquitous Language, distinguishing module-level settings from crafting system features. (#117)
- `spec/010-module-settings.md`: canonical list of all module settings, `chatOutput` detail (default `true`, client-scoped), and the authoring pattern for future settings. (#117)
- `spec/001` Settings section updated to enumerate all world- and client-scoped settings including `chatOutput`. (#117)
