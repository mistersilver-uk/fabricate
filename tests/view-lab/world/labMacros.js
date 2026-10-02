/**
 * The lab's Macro documents (issue 2008): one script macro a check may link to read what a
 * character can spend, never run by a frame, and one chat macro, which Fabricate refuses to run.
 */

export const LAB_MACRO_UUIDS = Object.freeze({
  readMomentum: 'Macro.lab-macro-read-momentum',
  chatMomentum: 'Macro.lab-macro-announce-momentum',
});

const LAB_MACROS = Object.freeze([
  { uuid: LAB_MACRO_UUIDS.readMomentum, name: 'Read Momentum', type: 'script' },
  { uuid: LAB_MACRO_UUIDS.chatMomentum, name: 'Announce Momentum', type: 'chat' },
]);

/** Add each lab Macro to the `fromUuid` index, shaped as a loaded core Macro document. */
export function registerLabMacros(documents) {
  for (const { uuid, name, type } of LAB_MACROS) {
    const id = uuid.slice('Macro.'.length);
    documents.set(uuid, {
      uuid,
      id,
      _id: id,
      name,
      type,
      documentName: 'Macro',
      command: '',
    });
  }
}
