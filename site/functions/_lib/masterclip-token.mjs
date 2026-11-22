import { constantTimeHexEqual, hmacHex, razorpayAuth } from './razorpay.mjs';
import { MASTERCLIP_AMOUNT_PAISE, MASTERCLIP_PRODUCT } from './masterclip.mjs';

// A download link that works in ANY browser (Instagram's in-app browser often loses the
// checkout page, so the buyer must be able to copy the link or open it in Chrome).
const DAYS = 7;

export async function downloadToken(env, paymentId) {
  const expires = Math.floor(Date.now() / 1000) + DAYS * 86400;
  const payload = `${expires}.${paymentId}`;
  return `${payload}.${await hmacHex(env.RAZORPAY_KEY_SECRET, `masterclip-link|${payload}`)}`;
}

export async function tokenOk(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < Math.floor(Date.now() / 1000)) return false;
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(parts[1])) return false;
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `masterclip-link|${parts[0]}.${parts[1]}`);
  return constantTimeHexEqual(expected, parts[2]);
}

export async function downloadLink(request, env, paymentId) {
  const origin = new URL(request.url).origin;
  return `${origin}/api/masterclip/download?t=${encodeURIComponent(await downloadToken(env, paymentId))}`;
}

async function razorpay(env, path) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { authorization: razorpayAuth(env) } });
  if (!response.ok) return null;
  return response.json();
}

// A captured ₹349 payment on a MasterClip order.
export async function masterclipPayment(env, payment) {
  if (!payment || payment.status !== 'captured' || Number(payment.amount) !== MASTERCLIP_AMOUNT_PAISE || payment.currency !== 'INR') return false;
  if (!payment.order_id) return false;
  const order = await razorpay(env, `orders/${encodeURIComponent(payment.order_id)}`);
  return order?.notes?.product === MASTERCLIP_PRODUCT;
}

export async function paymentById(env, paymentId) {
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId || '')) return null;
  const payment = await razorpay(env, `payments/${encodeURIComponent(paymentId)}`);
  return (await masterclipPayment(env, payment)) ? payment : null;
}

export async function paidPaymentOfOrder(env, orderId) {
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(orderId || '')) return null;
  const list = await razorpay(env, `orders/${encodeURIComponent(orderId)}/payments`);
  for (const payment of list?.items || []) {
    if (payment.status === 'captured' && Number(payment.amount) === MASTERCLIP_AMOUNT_PAISE) {
      const order = await razorpay(env, `orders/${encodeURIComponent(orderId)}`);
      if (order?.notes?.product === MASTERCLIP_PRODUCT) return payment;
    }
  }
  return null;
}
