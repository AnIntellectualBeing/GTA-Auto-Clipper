// In-app browser detection shared by the pages and the server-rendered access page.
// Instagram / Facebook / Messenger / Line / Snapchat / TikTok etc. open links in a built-in
// browser that often blocks downloads, loses storage between the payment app and the page, and
// kills popups. We tell the buyer to switch to a real browser before paying.
const APPS = [
  ['Instagram', /Instagram/i],
  ['Facebook Messenger', /Messenger|FBAN\/MessengerForiOS|FB_IAB\/MESSENGER/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FB4A|\[FB/i],
  ['Line', /\bLine\/\d/],
  ['Snapchat', /Snapchat/i],
  ['TikTok', /musical_ly|BytedanceWebview|TikTok|trill_/i],
  ['Threads', /Barcelona/],
  ['LinkedIn', /LinkedInApp/i],
  ['Pinterest', /Pinterest/i],
  ['X (Twitter)', /Twitter/i],
];

export function detectInApp(userAgent = '') {
  const ua = String(userAgent || '');
  const os = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'other';
  for (const [app, pattern] of APPS) if (pattern.test(ua)) return { inApp: true, app, os };
  // Generic Android WebView ("; wv)") that is not a normal browser.
  if (os === 'android' && /;\s*wv\)/.test(ua)) return { inApp: true, app: 'an app', os };
  return { inApp: false, app: '', os };
}

// Android: opens the same https URL in Chrome; falls back to the URL if Chrome is missing.
export function androidIntentUrl(url) {
  const target = new URL(url);
  const path = `${target.host}${target.pathname}${target.search}`;
  return `intent://${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target.href)};end`;
}
