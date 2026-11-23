import assert from 'node:assert/strict';
import test from 'node:test';
import { signAccessToken, verifyAccessToken } from '../../site/functions/_lib/masterclip-access.mjs';
import { hmacHex } from '../../site/functions/_lib/razorpay.mjs';
import { onRequestGet as guide, onRequestHead as guideHead, parseRange } from '../../site/functions/api/masterclip/guide.js';
import { onRequestGet as accessPage } from '../../site/functions/MasterClipTool/access.js';
import { onRequestPost as callback } from '../../site/functions/api/masterclip/callback.js';
import { onRequestPost as webhook } from '../../site/functions/api/masterclip/webhook.js';
import { androidIntentUrl, detectInApp } from '../../site/inapp.js';

const PDF = new TextEncoder().encode('%PDF-1.4\n% placeholder MasterClip guide for tests\n%%EOF\n');
function fakeBucket(bytes = PDF, key = 'MasterClip-Guide.pdf') {
  return {
    async head(k) { return k === key ? { size: bytes.length, httpEtag: '"etag1"' } : null; },
    async get(k, options) {
      if (k !== key) return null;
      const part = options?.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes;
      return { body: new Blob([part]).stream(), size: bytes.length };
    },
  };
}
const env = { RAZORPAY_KEY_ID: 'rzp_test_example', RAZORPAY_KEY_SECRET: 'fixture-secret', MASTERCLIP_FILES: fakeBucket() };
const origin = 'https://example.test';
const PAY = 'pay_abc123456';

// ---------- tokens

test('access tokens verify, last about a year, and reject tampering, expiry and revocation', async () => {
  const token = await signAccessToken(env, PAY);
  assert.equal(await verifyAccessToken(env, token), PAY);
  const [, expires, sig] = token.split('.');
  assert.ok(Number(expires) - Date.now() / 1000 > 360 * 86400);
  assert.equal(await verifyAccessToken(env, `pay_zzz999999.${expires}.${sig}`), null, 'other payment id');
  assert.equal(await verifyAccessToken(env, `${PAY}.${Number(expires) + 1}.${sig}`), null, 'extended expiry');
  assert.equal(await verifyAccessToken(env, `${PAY}.${expires}.${'0'.repeat(64)}`), null, 'bad signature');
  assert.equal(await verifyAccessToken(env, ''), null);
  assert.equal(await verifyAccessToken(env, 'garbage'), null);
  assert.equal(await verifyAccessToken({ ...env, RAZORPAY_KEY_SECRET: 'other' }, token), null, 'other secret');
  const old = await signAccessToken(env, PAY, Date.now() - 400 * 86400000);
  assert.equal(await verifyAccessToken(env, old), null, 'expired');
  assert.equal(await verifyAccessToken({ ...env, MASTERCLIP_REVOKED: 'pay_x1234567, pay_abc123456' }, token), null, 'revoked (refund)');
  await assert.rejects(() => signAccessToken(env, 'not-a-payment'));
});

test('a dedicated MASTERCLIP_ACCESS_SECRET survives a Razorpay key change; old links still verify', async () => {
  const before = await signAccessToken(env, PAY); // signed with the Razorpay secret
  const withSecret = { ...env, MASTERCLIP_ACCESS_SECRET: 'long-random-access-secret' };
  assert.equal(await verifyAccessToken(withSecret, before), PAY);
  const after = await signAccessToken(withSecret, PAY);
  // Switch Razorpay test -> live keys: links signed with the access secret keep working.
  assert.equal(await verifyAccessToken({ ...withSecret, RAZORPAY_KEY_SECRET: 'live-secret' }, after), PAY);
  assert.equal(await verifyAccessToken({ MASTERCLIP_ACCESS_SECRET: '', RAZORPAY_KEY_SECRET: 'x' }, after), null);
  assert.equal(await verifyAccessToken({ ...env, MASTERCLIP_ACCESS_DAYS: '30' }, await signAccessToken({ ...env, MASTERCLIP_ACCESS_DAYS: '30' }, PAY)), PAY);
});

// ---------- in-app browser detection

