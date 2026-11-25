import { rememberReferral } from './referral.js';
import { androidIntentUrl, detectInApp } from './inapp.js';

const ORDER_KEY = 'masterclip.order';
const ACCESS_KEY = 'masterclip.access';
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
};
const $ = (selector) => document.querySelector(selector);

const referralCode = rememberReferral();
// <body data-product="android"> is the ₹149 phone-app page; every other page sells the ₹349 kit.
const android = document.body.dataset.product === 'android';
const buttons = [...document.querySelectorAll('[data-buy]')];
const status = $('#payment-status');
const emailInput = $('#buyer-email');
const phoneInput = $('#buyer-phone');
function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('payment-error', error);
}
function setBusy(busy) {
  for (const button of buttons) button.disabled = busy;
}

// ---- In-app browser (Instagram, Facebook, ...) banner: switch to a real browser before paying.
const browser = detectInApp(navigator.userAgent);
let warnedInApp = false;
const banner = $('#inapp-banner');
if (browser.inApp && banner) {
  banner.hidden = false;
  for (const el of banner.querySelectorAll('[data-app-name]')) el.textContent = browser.app;
  const chrome = $('#open-chrome');
  const ios = $('#inapp-ios');
  if (browser.os === 'android' && chrome) {
    chrome.hidden = false;
    chrome.href = androidIntentUrl(window.location.href);
  } else if (ios) ios.hidden = false;
  $('#copy-page-link')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const done = () => { button.textContent = 'Link copied ✓ Paste it in Chrome/Safari'; };
    try { await navigator.clipboard.writeText(window.location.href); done(); } catch {
      const field = document.createElement('input');
      field.value = window.location.href;
      document.body.append(field);
      field.select();
      try { document.execCommand('copy'); done(); } catch { button.textContent = window.location.href; }
      field.remove();
    }
  });
  $('#buy-here-anyway')?.addEventListener('click', () => {
    warnedInApp = true;
    banner.hidden = true;
    $('#buy')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ---- Already bought in this browser? Show the way back to the downloads page.
const saved = store.get(ACCESS_KEY);
if (saved?.url && /\/(MasterClipTool|MasterClipPhone)\/access\?token=/.test(saved.url)) {
  const link = $('#already-bought');
  if (link) { link.href = saved.url; link.hidden = false; }
}

const params = new URLSearchParams(window.location.search);
setBusy(false);
if (params.get('payment') === 'failed') {
  setStatus('The payment did not complete, so nothing was charged for this try. You can try again. If money was deducted, open "Already purchased?" below or email us.', true);
} else {
  setStatus('Secure Razorpay checkout · your private download page opens right after payment.');
}

function buyerDetails() {
  const email = (emailInput?.value || '').trim();
  const phone = (phoneInput?.value || '').replace(/[^\d+]/g, '');
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    setStatus('That email does not look right. Fix it, or leave it empty.', true);
    emailInput?.focus();
    return null;
  }
  if (phone && phone.replace(/\D/g, '').length < 10) {
    setStatus('Please check your phone number (10 digits), or leave it empty.', true);
    phoneInput?.focus();
    return null;
  }
  return { email, phone };
}

function rememberOrder(orderId) {
  store.set(ORDER_KEY, { orderId, at: Date.now() });
  // Also keep it in the address bar, so a reload in a browser that forgets storage still knows it.
  const url = new URL(window.location.href);
  url.searchParams.set('order', orderId);
  url.searchParams.delete('payment');
  try { history.replaceState(null, '', url); } catch { /* ignore */ }
}

function deliver(accessUrl, paymentId) {
  store.set(ACCESS_KEY, { url: accessUrl, paymentId, at: Date.now() });
  store.remove(ORDER_KEY);
  setStatus('Payment confirmed ✓ Opening your downloads…');
  window.location.replace(accessUrl);
}

async function buy() {
  document.querySelector('#buy')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (browser.inApp && !warnedInApp) {
    warnedInApp = true;
    banner?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus(`Tip: open this page in Chrome/Safari first for the smoothest download. Or tap the button again to pay here in ${browser.app}.`);
    return;
  }
  const buyer = buyerDetails();
  if (!buyer) return;
  if (!window.Razorpay) {
    setStatus('Razorpay checkout did not load. Refresh the page and try again.', true);
    return;
  }
  setBusy(true);
  setStatus('Starting secure checkout…');
  try {
    const created = await fetch('/api/masterclip/create-order', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referralCode, ...buyer, ...(android && { product: 'android' }) }),
    });
    const order = await created.json();
    if (!created.ok) throw new Error(order.error || 'Could not start checkout.');
    rememberOrder(order.orderId);
    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'MasterClip',
      description: android ? 'MasterClip for Android' : 'MasterClip Complete Guide + extras + support',
      order_id: order.orderId,
      prefill: { ...(buyer.email && { email: buyer.email }), ...(buyer.phone && { contact: buyer.phone }) },
      notes: { product: android ? 'masterclip-android' : 'masterclip-windows' },
      theme: { color: '#d83b2d' },
      handler: async (payment) => {
        try {
          setStatus('Verifying payment securely…');
          const verified = await fetch('/api/masterclip/verify-payment', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payment),
          });
          const result = await verified.json();
          if (verified.status === 202 || result.pending) { setStatus('Payment received. Confirming with the bank… this page will open your downloads by itself.'); setBusy(false); return; }
          if (!verified.ok || !result.accessUrl) throw new Error(result.error || 'Payment verification failed.');
          deliver(result.accessUrl, result.paymentId);
        } catch (error) {
          setStatus(`${error.message || 'Payment verification failed.'} If you were charged, use "Already purchased?" below with your payment ID.`, true);
          setBusy(false);
        }
      },
      modal: { ondismiss: () => { setBusy(false); setStatus('Checkout closed. If you already paid, wait here a few seconds: we check by ourselves.'); checkPending(); } },
    };
    // Inside Instagram/Facebook the JS callback is often lost: let Razorpay redirect the whole page
    // and POST the result to our server, which forwards to the access page.
    if (browser.inApp) {
      options.redirect = true;
      options.callback_url = `${window.location.origin}/api/masterclip/callback${android ? '?p=android' : ''}`;
    }
    const checkout = new window.Razorpay(options);
    checkout.on('payment.failed', (event) => {
      setStatus(event.error?.description || 'Payment did not complete. No download was released.', true);
      setBusy(false);
    });
    checkout.open();
  } catch (error) {
    setStatus(error.message || 'Checkout failed. Please retry.', true);
    setBusy(false);
  }
}

for (const button of buttons) button.addEventListener('click', buy);

// ---- UPI apps / Instagram: the buyer pays in another app and comes back to a page that never heard
// about it. We remember the order (storage + address bar) and ask the server until it's paid.
function pendingOrder() {
  const fromUrl = params.get('order');
  if (/^order_[A-Za-z0-9]{6,40}$/.test(fromUrl || '')) return fromUrl;
  const pending = store.get(ORDER_KEY);
  return pending && Date.now() - pending.at < 2 * 86400000 ? pending.orderId : null;
}
let checking = false;
async function checkPending() {
  const orderId = pendingOrder();
  if (!orderId || checking) return;
  checking = true;
  try {
    const response = await fetch('/api/masterclip/recover', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId }),
    });
    const result = await response.json();
    if (result.paid && result.accessUrl) deliver(result.accessUrl, result.paymentId);
  } catch { /* offline: try again later */ }
  checking = false;
}
checkPending();
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPending(); });
window.addEventListener('pageshow', () => checkPending());
setInterval(checkPending, 5000);
