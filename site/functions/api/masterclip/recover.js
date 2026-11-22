import { jsonResponse } from '../../_lib/razorpay.mjs';
import { masterclipEnabled, sameOrigin } from '../../_lib/masterclip.mjs';
import { downloadLink, paidPaymentOfOrder, paymentById } from '../../_lib/masterclip-token.mjs';

// "I paid but didn't get the download": by the order this browser started (checked again and
// again when the buyer comes back from the UPI app), or by the payment ID from Razorpay's SMS/email.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return jsonResponse({ error: 'Request was not accepted.' }, 403);
  if (!masterclipEnabled(env)) return jsonResponse({ error: 'Delivery is being configured.' }, 503);
  const body = await request.json().catch(() => null);
  const paymentId = typeof body?.paymentId === 'string' ? body.paymentId.trim() : '';
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  try {
    const payment = paymentId ? await paymentById(env, paymentId) : orderId ? await paidPaymentOfOrder(env, orderId) : null;
    if (!payment) {
      return jsonResponse({ paid: false, error: paymentId ? 'We could not find a completed MasterClip payment with that ID. Check it starts with pay_ and try again, or email us.' : undefined }, paymentId ? 404 : 200);
    }
    return jsonResponse({ paid: true, link: await downloadLink(request, env, payment.id), paymentId: payment.id });
  } catch {
    return jsonResponse({ error: 'Could not check the payment right now. Please retry in a moment.' }, 502);
  }
}
