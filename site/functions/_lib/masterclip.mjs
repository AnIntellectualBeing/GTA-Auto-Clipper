export const MASTERCLIP_AMOUNT_PAISE = 34900;
export const MASTERCLIP_PRODUCT = 'masterclip-windows';

// The installer is too large for Pages, so the buyer is sent to a URL kept in the
// MASTERCLIP_DOWNLOAD_URL Pages variable (for example a GitHub Release asset).
export function masterclipDownloadUrl(env) {
  try {
    const url = new URL(env.MASTERCLIP_DOWNLOAD_URL || '');
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function masterclipEnabled(env) {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && masterclipDownloadUrl(env));
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
