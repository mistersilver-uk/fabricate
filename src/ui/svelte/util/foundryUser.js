// `isGM`, not `activeGM`: it answers "may this client see and drive a GM surface", a single-client
// question with no duplicate-execution risk, so an assistant GM answers true. NOT authorization.
export function isGameMaster() {
  return globalThis.game?.user?.isGM === true;
}
