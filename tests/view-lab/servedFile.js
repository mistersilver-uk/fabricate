/** Opens a file a View Lab static mount serves. */
import { createReadStream } from 'node:fs';

export const openServedFile = (target) => createReadStream(target);
