# MasterClip ₹349 delivery flow

Updated 2026-11-23. Site: `site/` (Cloudflare Pages project `gta-auto-clipper`), live at
https://masterprompt.anintellectualcompany.com/MasterClipTool/

## What went wrong before

Buyers came from Instagram and paid inside Instagram's in-app browser. Delivery relied on:

- a 24-hour `HttpOnly` cookie scoped to `/api/masterclip/download`. In-app browsers often lose cookies and storage between the Razorpay popup/UPI app and the page.
- the Razorpay JS `handler` callback. It is often lost when the UPI app takes over or the in-app browser reloads the page.
- `/MasterClipTool/download-ready`, whose recovery form and link display were in an **inline `<script>`**. The site CSP (`script-src 'self' https://checkout.razorpay.com`) blocks inline scripts, so that page's JavaScript never ran. The recovery form just reloaded the page and the saved link never appeared. This is now fixed: all page scripts are external files.
- direct file downloads, which Instagram's browser often swallows.

## What the buyer gets

1. **MasterClip Complete Guide (PDF)**: private. It is stored in an R2 bucket and streamed only for a valid access token.
2. **MasterClip Windows installer**: the free public link
   https://github.com/AnIntellectualBeing/MasterClip/releases/latest/download/MasterClipSetup.exe
   (`MASTERCLIP_DOWNLOAD_URL` can still override it. It is now optional.)

## The flow

```
Sales page (/MasterClipTool/)
  ├─ In-app browser detected (Instagram/FBAN/FBAV/Messenger/Line/Snapchat/TikTok/Android "wv")
  │    → yellow banner: "Open this page in Chrome or Safari to buy"
  │      Android: "Open in Chrome" (intent:// link with fallback) · iOS: "tap ••• → Open in external browser"
  │      "Copy link" · "Buy here anyway" (first Buy tap points at the banner; second tap pays)
  ├─ Email (required) + phone (optional) → Razorpay prefill + order notes (buyer_email / buyer_phone)
  ├─ Order id saved in localStorage AND in the address bar (?order=…), so a reload still knows it
  └─ Razorpay checkout
       ├─ normal browser: JS handler → POST /api/masterclip/verify-payment → { accessUrl }
       │                    → location.replace(accessUrl)
       └─ in-app browser: redirect mode → Razorpay POSTs to /api/masterclip/callback
                            → 303 straight to the access page (no JS, no popup, no cookie)
       Fallback: the page polls /api/masterclip/recover {orderId} every 5 s, on focus and on pageshow.

Access page  /MasterClipTool/access?token=<pay_id>.<expires>.<hmac>
  - Server-rendered Pages Function. Works with no cookies, no storage and no JavaScript.
  - Token is an HMAC-SHA256 over the payment id + expiry. Valid 365 days (MASTERCLIP_ACCESS_DAYS).
  - Buttons: Download the guide (PDF, attachment) · Open the guide in the browser (inline)
             · Download MasterClip for Windows (.exe)
  - Copyable URL + "Email it to myself" (mailto) + "Send to myself on WhatsApp"
  - In-app tip with an Android intent link back to this same page
  - Referrer-Policy: no-referrer + no-store, so the token is not leaked to GitHub or cached

Guide PDF  /api/masterclip/guide?token=…[&inline=1]
  - 401 without a valid token. Streams from R2 binding MASTERCLIP_FILES, key MasterClip-Guide.pdf
    (MASTERCLIP_GUIDE_KEY overrides it). Supports Range/HEAD for mobile PDF viewers.
  - 503 with the support email if the bucket or file is missing. Nothing is ever public.

Recovery  /MasterClipTool/download-ready
  - Payment ID (pay_… from Razorpay's SMS/email) or the email/phone used at checkout
    → POST /api/masterclip/recover → Razorpay API confirms a captured ₹349 payment on an order
      with notes.product = masterclip-windows → returns the access link and opens it.
  - Works for buyers from before this change (it only asks Razorpay).
  - Email/phone search scans the newest 500 payments from the last ~400 days. Fine at our volume.
  - Light per-IP rate limit (in memory): 20 payment-ID and 8 email/phone lookups per 15 min.
  - Also resumes ?order=… polling after a redirect, and shows old 7-day installer links (#hash).
```

Old links keep working: legacy `/api/masterclip/download?t=…` 7-day links and the old cookie still redirect to the installer. New tokens also work at `/api/masterclip/download?token=…`.

Support line on every page: **anintellectualcompany.contact@gmail.com**, "email us with your payment ID".

Referral codes (`?ref=`) and the ₹149 guide / verticalclipper products are unchanged.

### Checkout on/off

- New sales (`/api/masterclip/config`, `create-order`) need `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` **and** the R2 binding `MASTERCLIP_FILES`. Without the binding the buy button returns "Checkout is being configured", because the ₹349 buys the guide.
- Delivery (verify, callback, recover, access page) needs only the Razorpay keys, so a paying buyer is never locked out.

### Optional pieces (off until secrets are added)

- **Email the link (Resend).** Set `RESEND_API_KEY` + `MASTERCLIP_EMAIL_FROM`. Without the webhook, verify-payment/callback email the link after checkout. Email/phone recovery also emails it.
- **Razorpay webhook.** Set `RAZORPAY_WEBHOOK_SECRET`. `payment.captured` → `/api/masterclip/webhook` emails the link even if the buyer's page never came back. When the webhook is on, checkout stops emailing, to avoid duplicates.
- **Revoke after a refund.** Set the Pages variable `MASTERCLIP_REVOKED` to comma-separated payment ids.

Security trade-off: email/phone recovery shows the link on screen, as the owner asked. Anyone who knows a buyer's email or phone could get that buyer's guide link. This is rate limited, and the link only unlocks a ₹349 PDF.

