/**
 * Repo-root module entry for local Foundry development.
 *
 * When Fabricate is served through the Vite proxy on :5173, load the source
 * entry so HMR can transform the module graph. For direct Foundry loads or
 * release-like local testing, fall back to the built bundle in dist/.
 */

const VITE_DEV_SERVER_PORT = '5173';
const isViteDevServer = globalThis.location?.port === VITE_DEV_SERVER_PORT;
const entryPath = isViteDevServer ? './src/main.js' : './dist/main.js';

try {
  await import(entryPath);
} catch (error) {
  const hint = isViteDevServer
    ? 'Ensure `npm run dev` is running and open Foundry through http://localhost:5173.'
    : 'Run `npm run build` for direct Foundry loads, or use the Vite dev server for HMR.';
  console.error(`Fabricate | Failed to load ${entryPath}. ${hint}`, error);
  throw error;
}
