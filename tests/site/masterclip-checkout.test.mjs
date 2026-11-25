import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost as createOrder } from '../../site/functions/api/masterclip/create-order.js';
import { onRequestPost as verifyPayment } from '../../site/functions/api/masterclip/verify-payment.js';
import { onRequestGet as download } from '../../site/functions/api/masterclip/download.js';
import { onRequestGet as config } from '../../site/functions/api/masterclip/config.js';
import { hmacHex } from '../../site/functions/_lib/razorpay.mjs';
import { verifyAccessToken } from '../../site/functions/_lib/masterclip-access.mjs';

const bucket = { head: async () => null, get: async () => null };
const env = {
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'fixture-secret',
  MASTERCLIP_FILES: bucket,
};
const origin = 'https://example.test';
const post = (path, input) => new Request(origin + path, {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input),
});
const INSTALLER = 'https://github.com/AnIntellectualBeing/MasterClip/releases/latest/download/MasterClipSetup.exe';

test('checkout stays off until the guide storage (R2) is bound', async () => {
  const off = { ...env, MASTERCLIP_FILES: undefined };
  assert.equal((await (await config({ env: off })).json()).enabled, false);
  assert.equal((await createOrder({ env: off, request: post('/api/masterclip/create-order', {}) })).status, 503);
  assert.equal((await (await config({ env })).json()).enabled, true);
});

test('order is ₹349 on the server and carries the referral code and buyer contact', async (t) => {
  let order;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    order = JSON.parse(init.body);
    return Response.json({ id: 'order_test', amount: order.amount, currency: 'INR' });
  });
  for (const [referralCode, expected] of [['Akshat', 'akshat'], ['bad code!', undefined]]) {
    const response = await createOrder({ env, request: post('/api/masterclip/create-order', { referralCode, amount: 1, email: ' Buyer@Example.com ', phone: '+91 98765 43210' }) });
    assert.equal(response.status, 200);
    assert.equal(order.amount, 34900);
    assert.equal(order.notes.product, 'masterclip-windows');
    assert.equal(order.notes.referral_code, expected);
    assert.equal(order.notes.buyer_email, 'buyer@example.com');
    assert.equal(order.notes.buyer_phone, '9876543210');
  }
  const limited = { ...env, REFERRAL_CODES: 'tushar,kanishk,akshat' };
  await createOrder({ env: limited, request: post('/api/masterclip/create-order', { referralCode: 'priya', email: 'not-an-email' }) });
  assert.equal(order.notes.referral_code, undefined);
  assert.equal(order.notes.buyer_email, undefined);
});

test('verified payment returns a long-lived access link (no cookie) that also opens the installer', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => (String(url).includes('/orders/')
    ? Response.json({ id: 'order_1', notes: { product: 'masterclip-windows' } })
    : Response.json({ id: 'pay_abc123456', status: 'captured', order_id: 'order_1', amount: 34900, currency: 'INR' })));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, 'order_1|pay_abc123456');
  const verified = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_abc123456', razorpay_signature: signature }) });
  assert.equal(verified.status, 200);
  assert.equal(verified.headers.get('set-cookie'), null);
  const body = await verified.json();
  assert.match(body.accessUrl, /^https:\/\/example\.test\/MasterClipTool\/access\?token=pay_abc123456\.\d+\.[a-f0-9]{64}$/);
  const token = new URL(body.accessUrl).searchParams.get('token');
  assert.equal(await verifyAccessToken(env, token), 'pay_abc123456');
  // Valid for months, not minutes.
  assert.ok(Number(token.split('.')[1]) - Date.now() / 1000 > 300 * 86400);
  const ok = await download({ env, request: new Request(`${origin}/api/masterclip/download?token=${encodeURIComponent(token)}`) });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), INSTALLER);
  const denied = await download({ env, request: new Request(`${origin}/api/masterclip/download`) });
  assert.equal(denied.status, 401);
});

test('an authorized-but-not-captured payment is reported as pending, not failed', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'pay_abc123456', status: 'authorized', order_id: 'order_1', amount: 34900, currency: 'INR' }));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, 'order_1|pay_abc123456');
  const response = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_abc123456', razorpay_signature: signature }) });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).pending, true);
});

test('a payment for the wrong amount or a forged signature is not accepted', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'captured', order_id: 'order_1', amount: 19900, currency: 'INR' }));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, 'order_1|pay_abc123456');
  const wrongAmount = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_abc123456', razorpay_signature: signature }) });
  assert.equal(wrongAmount.status, 400);
  const forged = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_abc123456', razorpay_signature: 'ab'.repeat(32) }) });
  assert.equal(forged.status, 400);
});

test('legacy 7-day installer links keep working', async () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const sig = await hmacHex(env.RAZORPAY_KEY_SECRET, `masterclip-link|${expires}.pay_abc123456`);
  const ok = await download({ env, request: new Request(`${origin}/api/masterclip/download?t=${expires}.pay_abc123456.${sig}`) });
  assert.equal(ok.status, 302);
});
