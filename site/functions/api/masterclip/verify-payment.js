import { jsonResponse } from '../../_lib/razorpay.mjs';
import { masterclipDeliveryEnabled, sameOrigin } from '../../_lib/masterclip.mjs';
import { confirmCheckout } from '../../_lib/masterclip-token.mjs';
import { accessUrl } from '../../_lib/masterclip-access.mjs';
import { emailAfterCheckout } from '../../_lib/masterclip-email.mjs';

// Razorpay checkout handler result -> durable access link. No cookies: the page navigates to the
// link, so a reload, a lost session or a different browser still works.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return jsonResponse({ error: 'Payment verification was not accepted.' }, 403);
  if (!masterclipDeliveryEnabled(env)) return jsonResponse({ error: 'Delivery is being configured.' }, 503);
  const body = await request.json().catch(() => null);
  const result = await confirmCheckout(env, {
    orderId: body?.razorpay_order_id, paymentId: body?.razorpay_payment_id, signature: body?.razorpay_signature,
  });
  if (result.status === 'invalid') return jsonResponse({ error: 'Payment verification failed.' }, 400);
  if (result.status === 'error') return jsonResponse({ error: 'Could not confirm payment. Please retry in a moment.' }, 502);
  if (result.status === 'pending') return jsonResponse({ pending: true, orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id }, 202);
  const link = await accessUrl(request, env, result.payment.id);
  emailAfterCheckout(context, env, result.payment, link);
  return jsonResponse({ ok: true, accessUrl: link, link, paymentId: result.payment.id });
}
