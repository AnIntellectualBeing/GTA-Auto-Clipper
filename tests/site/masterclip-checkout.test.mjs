import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost as createOrder } from '../../site/functions/api/masterclip/create-order.js';
import { onRequestPost as verifyPayment } from '../../site/functions/api/masterclip/verify-payment.js';
import { onRequestGet as download } from '../../site/functions/api/masterclip/download.js';
import { onRequestGet as config } from '../../site/functions/api/masterclip/config.js';
import { hmacHex } from '../../site/functions/_lib/razorpay.mjs';

const env = {
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'fixture-secret',
  MASTERCLIP_DOWNLOAD_URL: 'https://example.test/MasterClipSetup.exe',
};
const origin = 'https://example.test';
const post = (path, input) => new Request(origin + path, {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input),
});

test('checkout stays off until the download URL is set', async () => {
  const off = { ...env, MASTERCLIP_DOWNLOAD_URL: '' };
  assert.equal((await (await config({ env: off })).json()).enabled, false);
  assert.equal((await createOrder({ env: off, request: post('/api/masterclip/create-order', {}) })).status, 503);
  assert.equal((await (await config({ env })).json()).enabled, true);
});

test('order is ₹349 on the server and carries the referral code', async (t) => {
  let order;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    order = JSON.parse(init.body);
    return Response.json({ id: 'order_test', amount: order.amount, currency: 'INR' });
  });
  for (const [referralCode, expected] of [['Akshat', 'akshat'], ['bad code!', undefined]]) {
    const response = await createOrder({ env, request: post('/api/masterclip/create-order', { referralCode, amount: 1 }) });
    assert.equal(response.status, 200);
    assert.equal(order.amount, 34900);
    assert.equal(order.notes.product, 'masterclip-windows');
    assert.equal(order.notes.referral_code, expected);
  }
  const limited = { ...env, REFERRAL_CODES: 'tushar,kanishk,akshat' };
  await createOrder({ env: limited, request: post('/api/masterclip/create-order', { referralCode: 'priya' }) });
  assert.equal(order.notes.referral_code, undefined);
});

test('verified payment unlocks a redirect to the installer; no cookie is refused', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'captured', order_id: 'order_1', amount: 34900 }));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, 'order_1|pay_1');
  const verified = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: signature }) });
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get('set-cookie').split(';')[0];
  const ok = await download({ env, request: new Request(`${origin}/api/masterclip/download`, { headers: { cookie } }) });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), env.MASTERCLIP_DOWNLOAD_URL);
  const denied = await download({ env, request: new Request(`${origin}/api/masterclip/download`) });
  assert.equal(denied.status, 401);
});

test('a payment for the wrong amount is not accepted', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'captured', order_id: 'order_1', amount: 19900 }));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, 'order_1|pay_1');
  const response = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: signature }) });
  assert.equal(response.status, 402);
});
