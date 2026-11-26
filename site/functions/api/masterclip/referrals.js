import { razorpayAuth, constantTimeHexEqual, hmacHex } from '../../_lib/razorpay.mjs';
import { ANDROID_PRODUCT, acceptsProductAmount, isKnownAmount } from '../../_lib/masterclip.mjs';

// Private owner report: paid MasterClip sales per referral code.
//   /api/masterclip/referrals?key=<MASTERCLIP_REPORT_KEY>
// Reads Razorpay directly (captured ₹249 payments on MasterClip orders, last ~400 days).
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const page = (body, status = 200) => new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>MasterClip referrals</title>
<style>body{font:16px/1.5 system-ui,Arial,sans-serif;margin:0;background:#fbf8f5;color:#1f1b1a}main{max-width:760px;margin:0 auto;padding:28px 16px}h1{font-size:26px;margin:0 0 6px}p{color:#635b57}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #ebe2dc;border-radius:12px;overflow:hidden;margin:16px 0}th,td{text-align:left;padding:10px 12px;border-top:1px solid #ebe2dc}th{background:#f4ede8;font-size:13px;border-top:0}td.n{text-align:right;font-variant-numeric:tabular-nums}code{background:#f4ede8;padding:1px 5px;border-radius:5px;font-size:13px}</style></head><body><main>${body}</main></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' } });

async function rzp(env, path) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { authorization: razorpayAuth(env) } });
  return response.ok ? response.json() : null;
}

export async function referralReport(env, { days = 400, maxPages = 10, now = Date.now() } = {}) {
  const from = Math.floor(now / 1000) - days * 86400;
  const orders = new Map();
  const rows = new Map();
  for (let p = 0; p < maxPages; p += 1) {
    const list = await rzp(env, `payments?count=100&skip=${p * 100}&from=${from}`);
    const items = list?.items || [];
    for (const pay of items) {
      if (pay.status !== 'captured' || !isKnownAmount(pay.amount) || !pay.order_id) continue;
      if (!orders.has(pay.order_id)) orders.set(pay.order_id, await rzp(env, `orders/${encodeURIComponent(pay.order_id)}`));
      const order = orders.get(pay.order_id);
      const product = order?.notes?.product;
      if (!acceptsProductAmount(product, pay.amount)) continue;
      const code = order.notes.referral_code || pay.notes?.referral_code || '(no referral)';
      const row = rows.get(code) || { code, sales: 0, phone: 0, rupees: 0, refunded: 0, last: 0 };
      if (pay.amount_refunded > 0) row.refunded += 1;
      else {
        row.sales += 1;
        row.rupees += Number(pay.amount) / 100;
        if (product === ANDROID_PRODUCT) row.phone += 1;
      }
      row.last = Math.max(row.last, pay.created_at || 0);
      rows.set(code, row);
    }
    if (items.length < 100) break;
  }
  return [...rows.values()].sort((a, b) => b.sales - a.sales);
}

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key') || '';
  const want = env.MASTERCLIP_REPORT_KEY || '';
  const ok = want.length >= 16 && constantTimeHexEqual(await hmacHex('report', key), await hmacHex('report', want));
  if (!ok) return page('<h1>Not found</h1>', 404);
  let rows;
  try { rows = await referralReport(env); } catch { return page('<h1>Razorpay did not answer</h1><p>Reload in a minute.</p>', 502); }
  const total = rows.reduce((s, r) => s + r.sales, 0);
  const rupees = rows.reduce((s, r) => s + r.rupees, 0);
  const date = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '–');
  const body = `<h1>MasterClip referrals</h1><p>Paid MasterClip sales per referral link: ₹249 kit and ₹149 phone app (live from Razorpay, refunds counted separately). Total paid: <b>${total}</b> · ₹${rupees.toLocaleString('en-IN')}</p>
<table><tr><th>Referral</th><th class="n">Paid</th><th class="n">of which phone</th><th class="n">₹</th><th class="n">Refunded</th><th>Last sale</th></tr>
${rows.map((r) => `<tr><td><code>${esc(r.code)}</code></td><td class="n">${r.sales}</td><td class="n">${r.phone}</td><td class="n">${r.rupees.toLocaleString('en-IN')}</td><td class="n">${r.refunded}</td><td>${date(r.last)}</td></tr>`).join('') || '<tr><td colspan="6">No paid sales yet.</td></tr>'}
</table><p>In Razorpay: Orders → open an order → Notes shows <code>referral_code</code>.</p>`;
  return page(body);
}
