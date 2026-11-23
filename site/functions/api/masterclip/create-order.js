import { jsonResponse, orderNotes, razorpayAuth } from '../../_lib/razorpay.mjs';
import { MASTERCLIP_AMOUNT_PAISE, MASTERCLIP_PRODUCT, cleanEmail, cleanPhone, masterclipEnabled, sameOrigin } from '../../_lib/masterclip.mjs';

// The buyer's email/phone go into the order notes so the access link can be recovered later.
function buyerNotes(notes, input) {
  const email = cleanEmail(input?.email);
  const phone = cleanPhone(input?.phone);
  return { ...notes, ...(email && { buyer_email: email }), ...(phone && { buyer_phone: phone }) };
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return jsonResponse({ error: 'Checkout request was not accepted.' }, 403);
  if (!masterclipEnabled(env)) return jsonResponse({ error: 'Checkout is being configured. Please try again later.' }, 503);
  const input = await request.json().catch(() => null);
  const receipt = `mclip${crypto.randomUUID().replaceAll('-', '').slice(0, 28)}`;
  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { authorization: razorpayAuth(env), 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: MASTERCLIP_AMOUNT_PAISE,
        currency: 'INR',
        receipt,
        notes: buyerNotes(orderNotes(MASTERCLIP_PRODUCT, input, env), input),
      }),
    });
    if (!response.ok) return jsonResponse({ error: 'Could not start checkout. Please try again.' }, 502);
    const order = await response.json();
    if (order.amount !== MASTERCLIP_AMOUNT_PAISE || order.currency !== 'INR') return jsonResponse({ error: 'Payment order details did not match.' }, 502);
    return jsonResponse({ keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount: MASTERCLIP_AMOUNT_PAISE, currency: 'INR' });
  } catch {
    return jsonResponse({ error: 'Payment service is temporarily unavailable.' }, 502);
  }
}
