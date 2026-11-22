import { constantTimeHexEqual, hmacHex } from '../../_lib/razorpay.mjs';
import { masterclipDownloadUrl } from '../../_lib/masterclip.mjs';
import { tokenOk } from '../../_lib/masterclip-token.mjs';

const denied = () => new Response('This download link has expired or is not valid. Open masterprompt.anintellectualcompany.com/MasterClipTool/download-ready and use "Paid but no download?" with your payment ID, or email anintellectualcompany.contact@gmail.com.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function onRequestGet({ request, env }) {
  if (!env.RAZORPAY_KEY_SECRET) return denied();
  // A signed link (?t=) works in any browser for 7 days: copy-paste into Chrome, a second PC, ...
  const linkToken = new URL(request.url).searchParams.get('t');
  if (linkToken) {
    if (!(await tokenOk(env, linkToken))) return denied();
    const target = masterclipDownloadUrl(env);
    if (!target) return new Response('MasterClip delivery is temporarily unavailable.', { status: 503 });
    return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'private, no-store' } });
  }
  const token = (request.headers.get('cookie') || '').split('; ').find((item) => item.startsWith('masterclip='))?.slice('masterclip='.length);
  const parts = token?.split('.') || [];
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < Math.floor(Date.now() / 1000)) return denied();
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `masterclip-session|${parts[0]}.${parts[1]}`);
  if (!constantTimeHexEqual(expected, parts[2])) return denied();
  const url = masterclipDownloadUrl(env);
  if (!url) return new Response('MasterClip delivery is temporarily unavailable.', { status: 503 });
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'private, no-store' } });
}
