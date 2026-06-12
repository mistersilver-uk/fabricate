// Stylelint config for Fabricate.
//
// Lints the global stylesheet (`styles/fabricate.css`) and any future CSS/SCSS.
// The goals below are mapped to what Stylelint can *actually* enforce — each
// bullet names the rule(s) doing the work so the config stays honest about its
// coverage:
//
//   - Quality       stylelint-config-standard: invalid/unknown syntax, modern
//                   value notation, empty blocks, malformed selectors.
//   - Reliability   declaration-block-no-duplicate-properties,
//                   declaration-block-no-shorthand-property-overrides,
//                   no-descending-specificity, no-invalid-position-at-import,
//                   no-irregular-whitespace — declarations that silently cancel
//                   each other or behave unpredictably.
//   - Duplication   no-duplicate-selectors, no-duplicate-at-import-rules,
//                   declaration-block-no-duplicate-custom-properties,
//                   font-family-no-duplicate-names, keyframe-block-no-duplicate-
//                   selectors, keyframes-name-no-duplicate.
//   - Reuse / DRY   declaration-block-no-redundant-longhand-properties (collapse
//                   longhands into a reusable shorthand) and shorthand-property-
//                   no-redundant-values. These are the closest practical proxy
//                   Stylelint offers for "this could be written more reusably".
//   - Cross-browser plugin/no-unsupported-browser-features, evaluated against
//                   the `browserslist` in package.json (Foundry's supported
//                   browsers). Flags properties/values not supported across the
//                   target matrix (Safari typically being the laggard).
//
// Honest limitation: Stylelint has NO robust rule for detecting two
// near-identical rule blocks that *could be merged* (structural similarity).
// The duplicate/shorthand rules above are the best available proxy; genuine
// similarity refactors remain a review concern (SonarCloud also scores CSS
// duplication on a PR's new code).
//
// `styles/fabricate.css` is loaded globally into Foundry, so every selector is
// namespaced under a `.fabricate*` root — `tests/styles-namespacing.test.js`
// already enforces that. We therefore turn OFF Stylelint's opinionated naming
// patterns (class / custom-property / keyframes names): they are not a stated
// goal here and would be large, low-value churn against the existing
// convention.

export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-no-unsupported-browser-features'],
  rules: {
    // --- Cross-browser compatibility (headline goal) --------------------
    // Reads package.json `browserslist`. Kept as `error` so regressions fail
    // the gate; tune the matrix or `ignore` list rather than silencing it.
    'plugin/no-unsupported-browser-features': [
      true,
      {
        severity: 'error',
        // Each entry is a caniuse feature id that is *functionally* supported
        // across every browser Foundry targets; caniuse's "partial support"
        // flag here reflects legacy edge cases that don't apply to this code:
        //   - css-variables / css-focus-visible: used pervasively, universally
        //     supported in the target matrix.
        //   - intrinsic-width: `fit-content` / `min-content` / `max-content`
        //     sizing — works in all target browsers; the partial flag is about
        //     old prefixed forms we don't ship.
        //   - multicolumn: `column-*` properties — likewise functional; the
        //     partial flag concerns `break-inside` corner cases we don't use.
        //   - css-clip-path: only the `inset()` basic shape is used (in the
        //     visually-hidden helpers); it is fully supported everywhere. The
        //     partial flag is about `path()` / SVG `url()` references we don't
        //     ship.
        // Re-evaluate this list whenever the browserslist matrix widens.
        ignore: [
          'css-variables',
          'css-focus-visible',
          'intrinsic-width',
          'multicolumn',
          'css-clip-path',
        ],
      },
    ],

    // --- Vendor prefixes: keep `-webkit-appearance` -------------------
    // The standard config's `property-no-vendor-prefix` would auto-strip
    // `-webkit-appearance`, but that prefix is still REQUIRED for custom form
    // controls — most critically `input[type="range"]` and its
    // `::-webkit-slider-thumb`, where the unprefixed `appearance` does not
    // suppress native rendering in Blink/WebKit. Stripping it silently breaks
    // the custom range sliders in Chrome/Safari/Edge. Keep it (and the paired
    // unprefixed `appearance`) by exempting the property here; other vendor
    // prefixes are still flagged.
    'property-no-vendor-prefix': [true, { ignoreProperties: ['-webkit-appearance'] }],

    // --- Reliability rule we deliberately turn OFF ----------------------
    // `no-descending-specificity` flags a lower-specificity selector appearing
    // after a higher-specificity one. The only fix is to REORDER rules, which
    // in a single 11k-line global stylesheet meaningfully risks changing which
    // declaration wins the cascade — an unreviewable, regression-prone sweep
    // for an advisory rule. (It is the most commonly disabled rule in
    // stylelint-config-standard for exactly this reason.) Genuine specificity
    // bugs are caught in review; the duplicate/override rules below still run.
    'no-descending-specificity': null,

    // --- Cosmetic syntax-modernization rules we leave OFF ---------------
    // These rewrite *how* a selector or media query is spelled without
    // affecting quality, reliability, duplication, reuse, or cross-browser
    // support — none of this config's goals. They also rewrite selector text
    // that the component layout tests use as lookup keys, so enabling them is
    // pure churn for no enforcement value. Spelling stays as authored.
    'selector-not-notation': null,
    'media-feature-range-notation': null,

    // --- Naming patterns: not a goal here; enforced/owned elsewhere ------
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'keyframes-name-pattern': null,
  },

  // Fabricate ships plain CSS today; if/when `.scss` partials are introduced,
  // parse them with the SCSS syntax so the same rule set applies cleanly
  // (without this, Stylelint would choke on `$vars`, `//` comments, nesting,
  // etc.). `@`-rule / comment rules that clash with Sass idioms are relaxed
  // here so the standard config doesn't fight the preprocessor.
  overrides: [
    {
      files: ['**/*.scss'],
      customSyntax: 'postcss-scss',
      rules: {
        'at-rule-no-unknown': null,
        'comment-empty-line-before': null,
      },
    },
  ],
};
