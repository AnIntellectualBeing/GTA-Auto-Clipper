import { constantTimeHexEqual, hmacHex } from '../../_lib/razorpay.mjs';
import { masterclipDownloadUrl } from '../../_lib/masterclip.mjs';

const denied = () => new Response('A verified purchase is required to download MasterClip.', { status: 401 });

export async function onRequestGet({ request, env }) {
  if (!env.RAZORPAY_KEY_SECRET) return denied();
  const token = (request.headers.get('cookie') || '').split('; ').find((item) => item.startsWith('masterclip='))?.slice('masterclip='.length);
  const parts = token?.split('.') || [];
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < Math.floor(Date.now() / 1000)) return denied();
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `masterclip-session|${parts[0]}.${parts[1]}`);
  if (!constantTimeHexEqual(expected, parts[2])) return denied();
  const url = masterclipDownloadUrl(env);
  if (!url) return new Response('MasterClip delivery is temporarily unavailable.', { status: 503 });
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'private, no-store' } });
}
