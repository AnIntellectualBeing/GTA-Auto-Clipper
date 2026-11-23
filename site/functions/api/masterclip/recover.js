import { jsonResponse } from '../../_lib/razorpay.mjs';
import { cleanEmail, cleanPhone, masterclipDeliveryEnabled, sameOrigin } from '../../_lib/masterclip.mjs';
import { paidPaymentOfOrder, paymentByContact, paymentById } from '../../_lib/masterclip-token.mjs';
import { accessUrl } from '../../_lib/masterclip-access.mjs';
import { emailEnabled, later, sendAccessEmail } from '../../_lib/masterclip-email.mjs';
import { clientIp, rateLimited } from '../../_lib/rate-limit.mjs';

const WINDOW = 15 * 60 * 1000;
const LIMITS = { order: 300, payment: 20, contact: 8 };
const NOT_FOUND = {
  payment: 'We could not find a completed MasterClip payment with that ID. Check it starts with pay_ (from the Razorpay SMS/email), or email us.',
  contact: 'We could not find a completed MasterClip payment with that email or phone. Try the payment ID (pay_…) from your Razorpay SMS/email, or email us.',
};

// "I paid but have no link": by the order this browser started (polled when the buyer comes back
// from the UPI app), by the payment ID from Razorpay's receipt, or by the email/phone used.
// Works for buyers from before the access page existed too: it only asks Razorpay.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return jsonResponse({ error: 'Request was not accepted.' }, 403);
  if (!masterclipDeliveryEnabled(env)) return jsonResponse({ error: 'Delivery is being configured.' }, 503);
  const body = await request.json().catch(() => null);
  const text = (key) => (typeof body?.[key] === 'string' ? body[key].trim() : '');
  const paymentId = text('paymentId');
  const orderId = text('orderId');
  const email = cleanEmail(text('email'));
  const phone = cleanPhone(text('phone'));
  const kind = paymentId ? 'payment' : orderId ? 'order' : (email || phone) ? 'contact' : null;
  if (!kind) return jsonResponse({ paid: false, error: 'Enter your payment ID (pay_…), or the email or phone you paid with.' }, 400);
  if (rateLimited(`${kind}|${clientIp(request)}`, LIMITS[kind], WINDOW)) {
    return jsonResponse({ paid: false, error: 'Too many tries. Please wait 15 minutes, or email us with your payment ID.' }, 429);
  }
  try {
    const payment = kind === 'payment' ? await paymentById(env, paymentId)
      : kind === 'order' ? await paidPaymentOfOrder(env, orderId)
        : await paymentByContact(env, { email, phone });
    if (!payment) return jsonResponse({ paid: false, error: NOT_FOUND[kind] }, kind === 'order' ? 200 : 404);
    const link = await accessUrl(request, env, payment.id);
    let emailed = false;
    if (kind === 'contact' && emailEnabled(env) && payment.email) {
      emailed = true;
      later(context, sendAccessEmail(env, payment.email, link, payment.id));
    }
    return jsonResponse({ paid: true, accessUrl: link, link, paymentId: payment.id, emailed });
  } catch {
    return jsonResponse({ error: 'Could not check the payment right now. Please retry in a moment.' }, 502);
  }
}
