import { constantTimeHexEqual, hmacHex } from '../../_lib/razorpay.mjs';
import { SUPPORT_EMAIL, masterclipDownloadUrl } from '../../_lib/masterclip.mjs';
import { tokenOk } from '../../_lib/masterclip-token.mjs';
import { verifyAccessToken } from '../../_lib/masterclip-access.mjs';

// Installer redirect. Kept for links issued before the access page (?t= legacy 7-day links and the
// old 24-hour cookie). New access tokens (?token=) work here too. The installer itself is public.
const denied = () => new Response(`This download link has expired or is not valid. Open https://masterprompt.anintellectualcompany.com/MasterClipTool/download-ready and enter your payment ID (pay_...) to get a new link, or email ${SUPPORT_EMAIL}.`, { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const redirect = (env) => new Response(null, { status: 302, headers: { location: masterclipDownloadUrl(env), 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' } });

export async function onRequestGet({ request, env }) {
  if (!env.RAZORPAY_KEY_SECRET) return denied();
  const params = new URL(request.url).searchParams;
  if (params.get('token')) return (await verifyAccessToken(env, params.get('token'))) ? redirect(env) : denied();
  if (params.get('t')) return (await tokenOk(env, params.get('t'))) ? redirect(env) : denied();
  const token = (request.headers.get('cookie') || '').split('; ').find((item) => item.startsWith('masterclip='))?.slice('masterclip='.length);
  const parts = token?.split('.') || [];
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < Math.floor(Date.now() / 1000)) return denied();
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `masterclip-session|${parts[0]}.${parts[1]}`);
  return constantTimeHexEqual(expected, parts[2]) ? redirect(env) : denied();
}
