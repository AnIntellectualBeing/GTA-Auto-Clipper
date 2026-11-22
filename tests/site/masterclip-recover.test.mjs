import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost as recover } from '../../site/functions/api/masterclip/recover.js';
import { onRequestGet as download } from '../../site/functions/api/masterclip/download.js';

const env = {
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'fixture-secret',
  MASTERCLIP_DOWNLOAD_URL: 'https://example.test/MasterClipSetup.exe',
};
const origin = 'https://example.test';
const post = (input) => new Request(origin + '/api/masterclip/recover', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input),
});
const razorpay = (t, { product = 'masterclip-windows', status = 'captured', amount = 34900 } = {}) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('/orders/order_abc123/payments')) return Response.json({ items: [{ id: 'pay_abc123456', status, amount, currency: 'INR', order_id: 'order_abc123' }] });
    if (u.includes('/orders/order_abc123')) return Response.json({ id: 'order_abc123', notes: { product } });
    if (u.includes('/payments/pay_abc123456')) return Response.json({ id: 'pay_abc123456', status, amount, currency: 'INR', order_id: 'order_abc123' });
    return new Response('nope', { status: 404 });
  });
};

test('payment ID recovery gives a link that works in any browser', async (t) => {
  razorpay(t);
  const res = await (await recover({ env, request: post({ paymentId: 'pay_abc123456' }) })).json();
  assert.equal(res.paid, true);
  assert.match(res.link, /^https:\/\/example\.test\/api\/masterclip\/download\?t=/);
  const go = await download({ env, request: new Request(res.link) });  // no cookie: a different browser
  assert.equal(go.status, 302);
  assert.equal(go.headers.get('location'), env.MASTERCLIP_DOWNLOAD_URL);
});

test('coming back from the UPI app finds the paid order', async (t) => {
  razorpay(t);
  const res = await (await recover({ env, request: post({ orderId: 'order_abc123' }) })).json();
  assert.equal(res.paid, true);
});

test('other products, wrong amounts and forged links get nothing', async (t) => {
  razorpay(t, { product: 'vertical-clipper' });
  assert.equal((await recover({ env, request: post({ paymentId: 'pay_abc123456' }) })).status, 404);
  t.mock.restoreAll();
  razorpay(t, { amount: 100 });
  assert.equal((await (await recover({ env, request: post({ orderId: 'order_abc123' }) })).json()).paid, false);
  const forged = await download({ env, request: new Request(origin + '/api/masterclip/download?t=9999999999.pay_abc123456.deadbeef') });
  assert.equal(forged.status, 401);
});
