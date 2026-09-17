/** The live subject — one boot of the real app, driven the same way by both passes. */

/** The subject half of a spec, checked before either pass acts on it. */
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

/** Boot the subject once and expose a memoised per-screen navigation. */
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