## Owner one-time setup

Run these from `Z:\Projects\deliverables\masterclip-sales\site` in PowerShell, logged in with `npx wrangler login`. Nothing here has been run against your account.

### 1. R2 bucket for the private PDF

R2 has a free tier (10 GB storage). The first time, Cloudflare may ask you to enable R2 in the dashboard (R2 Object Storage → Enable/Purchase; it can ask for a payment method even for the free tier).

```powershell
npx wrangler r2 bucket create masterclip-private
npx wrangler r2 object put masterclip-private/MasterClip-Guide.pdf --file "Z:\Projects\deliverables\masterclip-guide\out\MasterClip-Guide.pdf" --content-type application/pdf --remote
npx wrangler r2 object get masterclip-private/MasterClip-Guide.pdf --file "$env:TEMP\guide-check.pdf" --remote   # optional check
```

Keep the bucket **private**. Do not enable "Public access" or an r2.dev URL.

To update the guide later, run the same `object put` again. The change is live immediately, and links do not change.

### 2. Bind the bucket to the Pages project (dashboard)

Cloudflare dashboard → Workers & Pages → **gta-auto-clipper** → Settings → **Bindings** → Add → **R2 bucket**:
- Variable name: `MASTERCLIP_FILES`
- R2 bucket: `masterclip-private`
- Do this for **Production**. Do it for **Preview** too if you test on preview deployments.

(We deliberately do not add a `wrangler.toml`. For Pages it would become the source of truth for all bindings and variables.)

### 3. Access-link secret (recommended)

This keeps links valid if you ever change the Razorpay keys. Links already issued still verify.

```powershell
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler pages secret put MASTERCLIP_ACCESS_SECRET --project-name gta-auto-clipper
```

Never change or delete it afterwards, or all links issued under it stop working. Buyers could still recover by payment ID.

### 4. Deploy

```powershell
npm test
npx wrangler pages deploy . --project-name gta-auto-clipper --branch main
```

### 5. Optional: email delivery with Resend

1. Create a Resend account (free tier: 3,000 emails/month, 100/day). Add and verify the domain `anintellectualcompany.com`. Add the DNS records Resend shows. They don't conflict with existing mail records.
2. Create an API key with "Sending access" only.
3. Add the secrets:
   ```powershell
   npx wrangler pages secret put RESEND_API_KEY --project-name gta-auto-clipper
   npx wrangler pages secret put MASTERCLIP_EMAIL_FROM --project-name gta-auto-clipper   # e.g. MasterClip <support@anintellectualcompany.com>
   ```
   Replies go to anintellectualcompany.contact@gmail.com (reply_to).

### 6. Optional: Razorpay webhook (best with step 5)

Razorpay Dashboard → Accounts & Settings → Webhooks → Add new webhook:
- URL: `https://masterprompt.anintellectualcompany.com/api/masterclip/webhook`
- Secret: a random string
- Event: `payment.captured`

Then add the same secret:

```powershell
npx wrangler pages secret put RAZORPAY_WEBHOOK_SECRET --project-name gta-auto-clipper
```

Do this separately for Test and Live mode (each has its own webhooks). Redeploy if Cloudflare asks after secret changes.

## How to test (including inside Instagram)

Use Razorpay **test keys**, ideally on a preview deployment so production stays live:

1. Dashboard → gta-auto-clipper → Settings → Variables and Secrets → choose the **Preview** environment → add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (test keys, type Secret). `wrangler pages secret put` (4.166) only writes Production.
2. Bind `MASTERCLIP_FILES` for Preview as in step 2.
3. Deploy a preview branch:
   ```powershell
   npx wrangler pages deploy . --project-name gta-auto-clipper --branch delivery-test
   ``` Then open the preview URL that Wrangler prints, followed by `/MasterClipTool/?ref=test`.

Local run (no Cloudflare account needed):

```powershell
npx wrangler r2 object put masterclip-private/MasterClip-Guide.pdf --file <any.pdf> --content-type application/pdf --local
npx wrangler pages dev . --binding RAZORPAY_KEY_ID=rzp_test_xxx --binding RAZORPAY_KEY_SECRET=<test secret> --r2 MASTERCLIP_FILES=masterclip-private
```

Instagram checklist (Android and iPhone):

1. Send the page link to yourself in an Instagram DM (or put it in a story or bio). Tap it so it opens in Instagram's browser.
2. The yellow banner shows. **Open in Chrome** (Android) opens the same page in Chrome with `?ref=` kept. On iPhone the ••• instructions show. **Copy link** copies the URL.
3. Back in Instagram, tap **Buy here anyway**, enter an email, and pay with Razorpay test UPI `success@razorpay` or test card 4111 1111 1111 1111. Razorpay redirects the whole page and you land on `/MasterClipTool/access?token=…`.
4. Reload: the page still works. Tap **Open the guide in the browser**: the PDF shows. Tap **Download the guide**: it saves, or nothing happens in Instagram (expected; use the inline button). Copy the link, open it in Chrome, and download again. Open it on a PC and download the installer.
5. Recovery: open `/MasterClipTool/download-ready` in a private window. Enter the `pay_…` ID shown on the access page; you are taken to your access page. Repeat with the email and with the phone.
6. Failure: pay with test UPI `failure@razorpay`. You return to the sales page with "The payment did not complete".
7. In normal Chrome, pay once: the popup handler path goes straight to the access page.
8. Tamper with one character of the token: the access page says "This link isn't valid anymore" and the guide URL returns 401.

Automated tests: `npm test` in `site/` (token sign/verify, recovery by payment/order/email/phone, rate limit, in-app detection, intent URL, PDF auth/inline/range/503, access page, callback, webhook, legacy links).
