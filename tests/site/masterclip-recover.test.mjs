import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost as recover } from '../../site/functions/api/masterclip/recover.js';
import { onRequestGet as download } from '../../site/functions/api/masterclip/download.js';
import { resetRateLimits } from '../../site/functions/_lib/rate-limit.mjs';

const env = {
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'fixture-secret',
};
const origin = 'https://example.test';
const post = (input, ip = '1.1.1.1') => new Request(origin + '/api/masterclip/recover', {
  method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(input),
});
const PAYMENT = { id: 'pay_abc123456', status: 'captured', amount: 34900, currency: 'INR', order_id: 'order_abc123', email: 'buyer@example.com', contact: '+919876543210' };
const razorpay = (t, { product = 'masterclip-windows', status = 'captured', amount = 34900 } = {}) => {
  const payment = { ...PAYMENT, status, amount };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('api.resend.com')) return Response.json({ id: 'email_1' });
    if (u.includes('/orders/order_abc123/payments')) return Response.json({ items: [payment] });
    if (u.includes('/orders/order_abc123')) return Response.json({ id: 'order_abc123', notes: { product } });
    if (u.includes('/payments/pay_abc123456')) return Response.json(payment);
    if (u.includes('/payments?')) {
      const other = { ...payment, id: 'pay_other000001', order_id: 'order_other1', email: 'someone@else.com', contact: '+910000000000' };
      return Response.json({ items: [other, payment] });
    }
    return new Response('nope', { status: 404 });
  });
  return calls;
};

test.beforeEach(() => resetRateLimits());

test('payment ID recovery (also for buyers from before this change) gives an access link', async (t) => {
  razorpay(t);
  const res = await (await recover({ env, request: post({ paymentId: 'pay_abc123456' }) })).json();
  assert.equal(res.paid, true);
  assert.match(res.accessUrl, /^https:\/\/example\.test\/MasterClipTool\/access\?token=pay_abc123456\./);
  const token = new URL(res.accessUrl).searchParams.get('token');
  const go = await download({ env, request: new Request(`${origin}/api/masterclip/download?token=${encodeURIComponent(token)}`) }); // no cookie
  assert.equal(go.status, 302);
});

test('coming back from the UPI app finds the paid order', async (t) => {
  razorpay(t);
  const res = await (await recover({ env, request: post({ orderId: 'order_abc123' }) })).json();
  assert.equal(res.paid, true);
  assert.ok(res.accessUrl);
});

test('email or phone used at checkout finds the purchase', async (t) => {
  razorpay(t);
  for (const input of [{ email: 'Buyer@Example.com' }, { phone: '98765 43210' }, { phone: '+91-9876543210' }]) {
    const res = await (await recover({ env, request: post(input) })).json();
    assert.equal(res.paid, true, JSON.stringify(input));
    assert.equal(res.paymentId, 'pay_abc123456');
    assert.equal(res.emailed, false);
  }
  const miss = await recover({ env, request: post({ email: 'nobody@example.com' }) });
  assert.equal(miss.status, 404);
  assert.equal((await recover({ env, request: post({}) })).status, 400);
});

test('with Resend configured, an email/phone lookup also emails the link to the buyer', async (t) => {
  const calls = razorpay(t);
  const mailEnv = { ...env, RESEND_API_KEY: 're_test', MASTERCLIP_EMAIL_FROM: 'MasterClip <hello@example.com>' };
  const res = await (await recover({ env: mailEnv, request: post({ phone: '9876543210' }) })).json();
  assert.equal(res.emailed, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const mail = calls.find((c) => c.url.includes('api.resend.com'));
  assert.ok(mail);
  const body = JSON.parse(mail.init.body);
  assert.deepEqual(body.to, ['buyer@example.com']);
  assert.match(body.text, /MasterClipTool\/access\?token=pay_abc123456\./);
  assert.equal(mail.init.headers.authorization, 'Bearer re_test');
});

test('email/phone lookups are rate limited per IP', async (t) => {
  razorpay(t);
  const statuses = [];
  for (let i = 0; i < 10; i += 1) statuses.push((await recover({ env, request: post({ email: `x${i}@example.com` }, '2.2.2.2') })).status);
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(404));
  assert.equal(statuses[8], 429);
  // A different visitor is not affected.
  assert.equal((await recover({ env, request: post({ email: 'buyer@example.com' }, '3.3.3.3') })).status, 200);
});

test('other products, wrong amounts and forged links get nothing', async (t) => {
  razorpay(t, { product: 'vertical-clipper' });
  assert.equal((await recover({ env, request: post({ paymentId: 'pay_abc123456' }) })).status, 404);
  assert.equal((await recover({ env, request: post({ email: 'buyer@example.com' }) })).status, 404);
  t.mock.restoreAll();
  razorpay(t, { amount: 100 });
  assert.equal((await (await recover({ env, request: post({ orderId: 'order_abc123' }) })).json()).paid, false);
  const forged = await download({ env, request: new Request(origin + '/api/masterclip/download?t=9999999999.pay_abc123456.deadbeef') });
  assert.equal(forged.status, 401);
  const forgedNew = await download({ env, request: new Request(origin + '/api/masterclip/download?token=pay_abc123456.9999999999.' + 'ab'.repeat(32)) });
  assert.equal(forgedNew.status, 401);
});
