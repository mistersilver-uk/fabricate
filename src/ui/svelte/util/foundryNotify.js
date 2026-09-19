export function notifyInfo(msg) {
  globalThis.ui?.notifications?.info(msg);
}

export function notifyWarn(msg) {
  globalThis.ui?.notifications?.warn(msg);
}

export function notifyError(msg) {
  globalThis.ui?.notifications?.error(msg);
}
