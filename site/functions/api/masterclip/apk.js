import { APK_META_KEY, SUPPORT_EMAIL, apkPartKey } from '../../_lib/masterclip.mjs';
import { verifyAccessToken } from '../../_lib/masterclip-access.mjs';

// /api/masterclip/apk?token=...  MasterClip for Android, only for a valid ₹349 access token.
// The APK is never on a public URL: it lives in Workers KV (MASTERCLIP_KV) as numbered parts,
// streamed back to back. Upload with tools\upload-apk.ps1.
const text = (body, status) => new Response(body, {
  status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});

export async function apkMeta(kv) {
  if (!kv || typeof kv.get !== 'function') return null;
  const meta = await kv.get(APK_META_KEY, 'json').catch(() => null);
  if (!meta || !Number.isInteger(meta.parts) || meta.parts < 1 || meta.parts > 20 || !Number.isInteger(meta.size)) return null;
  return meta;
}

async function serve(request, env, headOnly) {
  const paymentId = await verifyAccessToken(env, new URL(request.url).searchParams.get('token'));
  if (!paymentId) return text(`This download link is not valid or has expired. Get a fresh link at https://masterprompt.anintellectualcompany.com/MasterClipTool/download-ready with your payment ID (pay_...), or email ${SUPPORT_EMAIL}.`, 401);
  const kv = env.MASTERCLIP_KV;
  const meta = await apkMeta(kv);
  if (!meta) return text(`The Android app is being updated. Please try again in a little while, or email ${SUPPORT_EMAIL} with your payment ID (${paymentId}) and we will send it.`, 503);
  const filename = /^[\w.-]{1,80}\.apk$/.test(meta.filename || '') ? meta.filename : 'MasterClip.apk';
  const headers = new Headers({
    'content-type': 'application/vnd.android.package-archive',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-length': String(meta.size),
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
    'x-content-type-options': 'nosniff',
  });
  if (headOnly) return new Response(null, { status: 200, headers });
  let index = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (index >= meta.parts) { controller.close(); return; }
      const part = await kv.get(apkPartKey(index), 'arrayBuffer');
      index += 1;
      if (!part) { controller.error(new Error('missing APK part')); return; }
      controller.enqueue(new Uint8Array(part));
    },
  });
  return new Response(body, { status: 200, headers });
}

export const onRequestGet = ({ request, env }) => serve(request, env, false);
export const onRequestHead = ({ request, env }) => serve(request, env, true);
