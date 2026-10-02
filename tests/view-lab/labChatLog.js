/**
 * A Foundry-shaped chat log docked inside the lab window (`chatLog=1`), so a case can photograph
 * the result card a real craft or salvage posts beside the screen that posted it (issue 2005).
 * Each message is drawn in core's `chat-message` markup, classed `whisper` or `blind` as core
 * classes a message it would not show every player; nothing shipped reads this module.
 */

const WHISPER_MODES = new Set(['gm', 'gmroll', 'self', 'selfroll']);
const BLIND_MODES = new Set(['blind', 'blindroll']);

/** `public`, `whisper` or `blind`, from the data core's appliers write or the mode passed. */
function visibilityOf(data, options) {
  const mode = data.messageMode ?? data.rollMode ?? options?.messageMode ?? options?.rollMode ?? null;
  if (data.blind === true || BLIND_MODES.has(mode)) return 'blind';
  if ((Array.isArray(data.whisper) && data.whisper.length > 0) || WHISPER_MODES.has(mode)) {
    return 'whisper';
  }
  return 'public';
}

/** A rolled message's content, as core's dice template reduces to at a glance. */
function rollNodes(doc, rolls) {
  return rolls.map((roll) => {
    const node = doc.createElement('div');
    node.className = 'dice-roll';
    const formula = doc.createElement('div');
    formula.className = 'dice-formula';
    formula.textContent = String(roll?.formula ?? '');
    const total = doc.createElement('h4');
    total.className = 'dice-total';
    total.textContent = String(roll?.total ?? '');
    node.append(formula, total);
    return node;
  });
}

function messageElement(doc, data, options) {
  const visibility = visibilityOf(data, options);
  const item = doc.createElement('li');
  item.className = `chat-message message flexcol${visibility === 'public' ? '' : ` ${visibility}`}`;
  item.dataset.viewLabChatVisibility = visibility;
  const header = doc.createElement('header');
  header.className = 'message-header flexrow';
  const sender = doc.createElement('h4');
  sender.className = 'message-sender';
  sender.textContent = String(data.speaker?.alias ?? 'Fabricate');
  header.append(sender);
  if (typeof data.flavor === 'string' && data.flavor) {
    const flavor = doc.createElement('span');
    flavor.className = 'flavor-text';
    flavor.textContent = data.flavor;
    header.append(flavor);
  }
  if (visibility !== 'public') {
    const whisper = doc.createElement('span');
    whisper.className = 'whisper-to';
    whisper.textContent = visibility === 'blind' ? 'Blind roll' : 'To: Gamemaster';
    header.append(whisper);
  }
  const content = doc.createElement('div');
  content.className = 'message-content';
  if (typeof data.content === 'string' && data.content) content.innerHTML = data.content;
  else if (Array.isArray(data.rolls)) content.append(...rollNodes(doc, data.rolls));
  item.append(header, content);
  return item;
}

/**
 * Dock the log in `frame`, on its right or (`side: 'left'`) its left, and mirror every message
 * `ChatMessage.create` makes into it.
 */
export function installLabChatLog(frame, doc = globalThis.document, { side = 'right' } = {}) {
  const log = doc.createElement('ol');
  log.className = 'chat-log';
  log.dataset.viewLabChatLog = '';
  Object.assign(log.style, {
    position: 'absolute',
    top: '48px',
    [side === 'left' ? 'left' : 'right']: '12px',
    width: '300px',
    maxHeight: 'calc(100% - 60px)',
    margin: '0',
    padding: '0',
    overflowY: 'auto',
    listStyle: 'none',
    zIndex: '100',
  });
  frame.append(log);
  const create = globalThis.ChatMessage.create.bind(globalThis.ChatMessage);
  globalThis.ChatMessage.create = async (data = {}, options = {}) => {
    const message = await create(data, options);
    log.append(messageElement(doc, data, options));
    return message;
  };
  return log;
}
