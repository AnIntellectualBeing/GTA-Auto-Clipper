import { constantTimeHexEqual, hmacHex } from './razorpay.mjs';
import { ANDROID_PRODUCT } from './masterclip.mjs';

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

// The product is part of what is signed, so a phone-only link can never open the kit downloads.
const message = (paymentId, expires, product) => `masterclip-access|${product === ANDROID_PRODUCT ? 'v1a' : 'v1'}|${paymentId}|${expires}`;

export function isPaymentId(value) {
  return typeof value === 'string' && PAYMENT_ID.test(value);
}

export async function signAccessToken(env, paymentId, now = Date.now(), product) {
  if (!isPaymentId(paymentId)) throw new Error('bad payment id');
  const secret = signingSecret(env);
  if (!secret) throw new Error('no signing secret');
  const expires = Math.floor(now / 1000) + accessDays(env) * 86400;
  return `${paymentId}.${expires}.${await hmacHex(secret, message(paymentId, expires, product))}`;
}

// Returns { paymentId, product } when the token is genuine, unexpired and not revoked; otherwise
// null. product is ANDROID_PRODUCT for phone-only links and 'kit' for the ₹349 purchase.
export async function verifyAccessTokenInfo(env, token, now = Date.now()) {
  const parts = typeof token === 'string' && token.length < 200 ? token.split('.') : [];
  if (parts.length !== 3) return null;
  const [paymentId, expires, signature] = parts;
  if (!isPaymentId(paymentId) || !/^\d{9,11}$/.test(expires) || Number(expires) < Math.floor(now / 1000)) return null;
  const revoked = String(env.MASTERCLIP_REVOKED || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (revoked.includes(paymentId)) return null;
  for (const secret of verifySecrets(env)) {
    if (constantTimeHexEqual(await hmacHex(secret, message(paymentId, expires)), signature)) return { paymentId, product: 'kit' };
    if (constantTimeHexEqual(await hmacHex(secret, message(paymentId, expires, ANDROID_PRODUCT)), signature)) return { paymentId, product: ANDROID_PRODUCT };
  }
  return null;
}

// Any valid link (kit or phone-only): returns the payment id.
export async function verifyAccessToken(env, token, now = Date.now()) {
  return (await verifyAccessTokenInfo(env, token, now))?.paymentId || null;
}

// Only links that include the guide and kit (the ₹349 purchase).
export async function verifyKitToken(env, token, now = Date.now()) {
  const info = await verifyAccessTokenInfo(env, token, now);
  return info && info.product === 'kit' ? info.paymentId : null;
}

export async function accessUrl(request, env, paymentId, product) {
  const origin = new URL(request.url).origin;
  const path = product === ANDROID_PRODUCT ? 'MasterClipPhone' : 'MasterClipTool';
  return `${origin}/${path}/access?token=${encodeURIComponent(await signAccessToken(env, paymentId, Date.now(), product))}`;
}
