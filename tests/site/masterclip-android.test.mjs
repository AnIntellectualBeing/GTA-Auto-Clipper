import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost as createOrder } from '../../site/functions/api/masterclip/create-order.js';
import { onRequestPost as verifyPayment } from '../../site/functions/api/masterclip/verify-payment.js';
import { onRequestPost as recover } from '../../site/functions/api/masterclip/recover.js';
import { onRequestGet as guide } from '../../site/functions/api/masterclip/guide.js';
import { onRequestGet as apk } from '../../site/functions/api/masterclip/apk.js';
import { onRequestGet as phoneAccess } from '../../site/functions/MasterClipPhone/access.js';
import { onRequestGet as toolAccess } from '../../site/functions/MasterClipTool/access.js';
import { hmacHex } from '../../site/functions/_lib/razorpay.mjs';
import { signAccessToken, verifyAccessTokenInfo } from '../../site/functions/_lib/masterclip-access.mjs';

const env = { RAZORPAY_KEY_ID: 'rzp_test_example', RAZORPAY_KEY_SECRET: 'fixture-secret' }; // no guide storage on purpose
const origin = 'https://example.test';
const PAY = 'pay_android12345';
const post = (path, input) => new Request(origin + path, {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input),
});

test('the phone app order is ₹149, tagged masterclip-android, and needs no guide storage', async (t) => {
  let order;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    order = JSON.parse(init.body);
    return Response.json({ id: 'order_ph', amount: order.amount, currency: 'INR' });
  });
  const res = await createOrder({ env, request: post('/api/masterclip/create-order', { product: 'android', amount: 1, email: 'a@b.co' }) });
  assert.equal(res.status, 200);
  assert.equal(order.amount, 14900);
  assert.equal(order.notes.product, 'masterclip-android');
  assert.equal((await res.json()).amount, 14900);
  // The kit still needs the guide storage and stays ₹349.
  assert.equal((await createOrder({ env, request: post('/api/masterclip/create-order', {}) })).status, 503);
});

function razorpay(product, amount = 14900) {
  return async (url) => (String(url).includes('/orders/')
    ? Response.json({ id: 'order_ph', notes: { product } })
    : Response.json({ id: PAY, status: 'captured', order_id: 'order_ph', amount, currency: 'INR', email: 'a@b.co' }));
}

test('a paid phone order gets a phone-only link: APK yes, guide and kit no', async (t) => {
  t.mock.method(globalThis, 'fetch', razorpay('masterclip-android'));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, `order_ph|${PAY}`);
  const verified = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_ph', razorpay_payment_id: PAY, razorpay_signature: signature }) });
  assert.equal(verified.status, 200);
  const { accessUrl } = await verified.json();
  assert.match(accessUrl, /^https:\/\/example\.test\/MasterClipPhone\/access\?token=pay_android12345\./);
  const token = new URL(accessUrl).searchParams.get('token');
  assert.deepEqual(await verifyAccessTokenInfo(env, token), { paymentId: PAY, product: 'masterclip-android' });

  const kvEnv = { ...env, MASTERCLIP_KV: { async get(key) { return key.endsWith('.meta') ? { parts: 1, size: 3, filename: 'MasterClip-1.2.0.apk' } : new Uint8Array([1, 2, 3]).buffer; } } };
  assert.equal((await apk({ env: kvEnv, request: new Request(`${origin}/api/masterclip/apk?token=${token}`) })).status, 200);
  assert.equal((await guide({ env, request: new Request(`${origin}/api/masterclip/guide?token=${token}`) })).status, 401);
  assert.equal((await guide({ env, request: new Request(`${origin}/api/masterclip/guide?token=${token}&file=kit`) })).status, 401);

  const page = await phoneAccess({ env, request: new Request(accessUrl) });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /\/api\/masterclip\/apk\?token=/);
  assert.doesNotMatch(html, /\/api\/masterclip\/guide/);
  assert.equal((await phoneAccess({ env, request: new Request(`${origin}/MasterClipPhone/access?token=nope`) })).status, 401);
});

test('a ₹149 payment on someone else\'s order (the ₹149 prompt guide) is not a MasterClip purchase', async (t) => {
  t.mock.method(globalThis, 'fetch', razorpay('prompt-guide'));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, `order_ph|${PAY}`);
  const verified = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_ph', razorpay_payment_id: PAY, razorpay_signature: signature }) });
  assert.equal(verified.status, 400);
  // And the phone product cannot be paid with the kit's amount.
  t.mock.method(globalThis, 'fetch', razorpay('masterclip-android', 34900));
  const wrong = await verifyPayment({ env, request: post('/api/masterclip/verify-payment', { razorpay_order_id: 'order_ph', razorpay_payment_id: PAY, razorpay_signature: signature }) });
  assert.equal(wrong.status, 400);
});

test('a kit link still opens the kit page, and the phone page also accepts it', async () => {
  const token = await signAccessToken(env, PAY);
  assert.equal((await verifyAccessTokenInfo(env, token)).product, 'kit');
  assert.equal((await toolAccess({ env: { ...env, MASTERCLIP_FILES: {} }, request: new Request(`${origin}/MasterClipTool/access?token=${token}`) })).status, 200);
  assert.equal((await phoneAccess({ env, request: new Request(`${origin}/MasterClipPhone/access?token=${token}`) })).status, 200);
  // A phone-only token is not valid for the kit page's guide link.
  const phoneToken = await signAccessToken(env, PAY, Date.now(), 'masterclip-android');
  assert.notEqual(phoneToken, token);
});

test('"find my purchase" gives a phone buyer the phone page', async (t) => {
  t.mock.method(globalThis, 'fetch', razorpay('masterclip-android'));
  const res = await recover({ env, request: post('/api/masterclip/recover', { paymentId: PAY }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.accessUrl, /\/MasterClipPhone\/access\?token=/);
});
