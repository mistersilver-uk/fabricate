/**
 * THE LIVE SUBJECT — one boot of the real app, driven the same way by both passes.
 *
 * ## Why this exists, stated as the defect it removes
 *
 * `compare.mjs` used to render a hand-authored MARKUP FIXTURE and measure that. A fixture is a
 * mirror of what its author believed the app renders, and a mirror does not fail — it DRIFTS.
 * The drift that paid for this module was not a stale class or a missing wrapper: the `roll`
 * screen's fixture modelled `SimpleCraftingCheckEditor`'s static-DC card, which was never
 * broken, and never touched `CraftingCheckEditor`'s routed tier list at all. When the routed
 * list shipped in the bare `.manager-inspector-card` shell — 12px of padding the studio card
 * contract exists to strip, insetting every tier row past the Difficulty card above it — the
 * comparison reported no drift, because it could not be wrong about a component it did not
 * model.
 *
 * `inventory.mjs` already pointed at the real app for the same reason, one level up: a
 * structural pass run against a mirror can only report what its author already knew was
 * missing. So both passes now share ONE live subject rather than one of them owning a second
 * implementation that is free to diverge.
 *
 * ## What a spec still owns
 *
 * `subject.open(browser)` boots whatever renders the shipped components (in this repository,
 * the View Lab — see `view-lab.js`) and `subject.navigate(page, screen)` drives it to a
 * screen, including into whatever STATE the screen must be in to draw the thing being
 * measured. An empty list cannot show a row treatment, so reaching the populated state is part
 * of navigating, exactly as it is for a View Lab case.
 */

/**
 * The subject half of a spec, checked before either pass acts on it.
 *
 * The retired-mirror check is deliberate rather than tidy: a spec still carrying `screens`
 * markup or `stylesheets` would have those silently ignored, and would read as though it were
 * still measuring the thing its author wrote by hand.
 *
 * @param {object} spec Loaded spec module.
 * @returns {string[]} Problems, empty when the subject is usable.
 */
export function subjectProblems(spec) {
  const subject = spec?.subject;
  if (!subject)
    return ['spec.subject is missing: there is nothing to measure the prototype against'];
  const problems = [];
  if (typeof subject.open !== 'function') {
    problems.push(
      'spec.subject.open(browser) must be a function returning `{ page, dispose }`: both ' +
        'passes measure the REAL app, so a spec has to say how to boot it'
    );
  }
  if (typeof subject.navigate !== 'function') {
    problems.push(
      'spec.subject.navigate(page, screen) must be a function: a screen the run cannot reach ' +
        'is a screen it cannot measure'
    );
  }
  for (const retired of ['screens', 'stylesheets']) {
    if (subject[retired]) {
      problems.push(
        `spec.subject.${retired} is the RETIRED markup mirror: both passes measure the real ` +
          'app now, so this is ignored rather than honoured — delete it'
      );
    }
  }
  return problems;
}

/**
 * Boot the subject once and expose a memoised per-screen navigation.
 *
 * Memoised because both passes visit a screen more than once — regions measured on a shared
 * screen, a root walked per screen — and a repeated navigation is a repeated chance to land
 * somewhere else. The screen a session is showing is the screen it was last asked for.
 *
 * @param {object} browser Playwright browser.
 * @param {object} spec Loaded spec module.
 * @returns {Promise<{page: object, show: (screen: string) => Promise<object>, dispose: () => Promise<void>}>} Session.
 */
export async function openLiveSubject(browser, spec) {
  const session = await spec.subject.open(browser);
  if (!session?.page) throw new Error('spec.subject.open resolved without a page');
  let showing = null;
  return {
    page: session.page,
    async show(screen) {
      if (showing !== screen) {
        await spec.subject.navigate(session.page, screen);
        showing = screen;
      }
      return session.page;
    },
    async dispose() {
      if (session.dispose) await session.dispose();
    },
  };
}
