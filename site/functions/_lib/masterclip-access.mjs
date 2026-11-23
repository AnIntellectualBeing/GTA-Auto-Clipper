import { constantTimeHexEqual, hmacHex } from './razorpay.mjs';

// Long-lived, bookmarkable access tokens tied to one Razorpay payment id.
// Format: <pay_id>.<expires unix seconds>.<hmac hex>
// Signed with MASTERCLIP_ACCESS_SECRET when set (so switching Razorpay test/live keys does not
// break links), else with RAZORPAY_KEY_SECRET. Verification accepts either.
export const DEFAULT_ACCESS_DAYS = 365;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

function signingSecret(env) {
  return env.MASTERCLIP_ACCESS_SECRET || env.RAZORPAY_KEY_SECRET || '';
}

function verifySecrets(env) {
  return [env.MASTERCLIP_ACCESS_SECRET, env.RAZORPAY_KEY_SECRET].filter((secret, i, all) => secret && all.indexOf(secret) === i);
}

function accessDays(env) {
  const days = Number(env.MASTERCLIP_ACCESS_DAYS);
  return Number.isFinite(days) && days >= 1 && days <= 3650 ? Math.floor(days) : DEFAULT_ACCESS_DAYS;
}

const message = (paymentId, expires) => `masterclip-access|v1|${paymentId}|${expires}`;

export function isPaymentId(value) {
  return typeof value === 'string' && PAYMENT_ID.test(value);
}

export async function signAccessToken(env, paymentId, now = Date.now()) {
  if (!isPaymentId(paymentId)) throw new Error('bad payment id');
  const secret = signingSecret(env);
  if (!secret) throw new Error('no signing secret');
  const expires = Math.floor(now / 1000) + accessDays(env) * 86400;
  return `${paymentId}.${expires}.${await hmacHex(secret, message(paymentId, expires))}`;
}

// Returns the payment id when the token is genuine, unexpired and not revoked; otherwise null.
export async function verifyAccessToken(env, token, now = Date.now()) {
  const parts = typeof token === 'string' && token.length < 200 ? token.split('.') : [];
  if (parts.length !== 3) return null;
  const [paymentId, expires, signature] = parts;
  if (!isPaymentId(paymentId) || !/^\d{9,11}$/.test(expires) || Number(expires) < Math.floor(now / 1000)) return null;
  const revoked = String(env.MASTERCLIP_REVOKED || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (revoked.includes(paymentId)) return null;
  for (const secret of verifySecrets(env)) {
    if (constantTimeHexEqual(await hmacHex(secret, message(paymentId, expires)), signature)) return paymentId;
  }
  return null;
}

export async function accessUrl(request, env, paymentId) {
  const origin = new URL(request.url).origin;
  return `${origin}/MasterClipTool/access?token=${encodeURIComponent(await signAccessToken(env, paymentId))}`;
}
