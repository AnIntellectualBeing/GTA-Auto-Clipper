import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost as createOrder } from '../../site/functions/api/masterclip/create-order.js';
import { confirmCheckout } from '../../site/functions/_lib/masterclip-token.mjs';
import { hmacHex } from '../../site/functions/_lib/razorpay.mjs';

const env = {
  RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'fixture-secret',
  MASTERCLIP_FILES: { get() {}, head() {} },
};

test('new kit checkout charges INR 249 regardless of the client supplied amount', async (t) => {
  let sent;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ id: 'order_price123', amount: sent.amount, currency: 'INR' });
  });
  const request = new Request('https://example.test/api/masterclip/create-order', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 34900 }),
  });
  const response = await createOrder({ env, request });
  assert.equal(response.status, 200);
  assert.equal(sent.amount, 24900);
  assert.equal((await response.json()).amount, 24900);
  assert.equal(sent.notes.product, 'masterclip-windows');
});

for (const amount of [24900, 34900]) {
  test(`kit delivery accepts a signed captured payment of ${amount} paise`, async (t) => {
    t.mock.method(globalThis, 'fetch', async (url) => String(url).includes('/orders/')
      ? Response.json({ id: 'order_price123', notes: { product: 'masterclip-windows' } })
      : Response.json({ id: 'pay_price123', order_id: 'order_price123', amount, currency: 'INR', status: 'captured' }));
    const result = await confirmCheckout(env, {
      orderId: 'order_price123', paymentId: 'pay_price123',
      signature: await hmacHex(env.RAZORPAY_KEY_SECRET, 'order_price123|pay_price123'),
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.payment.product, 'masterclip-windows');
  });
}
