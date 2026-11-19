export const VERTICAL_CLIPPER_AMOUNT_PAISE = 19900;

export async function verticalClipperBytes(env) {
  if (!env.VERTICAL_CLIPPER_CONTENT_GZIP_BASE64) return null;
  try {
    const input = Uint8Array.from(atob(env.VERTICAL_CLIPPER_CONTENT_GZIP_BASE64), (character) => character.charCodeAt(0));
    const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'));
    const pack = new Uint8Array(await new Response(stream).arrayBuffer());
    return pack[0] === 0x50 && pack[1] === 0x4b && pack[2] === 0x03 && pack[3] === 0x04 ? pack : null;
  } catch {
    return null;
  }
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
