/**
 * A second Foundry client joined as a named user beside the GM page. It is made cheap enough for a
 * 2-vCPU runner: no canvas, no join page, and a context that is closed on every failure path.
 */

// Foundry warns, as a console error, on any screen under 1366x768; this matches the GM page.
export const JOINED_CLIENT_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });

/** A cold client parses Foundry and every module uncached while the GM page shares the CPU. */
export const JOINED_CLIENT_TIMEOUTS = Object.freeze({ navigation: 120_000, ready: 180_000 });

/**
 * Foundry reads the client-scoped `core.noCanvas` setting from `localStorage` as JSON before it
 * initializes the canvas, so writing it ahead of the first page keeps WebGL and scene assets off.
 */
export function disableCanvasBeforeLoad(storage = globalThis.localStorage) {
  storage.setItem('core.noCanvas', 'true');
}

/**
 * Join `userLabel` the way Foundry's join form does: the `/join` GET for a session cookie, then
 * its JSON POST. The client then loads once, straight into `/game`, and never runs the join page
 * whose delayed redirect could destroy an evaluation mid-flight.
 */
async function postJoin(request, origin, userId, timeout) {
  const join = new URL('/join', origin).href;
  await request.get(join, { timeout });
  const response = await request.post(join, {
    data: { userid: userId, password: '', action: 'join' },
    timeout,
  });
  if (!response.ok()) {
    throw new Error(`joining answered ${response.status()}: ${await response.text()}`);
  }
  const { redirect } = await response.json();
  return new URL(redirect || '/game', origin).href;
}

/**
 * Open a client joined as `userLabel` with Fabricate ready. `prepareContext` and `preparePage` add
 * the caller's init scripts and listeners; the context is closed before any failure propagates.
 * Answers `{ context, clientPage }`.
 */
export async function openJoinedClient(
  page,
  userLabel,
  {
    prepareContext = async () => {},
    preparePage = () => {},
    timeouts = JOINED_CLIENT_TIMEOUTS,
  } = {}
) {
  const userId = await page.evaluate(
    (name) => game.users.find((user) => user.name === name)?.id ?? null,
    userLabel
  );
  if (!userId) throw new Error(`no user is named "${userLabel}"`);
  const origin = new URL(page.url()).origin;
  const context = await page.context().browser().newContext({ viewport: JOINED_CLIENT_VIEWPORT });
  try {
    await context.addInitScript(disableCanvasBeforeLoad);
    await prepareContext(context);
    const clientPage = await context.newPage();
    preparePage(clientPage);
    const gameUrl = await postJoin(context.request, origin, userId, timeouts.navigation);
    await clientPage.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: timeouts.navigation });
    await clientPage.waitForFunction(
      (id) => {
        const { game } = globalThis;
        return game?.ready === true && game.user?.id === id && Boolean(game.fabricate);
      },
      userId,
      { timeout: timeouts.ready }
    );
    return { context, clientPage };
  } catch (error) {
    await context.close().catch(() => {});
    throw new Error(`the "${userLabel}" client never joined: ${error.message}`, { cause: error });
  }
}

/**
 * Resolve once the GM page is foreground and answering again: a joined page took the foreground,
 * and Chromium runs no animation frame for a background page, so it is brought back first. The
 * probe is a task round trip, not a frame, and it also requires the game to be ready and its
 * socket connected, which is what a starved or dropped GM page would fail.
 */
export async function awaitPageResponsive(page, timeout = 30_000) {
  let timer;
  const expiry = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the GM page did not answer in ${timeout}ms`)),
      timeout
    );
  });
  const answered = (async () => {
    await page.bringToFront();
    return await page.evaluate(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            const { game } = globalThis;
            resolve({ ready: game?.ready === true, connected: game?.socket?.connected === true });
          }, 0);
        })
    );
  })();
  answered.catch(() => {});
  const state = await Promise.race([answered, expiry]).finally(() => clearTimeout(timer));
  if (!state.ready || !state.connected) {
    throw new Error(`the GM page answered but is not playable: ${JSON.stringify(state)}`);
  }
}
