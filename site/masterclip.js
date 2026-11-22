import { rememberReferral } from './referral.js';

const referralCode = rememberReferral();
const buttons = [...document.querySelectorAll('[data-buy]')];
const status = document.querySelector('#payment-status');
function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('payment-error', error);
}
function setBusy(busy) {
  for (const button of buttons) button.disabled = busy;
}

setBusy(false);
setStatus('Secure Razorpay checkout · download link right after payment.');

async function buy() {
  document.querySelector('#buy')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!window.Razorpay) {
    setStatus('Razorpay checkout did not load. Refresh the page and try again.', true);
    return;
  }
  setBusy(true);
  setStatus('Starting secure checkout…');
  try {
    const created = await fetch('/api/masterclip/create-order', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referralCode }),
    });
    const order = await created.json();
    if (!created.ok) throw new Error(order.error || 'Could not start checkout.');
    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'MasterClip',
      description: 'MasterClip for Windows · one-time',
      order_id: order.orderId,
      theme: { color: '#d83b2d' },
      handler: async (payment) => {
        try {
          setStatus('Verifying payment securely…');
          const verified = await fetch('/api/masterclip/verify-payment', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payment),
          });
          const result = await verified.json();
          if (!verified.ok) throw new Error(result.error || 'Payment verification failed.');
          window.location.replace('/MasterClipTool/download-ready');
        } catch (error) {
          setStatus(error.message || 'Payment verification failed. Contact support if you were charged.', true);
          setBusy(false);
        }
      },
      modal: { ondismiss: () => { setBusy(false); setStatus('Checkout closed. You can try again whenever you are ready.'); } },
    });
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
