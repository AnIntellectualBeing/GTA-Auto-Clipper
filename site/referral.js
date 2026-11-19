export function normalizeReferralCode(value) {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(code) ? code : undefined;
}

export function rememberReferral() {
  const code = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref'));
  if (code) {
    document.cookie = `referral_code=${code}; Max-Age=2592000; Path=/; Secure; SameSite=Lax`;
    return code;
  }

  const saved = document.cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('referral_code='));
  return normalizeReferralCode(saved?.slice('referral_code='.length));
}
