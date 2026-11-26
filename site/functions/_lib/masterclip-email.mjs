import { ANDROID_PRODUCT, SUPPORT_EMAIL, cleanEmail } from './masterclip.mjs';

// Optional: email the access link through Resend (https://resend.com). Off until the owner adds
// the RESEND_API_KEY secret and MASTERCLIP_EMAIL_FROM (a sender on a domain verified in Resend).
export function emailEnabled(env) {
  return Boolean(env.RESEND_API_KEY && env.MASTERCLIP_EMAIL_FROM);
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function accessEmail(link, paymentId, product) {
  if (product === ANDROID_PRODUCT) {
    const text = [
      'Thank you for buying MasterClip for Android (₹149).',
      '',
      'Your download page is here. Bookmark this link; it works on any browser and device:',
      link,
      '',
      `Payment ID: ${paymentId}`,
      `Lost this link? Open https://masterprompt.anintellectualcompany.com/MasterClipTool/download-ready and enter your payment ID, or reply to ${SUPPORT_EMAIL}.`,
    ].join('\n');
    const html = `<p>Thank you for buying MasterClip for Android (₹149).</p>
<p>Your download page is ready. Bookmark it; it works on any browser and device.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#e44836;color:#fff;border-radius:8px;font-weight:700;text-decoration:none">Open my MasterClip download</a></p>
<p style="font-size:13px;color:#655e5a">Or copy this link: ${escapeHtml(link)}<br>Payment ID: ${escapeHtml(paymentId)}<br>Anything not working? Email ${SUPPORT_EMAIL} with your payment ID.</p>`;
    return { subject: 'Your MasterClip for Android download', text, html };
  }
  const text = [
    'Thank you for buying MasterClip (₹249).',
    '',
    'Your downloads (the Complete Guide PDF and the Windows installer) are here. Bookmark this link; it works on any browser and device:',
    link,
    '',
    `Payment ID: ${paymentId}`,
    `Lost this link? Open https://masterprompt.anintellectualcompany.com/MasterClipTool/download-ready and enter your payment ID, or reply to ${SUPPORT_EMAIL}.`,
  ].join('\n');
  const html = `<p>Thank you for buying MasterClip (₹249).</p>
<p>Your downloads (the Complete Guide PDF and the Windows installer) are on your access page. Bookmark it; it works on any browser and device.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#e44836;color:#fff;border-radius:8px;font-weight:700;text-decoration:none">Open my MasterClip downloads</a></p>
<p style="font-size:13px;color:#655e5a">Or copy this link: ${escapeHtml(link)}<br>Payment ID: ${escapeHtml(paymentId)}<br>Anything not working? Email ${SUPPORT_EMAIL} with your payment ID.</p>`;
  return { subject: 'Your MasterClip downloads', text, html };
}

export async function sendAccessEmail(env, to, link, paymentId, product) {
  const email = cleanEmail(to);
  if (!emailEnabled(env) || !email) return false;
  const { subject, text, html } = accessEmail(link, paymentId, product);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MASTERCLIP_EMAIL_FROM, to: [email], reply_to: SUPPORT_EMAIL, subject, text, html }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Runs a promise after the response when the platform allows it (Cloudflare waitUntil).
export function later(context, promise) {
  if (typeof context?.waitUntil === 'function') context.waitUntil(promise);
  else promise.catch(() => {});
}

// After checkout: email the link unless the Razorpay webhook is configured (then the webhook
// sends it, once, even if the buyer's page never comes back).
export function emailAfterCheckout(context, env, payment, link) {
  if (env.RAZORPAY_WEBHOOK_SECRET || !emailEnabled(env) || !payment?.email) return;
  later(context, sendAccessEmail(env, payment.email, link, payment.id, payment.product));
}
