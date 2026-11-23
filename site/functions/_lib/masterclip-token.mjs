import { constantTimeHexEqual, hmacHex, isPaymentCaptured, razorpayAuth } from './razorpay.mjs';
import { MASTERCLIP_AMOUNT_PAISE, MASTERCLIP_PRODUCT, cleanEmail, cleanPhone } from './masterclip.mjs';

// Legacy 7-day installer links (/api/masterclip/download?t=<expires>.<pay_id>.<sig>) issued before
// the access page existed. Still honoured until they expire.
export async function tokenOk(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < Math.floor(Date.now() / 1000)) return false;
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(parts[1])) return false;
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `masterclip-link|${parts[0]}.${parts[1]}`);
  return constantTimeHexEqual(expected, parts[2]);
}

async function razorpay(env, path) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { authorization: razorpayAuth(env) } });
  if (!response.ok) return null;
  return response.json();
}

function capturedMasterclipAmount(payment) {
  return payment?.status === 'captured' && Number(payment.amount) === MASTERCLIP_AMOUNT_PAISE && payment.currency === 'INR';
}

async function orderIsMasterclip(env, orderId) {
  if (!orderId) return false;
  const order = await razorpay(env, `orders/${encodeURIComponent(orderId)}`);
  return order?.notes?.product === MASTERCLIP_PRODUCT;
}

// A captured ₹349 payment on a MasterClip order.
export async function masterclipPayment(env, payment) {
  if (!capturedMasterclipAmount(payment)) return false;
  return orderIsMasterclip(env, payment.order_id);
}

export async function paymentById(env, paymentId) {
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId || '')) return null;
  const payment = await razorpay(env, `payments/${encodeURIComponent(paymentId)}`);
  return (await masterclipPayment(env, payment)) ? payment : null;
}

export async function paidPaymentOfOrder(env, orderId) {
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(orderId || '')) return null;
  const list = await razorpay(env, `orders/${encodeURIComponent(orderId)}/payments`);
  const payment = (list?.items || []).find(capturedMasterclipAmount);
  return payment && (await orderIsMasterclip(env, orderId)) ? payment : null;
}

// Finds the newest captured MasterClip payment made with this email or phone. Razorpay has no
// search-by-email, so recent payments are scanned (newest first, up to maxPages × 100).
export async function paymentByContact(env, { email, phone }, { maxPages = 5, days = 400, now = Date.now() } = {}) {
  const wantEmail = cleanEmail(email);
  const wantPhone = cleanPhone(phone);
  if (!wantEmail && !wantPhone) return null;
  const from = Math.floor(now / 1000) - days * 86400;
  const checkedOrders = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    const list = await razorpay(env, `payments?count=100&skip=${page * 100}&from=${from}`);
    const items = list?.items || [];
    for (const payment of items) {
      if (!capturedMasterclipAmount(payment)) continue;
      const matches = (wantEmail && cleanEmail(payment.email) === wantEmail)
        || (wantPhone && cleanPhone(payment.contact) === wantPhone);
      if (!matches || checkedOrders.has(payment.order_id)) continue;
      checkedOrders.add(payment.order_id);
      if (await orderIsMasterclip(env, payment.order_id)) return payment;
    }
    if (items.length < 100) break;
  }
  return null;
}

// Checks a Razorpay checkout result (handler callback or redirect POST).
// Returns { status: 'ok' | 'pending' | 'invalid' | 'error', payment? }.
export async function confirmCheckout(env, { orderId, paymentId, signature }) {
  if (![orderId, paymentId, signature].every((value) => typeof value === 'string' && value.length > 0 && value.length < 256)) return { status: 'invalid' };
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  if (!constantTimeHexEqual(expected, signature)) return { status: 'invalid' };
  let payment;
  try {
    payment = await razorpay(env, `payments/${encodeURIComponent(paymentId)}`);
  } catch {
    return { status: 'error' };
  }
  if (!payment) return { status: 'error' };
  if (isPaymentCaptured(payment, orderId, MASTERCLIP_AMOUNT_PAISE)) return { status: 'ok', payment };
  // Signed by Razorpay but not captured yet (auto-capture can lag a few seconds).
  if (payment.status === 'authorized' && payment.order_id === orderId && Number(payment.amount) === MASTERCLIP_AMOUNT_PAISE) return { status: 'pending', payment };
  return { status: 'invalid' };
}
