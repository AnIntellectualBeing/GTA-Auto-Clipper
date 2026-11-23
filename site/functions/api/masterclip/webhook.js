import { constantTimeHexEqual, hmacHex, jsonResponse } from '../../_lib/razorpay.mjs';
import { masterclipDeliveryEnabled } from '../../_lib/masterclip.mjs';
import { masterclipPayment } from '../../_lib/masterclip-token.mjs';
import { accessUrl } from '../../_lib/masterclip-access.mjs';
import { emailEnabled, sendAccessEmail } from '../../_lib/masterclip-email.mjs';

// Optional Razorpay webhook (event: payment.captured). Emails the access link even when the buyer's
// page never came back from the UPI app. Needs RAZORPAY_WEBHOOK_SECRET + the Resend secrets.
export async function onRequestPost({ request, env }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !masterclipDeliveryEnabled(env)) return jsonResponse({ error: 'Webhook not configured.' }, 404);
  const raw = await request.text();
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!constantTimeHexEqual(expected, request.headers.get('x-razorpay-signature') || '')) return jsonResponse({ error: 'Bad signature.' }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return jsonResponse({ error: 'Bad body.' }, 400); }
  const payment = event?.payload?.payment?.entity;
  if (event?.event !== 'payment.captured' || !payment?.id) return jsonResponse({ ignored: true });
  try {
    if (!(await masterclipPayment(env, payment))) return jsonResponse({ ignored: true });
  } catch {
    return jsonResponse({ error: 'Could not check the order.' }, 502); // Razorpay retries
  }
  if (!emailEnabled(env) || !payment.email) return jsonResponse({ ok: true, emailed: false });
  const sent = await sendAccessEmail(env, payment.email, await accessUrl(request, env, payment.id), payment.id);
  return sent ? jsonResponse({ ok: true, emailed: true }) : jsonResponse({ error: 'Email failed.' }, 502);
}
