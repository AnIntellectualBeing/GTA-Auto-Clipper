export const MASTERCLIP_AMOUNT_PAISE = 34900;
export const MASTERCLIP_PRODUCT = 'masterclip-windows';
export const MASTERCLIP_INSTALLER_URL = 'https://github.com/AnIntellectualBeing/MasterClip/releases/latest/download/MasterClipSetup.exe';
export const SUPPORT_EMAIL = 'anintellectualcompany.contact@gmail.com';
export const GUIDE_DEFAULT_KEY = 'MasterClip-Guide.pdf';
export const GUIDE_FILENAME = 'MasterClip-Complete-Guide.pdf';

// The installer is the free public GitHub release. MASTERCLIP_DOWNLOAD_URL can override it (https only).
export function masterclipDownloadUrl(env) {
  try {
    const url = new URL(env.MASTERCLIP_DOWNLOAD_URL || '');
    if (url.protocol === 'https:') return url.href;
  } catch { /* fall through */ }
  return MASTERCLIP_INSTALLER_URL;
}

// The private guide PDF lives in an R2 bucket bound to the Pages project as MASTERCLIP_FILES.
export function guideBucket(env) {
  const bucket = env.MASTERCLIP_FILES;
  return bucket && typeof bucket.get === 'function' ? bucket : null;
}

export function guideKey(env) {
  return typeof env.MASTERCLIP_GUIDE_KEY === 'string' && env.MASTERCLIP_GUIDE_KEY.trim()
    ? env.MASTERCLIP_GUIDE_KEY.trim() : GUIDE_DEFAULT_KEY;
}

// Delivery (verify / recover / access links) only needs the Razorpay keys, so a buyer who has
// already paid is never locked out.
export function masterclipDeliveryEnabled(env) {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

// New sales also need the guide storage, because the ₹349 buys the guide.
export function masterclipEnabled(env) {
  return masterclipDeliveryEnabled(env) && Boolean(guideBucket(env));
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 120 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(email) ? email : '';
}

// Indian mobile numbers: compare on the last 10 digits so +91 / 0 prefixes don't matter.
export function cleanPhone(value) {
  const digits = typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : '';
  return digits.length >= 10 && digits.length <= 15 ? digits.slice(-10) : '';
}
