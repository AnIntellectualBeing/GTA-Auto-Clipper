import { GUIDE_FILENAME, SUPPORT_EMAIL, guideBucket, guideKey } from '../../_lib/masterclip.mjs';
import { verifyAccessToken } from '../../_lib/masterclip-access.mjs';

// The private guide PDF, streamed from R2 only for a valid access token.
//   /api/masterclip/guide?token=...           -> download (Content-Disposition: attachment)
//   /api/masterclip/guide?token=...&inline=1  -> open in the browser's PDF viewer (in-app browsers
//                                                often cannot save attachments)
// Range requests are supported so mobile PDF viewers can stream a 20 MB file.
const text = (body, status) => new Response(body, {
  status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});

export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || end < start) return 'invalid';
  return { offset: start, length: end - start + 1 };
}

async function serve(request, env, headOnly) {
  const params = new URL(request.url).searchParams;
  const paymentId = await verifyAccessToken(env, params.get('token'));
  if (!paymentId) return text(`This guide link is not valid or has expired. Get a fresh link at https://masterprompt.anintellectualcompany.com/MasterClipTool/download-ready with your payment ID (pay_...), or email ${SUPPORT_EMAIL}.`, 401);
  const bucket = guideBucket(env);
  if (!bucket) return text(`The guide is temporarily unavailable. Please try again soon, or email ${SUPPORT_EMAIL} with your payment ID (${paymentId}) and we will send it.`, 503);
  const key = guideKey(env);
  const head = await bucket.head(key);
  if (!head) return text(`The guide file is being updated. Please try again in a little while, or email ${SUPPORT_EMAIL} with your payment ID (${paymentId}) and we will send it.`, 503);
  const size = head.size;
  const range = request.headers.get('range') ? parseRange(request.headers.get('range'), size) : null;
  const disposition = params.get('inline') === '1' ? 'inline' : 'attachment';
  const headers = new Headers({
    'content-type': 'application/pdf',
    'content-disposition': `${disposition}; filename="${GUIDE_FILENAME}"`,
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
    'x-content-type-options': 'nosniff',
  });
  if (head.httpEtag) headers.set('etag', head.httpEtag);
  if (range === 'invalid') {
    headers.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`);
    headers.set('content-length', String(range.length));
    if (headOnly) return new Response(null, { status: 206, headers });
    const part = await bucket.get(key, { range });
    if (!part) return text('The guide could not be read. Please retry.', 503);
    return new Response(part.body, { status: 206, headers });
  }
  headers.set('content-length', String(size));
  if (headOnly) return new Response(null, { status: 200, headers });
  const object = await bucket.get(key);
  if (!object) return text('The guide could not be read. Please retry.', 503);
  return new Response(object.body, { status: 200, headers });
}

export const onRequestGet = ({ request, env }) => serve(request, env, false);
export const onRequestHead = ({ request, env }) => serve(request, env, true);
