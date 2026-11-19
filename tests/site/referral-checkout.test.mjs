import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { onRequestPost as createGuideOrder } from '../../site/functions/api/create-order.js';
import { onRequestPost as createClipperOrder } from '../../site/functions/api/verticalclipper/create-order.js';
import { onRequestPost as verifyClipperPayment } from '../../site/functions/api/verticalclipper/verify-payment.js';
import { onRequestGet as downloadClipper } from '../../site/functions/api/verticalclipper/download.js';
import { hmacHex } from '../../site/functions/_lib/razorpay.mjs';
import { rememberReferral } from '../../site/referral.js';

const zip = Buffer.from('UEsDBBQAAAAAADMVdF0q3jQ7CgAAAAoAAAAJAAAAZ3VpZGUudHh0dGVzdCBndWlkZVBLAQIUABQAAAAAADMVdF0q3jQ7CgAAAAoAAAAJAAAAAAAAAAAAAACAAQAAAABndWlkZS50eHRQSwUGAAAAAAEAAQA3AAAAMQAAAAAA', 'base64');
const packed = gzipSync(zip).toString('base64');
const env = {
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'fixture-secret',
  GUIDE_CONTENT_GZIP_BASE64: packed,
  VERTICAL_CLIPPER_CONTENT_GZIP_BASE64: packed,
};
const origin = 'https://example.test';

function post(path, input) {
  return new Request(origin + path, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

test('both checkouts attach the creator to the Razorpay order at the product price', async (t) => {
  let order;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.razorpay.com/v1/orders');
    order = JSON.parse(init.body);
    return Response.json({ id: 'order_test', amount: order.amount, currency: 'INR' });
  });

  for (const [create, path, amount, product] of [
    [createGuideOrder, '/api/create-order', 14900, 'gta-auto-clipper-guide'],
    [createClipperOrder, '/api/verticalclipper/create-order', 19900, 'gta-face-clipper-complete-toolkit'],
  ]) {
    for (const [referralCode, expected] of [['Priya_27', 'priya_27'], ['invalid code!', undefined], [undefined, undefined]]) {
      const response = await create({ env, request: post(path, { referralCode, amount: 1 }) });
      assert.equal(response.status, 200);
      assert.equal(order.amount, amount);
      assert.deepEqual(order.notes, expected ? { product, referral_code: expected } : { product });
    }
    const restrictedEnv = { ...env, REFERRAL_CODES: 'priya_27, rahul' };
    const response = await create({ env: restrictedEnv, request: post(path, { referralCode: 'unknown' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(order.notes, { product });
  }
});

test('the clipper checkout redirects after verification and the button downloads the protected ZIP', async (t) => {
  const page = await readFile(new URL('../../site/verticalclipper/download-ready.html', import.meta.url), 'utf8');
  const downloadPath = '/api/verticalclipper/download';
  assert.match(page, /id="download-link" href="\/api\/verticalclipper\/download"/);
  let paymentHandler;
  let buy;
  let redirect;
  let cookie;
  const buyButton = { addEventListener: (_, listener) => { buy = listener; } };
  const status = { classList: { toggle() {} } };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousRazorpay = globalThis.Razorpay;
  globalThis.document = {
    cookie: '',
    querySelector: (selector) => selector === '#buy-button' ? buyButton : status,
  };
  globalThis.window = {
    location: { search: '?ref=priya_27', replace: (path) => { redirect = path; } },
    Razorpay: class {
      constructor(options) { paymentHandler = options.handler; }
      on() {}
      open() {}
    },
  };
  globalThis.Razorpay = globalThis.window.Razorpay;
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.Razorpay = previousRazorpay;
  });
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    if (path === '/api/verticalclipper/create-order') {
      assert.equal(JSON.parse(init.body).referralCode, 'priya_27');
      return Response.json({ orderId: 'order_test', amount: 19900, currency: 'INR' });
    }
    if (path === '/api/verticalclipper/verify-payment') {
      const response = await verifyClipperPayment({ env, request: new Request(origin + path, init) });
      cookie = response.headers.get('set-cookie')?.split(';')[0];
      return response;
    }
    assert.equal(path, 'https://api.razorpay.com/v1/payments/pay_test');
    return Response.json({ status: 'captured', order_id: 'order_test', amount: 19900 });
  });

  assert.equal((await downloadClipper({ env, request: new Request(origin + downloadPath) })).status, 401);
  await import('../../site/verticalclipper.js');
  await buy();
  assert.match(globalThis.document.cookie, /referral_code=priya_27/);
  globalThis.window.location.search = '';
  assert.equal(rememberReferral(), 'priya_27');
  assert.equal(redirect, undefined);
  await paymentHandler({
    razorpay_order_id: 'order_test',
    razorpay_payment_id: 'pay_test',
    razorpay_signature: await hmacHex(env.RAZORPAY_KEY_SECRET, 'order_test|pay_test'),
  });
  assert.equal(redirect, '/verticalclipper/download-ready');
  const file = await downloadClipper({ env, request: new Request(origin + downloadPath, { headers: { cookie } }) });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /GTA-Face-Clipper-Complete-Tool-Pack\.zip/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), zip);
});
