import { SUPPORT_EMAIL } from '../_lib/masterclip.mjs';
import { verifyAccessTokenInfo } from '../_lib/masterclip-access.mjs';
import { androidIntentUrl, detectInApp } from '../../inapp.js';

// /MasterClipPhone/access?token=...  The ₹149 phone-app buyer's durable download page.
// Server-rendered, so it works without cookies, storage or JavaScript. Only the APK is offered:
// the guide and kit belong to the ₹249 purchase.
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SECURITY_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const support = `<p class="support-note">Anything not working? Email <a href="mailto:${SUPPORT_EMAIL}?subject=MasterClip%20Android%20help">${SUPPORT_EMAIL}</a> with your payment ID (pay_…) and we'll sort it out.</p>`;

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#fbf8f5">
  <meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/download-ready.css"><link rel="stylesheet" href="/masterclip-delivery.css?v=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
  <header class="topbar wrap">
    <a class="brand" href="/MasterClipPhone/"><span class="brand-mark">M</span><span>MASTER<b>CLIP</b></span></a>
    <a class="nav-cta" href="/MasterClipTool/download-ready">Find my purchase</a>
  </header>
  <main class="download-main wrap">
    <section class="download-card">${body}</section>
  </main>
</body>
</html>`;
}

function inAppTip(request) {
  const { inApp, app, os } = detectInApp(request.headers.get('user-agent'));
  if (!inApp) return '';
  const how = os === 'android'
    ? `<a href="${esc(androidIntentUrl(request.url))}">Open this page in Chrome</a>, or tap <b>⋮</b> (top right) → <b>Open in Chrome / external browser</b>.`
    : 'Use the menu to open this page in your normal browser.';
  return `<div class="ig-tip" role="note">📱 You're inside ${esc(app)}'s browser, which often blocks downloads. ${how} Your link below works in any browser, so you can also copy it.</div>`;
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const info = await verifyAccessTokenInfo(env, token);
  if (!info) {
    return new Response(page('Link not valid · MasterClip for Android', `
      <p class="eyebrow">MASTERCLIP FOR ANDROID · YOUR DOWNLOAD</p>
      <h1>This link isn't valid anymore.</h1>
      <p class="download-intro">It may be incomplete (copy the whole link) or expired. Get a fresh link in a few seconds with your payment ID (pay_…) or the email/phone you paid with. Please don't pay again.</p>
      <div class="dl-stack"><a class="button button-buy" href="/MasterClipTool/download-ready">Get a fresh link</a></div>
      ${support}`), { status: 401, headers: SECURITY_HEADERS });
  }
  const self = new URL(request.url);
  const url = `${self.origin}/MasterClipPhone/access?token=${encodeURIComponent(token)}`;
  const apk = `/api/masterclip/apk?token=${encodeURIComponent(token)}`;
  const share = encodeURIComponent(`My MasterClip for Android download: ${url}`);
  return new Response(page('Your MasterClip for Android download', `
      <div class="download-check" aria-hidden="true">✓</div>
      <p class="eyebrow">MASTERCLIP FOR ANDROID · YOUR DOWNLOAD</p>
      <h1>Thank you! Your app is ready.</h1>
      <p class="download-intro">This page is yours. Bookmark it or save the link below: new versions appear here, and it works on any phone or PC, in any browser.</p>
      ${inAppTip(request)}
      <p class="dl-label">MASTERCLIP FOR ANDROID (PHONE APP, .APK)</p>
      <div class="dl-stack">
        <a class="button button-buy" href="${esc(apk)}" download>Download MasterClip for Android<b>↓</b><small>Android 8 or newer · about 70 MB</small></a>
      </div>
      <ol class="steps-after">
        <li>1. Open the downloaded file. When Android asks, allow <b>Install unknown apps</b> for Chrome.</li>
        <li>2. Tap <b>Install</b>. If Play Protect warns, tap <b>More details → Install anyway</b>. The app is not on the Play Store, so this warning is normal.</li>
        <li>3. Open MasterClip, paste a YouTube or Twitch link, and make your first clip.</li>
      </ol>
      <p class="download-hint">Please don't share the file: it's sold only here. Posting to Instagram and YouTube uses your own free Zernio account.</p>
      <div class="save-box">
        <h2>Save your link</h2>
        <p>Keep this link to download again any time.</p>
        <div class="link-box"><input id="access-url" readonly value="${esc(url)}" aria-label="Your access link"><button type="button" id="copy-access" data-copy="access-url">Copy</button></div>
        <div class="share-row">
          <a href="mailto:?subject=${encodeURIComponent('My MasterClip for Android download')}&amp;body=${share}">Email it to myself</a>
          <a href="https://wa.me/?text=${share}" rel="noreferrer">Send to myself on WhatsApp</a>
        </div>
        <p class="pay-ref">Payment ID: <b id="payment-id">${esc(info.paymentId)}</b></p>
      </div>
      ${support}
      <script src="/masterclip-access.js?v=1" defer></script>`), { status: 200, headers: SECURITY_HEADERS });
}
