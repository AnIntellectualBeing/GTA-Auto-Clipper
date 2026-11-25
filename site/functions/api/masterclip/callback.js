import { masterclipDeliveryEnabled } from '../../_lib/masterclip.mjs';
import { confirmCheckout } from '../../_lib/masterclip-token.mjs';
import { accessUrl } from '../../_lib/masterclip-access.mjs';
import { emailAfterCheckout } from '../../_lib/masterclip-email.mjs';

// Razorpay redirect mode (used inside Instagram/Facebook browsers, where popups and JS callbacks
// get lost): Razorpay POSTs the result here as a form, and we send the buyer straight to the
// access page with a 303. The Razorpay signature is the authentication, so no origin check.
const go = (location) => new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

export async function onRequestPost(context) {
  const { request, env } = context;
  const form = await request.formData().catch(() => null);
  const field = (name) => (typeof form?.get(name) === 'string' ? form.get(name) : '');
  const orderId = field('razorpay_order_id');
  const paymentId = field('razorpay_payment_id');
  if (!form || !masterclipDeliveryEnabled(env)) return go('/MasterClipTool/download-ready');
  if (!paymentId) {
    // Failed / cancelled payment: Razorpay sends error[...] fields. Let the buyer try again.
    let meta = {};
    try { meta = JSON.parse(field('error[metadata]') || '{}'); } catch { /* ignore */ }
    const order = /^order_[A-Za-z0-9]{6,40}$/.test(meta.order_id || '') ? `&order=${meta.order_id}` : '';
    const page = new URL(request.url).searchParams.get('p') === 'android' ? 'MasterClipPhone' : 'MasterClipTool';
    return go(`/${page}/?payment=failed${order}#buy`);
  }
  const result = await confirmCheckout(env, { orderId, paymentId, signature: field('razorpay_signature') });
  if (result.status === 'ok') {
    const link = await accessUrl(request, env, result.payment.id, result.payment.product);
    emailAfterCheckout(context, env, result.payment, link);
    return go(link);
  }
  // Pending capture or a temporary error: the recovery page keeps checking this order by itself.
  const params = new URLSearchParams();
  if (/^order_[A-Za-z0-9]{6,40}$/.test(orderId)) params.set('order', orderId);
  if (/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId)) params.set('pay', paymentId);
  return go(`/MasterClipTool/download-ready?${params}`);
}

// Some flows come back with GET; just show the recovery page.
export function onRequestGet() {
  return go('/MasterClipTool/download-ready');
}
