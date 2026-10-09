/**
 * Bounded, text-only expansion for source-item @Embed directives (Foundry v12+).
 *
 * Do not turn on TextEditor.enrichHTML({ embeds: true }) for these projections: that would
 * render arbitrary Document HTML into a short description, possibly including interactive,
 * private or recursively embedded content. Each referenced document is instead enriched in
 * its own UUID context, privacy-scrubbed to plain text, and inserted as escaped text.
 */

const EMBED_DIRECTIVE = /@Embed\[([^\]]{1,2048})\](?:\{([^}]{0,2048})\})?/gi;
const MAX_EMBED_DEPTH = 2;
const MAX_EMBEDS = 16;
const MAX_EMBED_SOURCE_CHARS = 12_000;
const MAX_TOTAL_EMBED_CHARS = 16_000;

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** The UUID is the first option or the explicit uuid= value; inline is NOT part of it. */
function parseEmbedConfig(raw) {
  const explicit = /(?:^|\s)uuid=(?:"([^"]{1,1024})"|'([^']{1,1024})'|([^\s]{1,1024}))/i.exec(
    raw
  );
  const uuid = (
    explicit?.[1] ||
    explicit?.[2] ||
    explicit?.[3] ||
    raw.trim().match(/^\S{1,1024}/)?.[0] ||
    ''
  ).replaceAll(/^["']|["']$/g, '');
  if (!uuid.includes('.') || uuid.length > 1024) return null;

  return {
    uuid,
    inline: /(?:^|\s)inline(?:=true)?(?=\s|$)/i.test(raw),
    caption: !/(?:^|\s)caption=false(?=\s|$)/i.test(raw),
  };
}

async function renderEmbed(match, parent, depth, context, io) {
  if (context.remaining <= 0) return match[0];
  const config = parseEmbedConfig(match[1]);
  if (!config) return match[0];
  context.remaining -= 1;

  let document;
  try {
    document = await io.resolveEmbedUuid?.(config.uuid, parent);
  } catch {
    return match[0];
  }
  // A vanished or disabled module must never destroy an authored reference on repair.
  if (!document) return match[0];

  const label = String(match[2] || document.name || '').trim();
  const fallback = label ? escapeHtml(label) : match[0];
  const identity = document.uuid || config.uuid;
  if (depth >= MAX_EMBED_DEPTH || context.stack.has(identity)) return fallback;

  const raw = io.rawSourceDescription(document);
  if (!raw) return fallback;
  if (raw.length > MAX_EMBED_SOURCE_CHARS) return fallback;

  context.stack.add(identity);
  try {
    // Resolve nested embeds against THEIR source, not the outer component's Item.
    const nested = await replaceEmbeds(raw, document, depth + 1, context, io);
    const enriched = await io.enrichToHtml(nested, { relativeTo: document });
    const plain = io.plainTextDescription(enriched);
    if (!plain) return fallback;

    // Foundry omits captions in inline embeds, but normally displays one for block embeds.
    const embeddedText = [!config.inline && config.caption ? label : '', plain]
      .filter(Boolean)
      .join(' ');
    if (embeddedText.length > context.remainingChars) return fallback;
    context.remainingChars -= embeddedText.length;
    // This is text, not trusted markup; escape before inserting into the outer HTML source.
    return escapeHtml(embeddedText);
  } catch {
    return fallback;
  } finally {
    context.stack.delete(identity);
  }
}

async function replaceEmbeds(raw, source, depth, context, io) {
  let output = '';
  let offset = 0;
  for (const match of raw.matchAll(EMBED_DIRECTIVE)) {
    output += raw.slice(offset, match.index);
    output += await renderEmbed(match, source, depth, context, io);
    offset = match.index + match[0].length;
  }
  return output + raw.slice(offset);
}

/** Expand supported embeds without mutating either source Documents or world settings. */
export async function expandDescriptionEmbeds(raw, source, io) {
  if (typeof raw !== 'string' || !/@Embed\[/i.test(raw)) return raw;
  const context = {
    stack: new Set(source?.uuid ? [source.uuid] : []),
    remaining: MAX_EMBEDS,
    remainingChars: MAX_TOTAL_EMBED_CHARS,
  };
  return replaceEmbeds(raw, source, 0, context, io);
}