test('in-app browsers are detected; normal browsers are not', () => {
  const cases = [
    ['Mozilla/5.0 (Linux; Android 13; SM-A515F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0 Mobile Safari/537.36 Instagram 307.0.0.34.111 Android', true, 'Instagram', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 308.0.2.18.106 (iPhone14,5; iOS 17_1)', true, 'Instagram', 'ios'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone12,1;FBMD/iPhone;FBSN/iOS;FBSV/16.6;FBSS/2;FBID/phone;FBLC/en_US;FBOP/5]', true, 'Facebook', 'ios'],
    ['Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/439.0.0.29.119;]', true, 'Facebook', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.16.0', true, 'Line', 'ios'],
    ['Mozilla/5.0 (Linux; Android 11; RMX2001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0 Mobile Safari/537.36', true, 'an app', 'android'],
    ['Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36', false, '', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1', false, '', 'ios'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36', false, '', 'other'],
    ['', false, '', 'other'],
  ];
  for (const [ua, inApp, app, os] of cases) assert.deepEqual(detectInApp(ua), { inApp, app, os }, ua);
});

test('the Android intent link reopens the same page in Chrome with a fallback', () => {
  const url = 'https://masterprompt.anintellectualcompany.com/MasterClipTool/?ref=akshat';
  assert.equal(androidIntentUrl(url), `intent://masterprompt.anintellectualcompany.com/MasterClipTool/?ref=akshat#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`);
});

// ---------- PDF route

const guideReq = async (query = '', headers = {}) => new Request(`${origin}/api/masterclip/guide${query}`, { headers });

test('the guide PDF needs a valid token', async () => {
  for (const query of ['', '?token=', `?token=${PAY}.9999999999.${'ab'.repeat(32)}`]) {
    const res = await guide({ env, request: await guideReq(query) });
    assert.equal(res.status, 401, query);
    assert.notEqual(res.headers.get('content-type'), 'application/pdf');
  }
});

test('a valid token streams the PDF as an attachment, or inline for in-app browsers', async () => {
  const token = encodeURIComponent(await signAccessToken(env, PAY));
  const res = await guide({ env, request: await guideReq(`?token=${token}`) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="MasterClip-Complete-Guide.pdf"');
  assert.equal(res.headers.get('content-length'), String(PDF.length));
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PDF);
  const inline = await guide({ env, request: await guideReq(`?token=${token}&inline=1`) });
  assert.equal(inline.headers.get('content-disposition'), 'inline; filename="MasterClip-Complete-Guide.pdf"');
  const head = await guideHead({ env, request: await guideReq(`?token=${token}`) });
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
});

test('range requests return partial content for mobile PDF viewers', async () => {
  const token = encodeURIComponent(await signAccessToken(env, PAY));
  const part = await guide({ env, request: await guideReq(`?token=${token}`, { range: 'bytes=0-7' }) });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-7/${PDF.length}`);
  assert.equal(new TextDecoder().decode(await part.arrayBuffer()), '%PDF-1.4');
  const bad = await guide({ env, request: await guideReq(`?token=${token}`, { range: `bytes=${PDF.length + 5}-` }) });
  assert.equal(bad.status, 416);
  assert.deepEqual(parseRange('bytes=-5', 100), { offset: 95, length: 5 });
  assert.deepEqual(parseRange('bytes=10-', 100), { offset: 10, length: 90 });
  assert.equal(parseRange('items=1-2', 100), null);
});

test('missing storage or file gives a clear 503 with the support email, never a public file', async () => {
  const token = encodeURIComponent(await signAccessToken(env, PAY));
  const noBucket = await guide({ env: { ...env, MASTERCLIP_FILES: undefined }, request: await guideReq(`?token=${token}`) });
  assert.equal(noBucket.status, 503);
  const noFile = await guide({ env: { ...env, MASTERCLIP_FILES: fakeBucket(PDF, 'other.pdf') }, request: await guideReq(`?token=${token}`) });
  assert.equal(noFile.status, 503);
  assert.match(await noFile.text(), /anintellectualcompany\.contact@gmail\.com/);
  const customKey = await guide({ env: { ...env, MASTERCLIP_GUIDE_KEY: 'v2.pdf', MASTERCLIP_FILES: fakeBucket(PDF, 'v2.pdf') }, request: await guideReq(`?token=${token}`) });
  assert.equal(customKey.status, 200);
});

// ---------- access page

test('the access page shows the guide, the installer and a copyable link; bad links get recovery help', async () => {
  const token = await signAccessToken(env, PAY);
  const url = `${origin}/MasterClipTool/access?token=${encodeURIComponent(token)}`;
  const res = await accessPage({ env, request: new Request(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' } }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('cache-control'), /no-store/);
  const html = await res.text();
  assert.ok(html.includes(`/api/masterclip/guide?token=${encodeURIComponent(token)}`));
  assert.ok(html.includes('&amp;inline=1'));
  assert.ok(html.includes('https://github.com/AnIntellectualBeing/MasterClip/releases/latest/download/MasterClipSetup.exe'));
  assert.ok(html.includes(`value="${url}"`));
  assert.ok(html.includes('anintellectualcompany.contact@gmail.com'));
  assert.ok(!html.includes('<script>'), 'no inline scripts (CSP)');
  assert.ok(!html.includes('ig-tip'));

  const insta = await (await accessPage({ env, request: new Request(url, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13; wv) Instagram 307.0' } }) })).text();
  assert.ok(insta.includes('intent://example.test/MasterClipTool/access'));

  const bad = await accessPage({ env, request: new Request(`${origin}/MasterClipTool/access?token=nope`) });
  assert.equal(bad.status, 401);
  assert.match(await bad.text(), /download-ready/);
});

// ---------- Razorpay redirect callback (used in in-app browsers)

const form = (fields) => new Request(`${origin}/api/masterclip/callback`, { method: 'POST', body: new URLSearchParams(fields) });

test('the redirect callback sends a paid buyer straight to the access page', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: PAY, status: 'captured', order_id: 'order_cb12345', amount: 34900, currency: 'INR' }));
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, `order_cb12345|${PAY}`);
  const res = await callback({ env, request: form({ razorpay_payment_id: PAY, razorpay_order_id: 'order_cb12345', razorpay_signature: signature }) });
  assert.equal(res.status, 303);
  const location = res.headers.get('location');
  assert.match(location, /^https:\/\/example\.test\/MasterClipTool\/access\?token=pay_abc123456\./);
  assert.equal(await verifyAccessToken(env, new URL(location).searchParams.get('token')), PAY);
});

test('the callback never grants access on a bad signature, and handles failures and pending captures', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: PAY, status: 'authorized', order_id: 'order_cb12345', amount: 34900, currency: 'INR' }));
  const forged = await callback({ env, request: form({ razorpay_payment_id: PAY, razorpay_order_id: 'order_cb12345', razorpay_signature: 'ab'.repeat(32) }) });
  assert.doesNotMatch(forged.headers.get('location'), /access\?token=/);
  const signature = await hmacHex(env.RAZORPAY_KEY_SECRET, `order_cb12345|${PAY}`);
  const pending = await callback({ env, request: form({ razorpay_payment_id: PAY, razorpay_order_id: 'order_cb12345', razorpay_signature: signature }) });
  assert.equal(pending.headers.get('location'), `/MasterClipTool/download-ready?order=order_cb12345&pay=${PAY}`);
  const failed = await callback({ env, request: form({ 'error[code]': 'BAD_REQUEST_ERROR', 'error[metadata]': JSON.stringify({ order_id: 'order_cb12345' }) }) });
  assert.equal(failed.headers.get('location'), '/MasterClipTool/?payment=failed&order=order_cb12345#buy');
});

// ---------- optional webhook + email

test('the webhook checks the Razorpay signature and emails the access link once', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('api.resend.com')) return Response.json({ id: 'email_1' });
    return Response.json({ id: 'order_wh12345', notes: { product: 'masterclip-windows' } });
  });
  const hookEnv = { ...env, RAZORPAY_WEBHOOK_SECRET: 'whsec', RESEND_API_KEY: 're_test', MASTERCLIP_EMAIL_FROM: 'MasterClip <hello@example.com>' };
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: PAY, status: 'captured', amount: 34900, currency: 'INR', order_id: 'order_wh12345', email: 'buyer@example.com' } } } });
  const send = async (signature, e = hookEnv) => webhook({ env: e, request: new Request(`${origin}/api/masterclip/webhook`, { method: 'POST', headers: { 'x-razorpay-signature': signature }, body: raw }) });
  assert.equal((await send('ab'.repeat(32))).status, 400);
  assert.equal(calls.length, 0);
  const ok = await send(await hmacHex('whsec', raw));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).emailed, true);
  const mail = calls.find((c) => c.url.includes('api.resend.com'));
  assert.deepEqual(JSON.parse(mail.init.body).to, ['buyer@example.com']);
  assert.equal((await send(await hmacHex('whsec', raw), env)).status, 404, 'off without the webhook secret');
});

test('the guide can be served from Workers KV when there is no R2 bucket', async () => {
  const kv = { async get(k, type) { return k === 'MasterClip-Guide.pdf' && type === 'arrayBuffer' ? PDF.buffer.slice(PDF.byteOffset, PDF.byteOffset + PDF.byteLength) : null; } };
  const kvEnv = { ...env, MASTERCLIP_FILES: undefined, MASTERCLIP_KV: kv };
  const token = encodeURIComponent(await signAccessToken(kvEnv, PAY));
  const full = await guide({ env: kvEnv, request: await guideReq(`?token=${token}`) });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-length'), String(PDF.length));
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), PDF);
  const part = await guide({ env: kvEnv, request: await guideReq(`?token=${token}`, { range: 'bytes=0-7' }) });
  assert.equal(part.status, 206);
  assert.equal(new TextDecoder().decode(await part.arrayBuffer()), '%PDF-1.4');
  const missing = await guide({ env: { ...kvEnv, MASTERCLIP_GUIDE_KEY: 'nope.pdf' }, request: await guideReq(`?token=${token}`) });
  assert.equal(missing.status, 503);
});
