import { jsonResponse } from '../../_lib/razorpay.mjs';
import { masterclipEnabled } from '../../_lib/masterclip.mjs';

export async function onRequestGet({ env }) {
  const enabled = masterclipEnabled(env);
  return jsonResponse({ enabled, keyId: enabled ? env.RAZORPAY_KEY_ID : null, mode: env.PAYMENT_MODE === 'live' ? 'live' : 'test' });
}
