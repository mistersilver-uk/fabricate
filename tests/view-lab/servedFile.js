/**
 * Opens a file a View Lab static mount serves. The lab config imports it by URL rather than
 * bundling it, so the stylesheet read guard sees this module on the stack (issue 1711).
 */
import { createReadStream } from 'node:fs';

export const openServedFile = (target) => createReadStream(target);
