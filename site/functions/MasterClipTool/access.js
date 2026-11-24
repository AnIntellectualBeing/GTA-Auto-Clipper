import { SUPPORT_EMAIL, masterclipDownloadUrl } from '../_lib/masterclip.mjs';
import { verifyAccessToken } from '../_lib/masterclip-access.mjs';
import { androidIntentUrl, detectInApp } from '../../inapp.js';

// /MasterClipTool/access?token=...  The buyer's durable, bookmarkable downloads page.
// Rendered on the server so it works without cookies, storage, popups or even JavaScript.
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

const support = `<p class="support-note">Anything not working? Email <a href="mailto:${SUPPORT_EMAIL}?subject=MasterClip%20help">${SUPPORT_EMAIL}</a> with your payment ID (pay_…) and we'll sort it out.</p>`;

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
    <a class="brand" href="/MasterClipTool/"><span class="brand-mark">M</span><span>MASTER<b>CLIP</b></span></a>
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
    : os === 'ios'
      ? 'Tap <b>•••</b> (top right) → <b>Open in external browser</b> (or <b>Open in Safari</b>).'
      : 'Use the menu to open this page in your normal browser.';
  return `<div class="ig-tip" role="note">📱 You're inside ${esc(app)}'s browser, which often blocks downloads. ${how} Your link below works in any browser, so you can also copy it.</div>`;
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const paymentId = await verifyAccessToken(env, token);
  if (!paymentId) {
    return new Response(page('Link not valid · MasterClip', `
      <p class="eyebrow">MASTERCLIP · YOUR DOWNLOADS</p>
      <h1>This link isn't valid anymore.</h1>
      <p class="download-intro">It may be incomplete (copy the whole link) or expired. Get a fresh link in a few seconds with your payment ID (pay_…) or the email/phone you paid with. Please don't pay again.</p>
      <div class="dl-stack"><a class="button button-buy" href="/MasterClipTool/download-ready">Get a fresh link</a></div>
      ${support}`), { status: 401, headers: SECURITY_HEADERS });
  }
  const self = new URL(request.url);
  const url = `${self.origin}/MasterClipTool/access?token=${encodeURIComponent(token)}`;
  const guide = `/api/masterclip/guide?token=${encodeURIComponent(token)}`;
  const installer = masterclipDownloadUrl(env);
  const share = encodeURIComponent(`My MasterClip downloads (guide + installer): ${url}`);
  return new Response(page('Your MasterClip downloads', `
      <div class="download-check" aria-hidden="true">✓</div>
      <p class="eyebrow">MASTERCLIP · YOUR DOWNLOADS</p>
      <h1>Thank you! Your downloads are ready.</h1>
      <p class="download-intro">This page is yours. Bookmark it or save the link below: it works on any phone or PC, in any browser.</p>
      ${inAppTip(request)}
      <p class="dl-label">EVERYTHING IN ONE (.ZIP)</p>
      <div class="dl-stack">
        <a class="button button-buy" href="${esc(guide)}&amp;file=kit" download>Download everything (.zip)<b>↓</b></a>
      </div>
      <p class="download-hint">The guide PDF, START-HERE.txt, and shortcuts to the Windows app, the source code and support. The app itself (337 MB) downloads from the shortcut or the button below. Or get each file on its own:</p>
      <p class="dl-label">1 · THE COMPLETE GUIDE (PDF)</p>
      <div class="dl-stack">
        <a class="button button-buy" href="${esc(guide)}" download>Download the guide (PDF)<b>↓</b></a>
        <a class="button button-secondary" href="${esc(guide)}&amp;inline=1">Open the guide in the browser</a>
      </div>
      <p class="download-hint">Download not starting (common inside Instagram)? Use "Open the guide in the browser", then save or share it from there.</p>
      <p class="dl-label">2 · MASTERCLIP FOR WINDOWS (FREE APP)</p>
      <div class="dl-stack">
        <a class="button button-dark" href="${esc(installer)}" rel="noreferrer">Download MasterClip for Windows (.exe)<small>Windows 10/11 PC · about 337 MB</small></a>
      </div>
      <p class="download-hint">Installer not working? Get the newest version from the official site: <a href="https://anintellectualcompany.com/software/MasterClip-Tool/" rel="noreferrer" target="_blank">anintellectualcompany.com/software/MasterClip-Tool</a></p>
      <p class="dl-label">3 · START HERE (BEGINNER STEPS, .TXT)</p>
      <div class="dl-stack">
        <a class="button button-secondary" href="/MasterClipTool/START-HERE.txt" download="MasterClip-START-HERE.txt">Download START-HERE.txt</a>
      </div>
      <p class="dl-label">4 · SOURCE CODE (FOR DEVELOPERS)</p>
      <div class="dl-stack">
        <a class="button button-secondary" href="https://github.com/AnIntellectualBeing/MasterClip/archive/refs/heads/main.zip" rel="noreferrer">Download the source code (.zip)</a>
        <a class="button button-secondary" href="https://github.com/AnIntellectualBeing/MasterClip" rel="noreferrer" target="_blank">Open the code on GitHub</a>
      </div>
      <p class="download-hint">Only needed if you want to build or change the app yourself. Everyone else: use the .exe above.</p>
      <ol class="steps-after">
        <li>1. On your Windows PC, run <b>MasterClipSetup.exe</b>. If Windows says "unknown publisher", click <b>More info → Run anyway</b>.</li>
        <li>2. Open the guide and follow it step by step.</li>
        <li>On your phone now? Save this link and open it later on your PC.</li>
      </ol>
      <div class="save-box">
        <h2>Save your link</h2>
        <p>Keep this link to download again any time.</p>
        <div class="link-box"><input id="access-url" readonly value="${esc(url)}" aria-label="Your access link"><button type="button" id="copy-access" data-copy="access-url">Copy</button></div>
        <div class="share-row">
          <a href="mailto:?subject=${encodeURIComponent('My MasterClip downloads')}&amp;body=${share}">Email it to myself</a>
          <a href="https://wa.me/?text=${share}" rel="noreferrer">Send to myself on WhatsApp</a>
        </div>
        <p class="pay-ref">Payment ID: <b id="payment-id">${esc(paymentId)}</b></p>
      </div>
      ${support}
      <script src="/masterclip-access.js?v=1" defer></script>`), { status: 200, headers: SECURITY_HEADERS });
}
