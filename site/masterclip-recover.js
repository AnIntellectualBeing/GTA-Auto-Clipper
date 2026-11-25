// /MasterClipTool/download-ready: find a MasterClip purchase and open its access page.
// External file on purpose: the site CSP blocks inline scripts.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('recover-msg');
  var accessPattern = /^https:\/\/[^\s]+\/(MasterClipTool|MasterClipPhone)\/access\?token=[\w.%-]+$/;

  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* blocked */ } }

  function open(url, paymentId) {
    write('masterclip.access', { url: url, paymentId: paymentId || '', at: Date.now() });
    try { localStorage.removeItem('masterclip.order'); } catch (e) { /* blocked */ }
    $('found-link').href = url;
    $('found').hidden = false;
    window.location.assign(url);
  }

  // Remembered purchase in this browser.
  var saved = read('masterclip.access');
  if (saved && accessPattern.test(saved.url || '')) {
    $('saved-link').href = saved.url;
    $('saved').hidden = false;
  }

  // Old 7-day installer links (#https://.../api/masterclip/download?t=...) from before the access page.
  var legacy = '';
  try { legacy = decodeURIComponent((location.hash || '').slice(1)); } catch (e) { /* ignore */ }
  if (/^https:\/\/[^\s]+\/api\/masterclip\/download\?t=/.test(legacy)) {
    $('legacy-link').href = legacy;
    $('legacy').hidden = false;
  }

  function lookup(body, emptyMessage) {
    msg.textContent = 'Checking with Razorpay…';
    return fetch('/api/masterclip/recover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.paid && res.accessUrl) {
          msg.textContent = res.emailed ? '✅ Found it! Opening your downloads. We also emailed the link to you.' : '✅ Found it! Opening your downloads…';
          open(res.accessUrl, res.paymentId);
          return true;
        }
        if (emptyMessage !== null) msg.textContent = res.error || emptyMessage;
        return false;
      })
      .catch(function () { if (emptyMessage !== null) msg.textContent = 'Could not check right now. Try again in a minute, or email us.'; return false; });
  }

  // Coming back from checkout (Razorpay redirect) or a UPI app with an order in progress.
  var params = new URLSearchParams(location.search);
  var pay = params.get('pay');
  if (/^pay_[A-Za-z0-9]{6,40}$/.test(pay || '')) $('pay-id').value = pay;
  var order = params.get('order');
  var pendingOrder = read('masterclip.order');
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(order || '') && pendingOrder && Date.now() - pendingOrder.at < 2 * 86400000) order = pendingOrder.orderId;
  if (/^order_[A-Za-z0-9]{6,40}$/.test(order || '')) {
    $('pending').hidden = false;
    var tries = 0;
    var poll = function () {
      tries += 1;
      lookup({ orderId: order }, null).then(function (done) {
        if (done) return;
        if (tries < 60) setTimeout(poll, 5000);
        else $('pending').textContent = 'We could not confirm the payment yet. If money was deducted, enter your payment ID below or email us.';
      });
    };
    poll();
  }

  $('by-payment').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('pay-id').value.trim();
    if (!/^pay_[A-Za-z0-9]{6,40}$/.test(id)) { msg.textContent = 'The payment ID starts with pay_ followed by letters and numbers. Check your Razorpay SMS or email.'; return; }
    lookup({ paymentId: id }, 'We could not find that payment. Email us and we will help.');
  });

  $('by-contact').addEventListener('submit', function (e) {
    e.preventDefault();
    var value = $('contact').value.trim();
    if (value.indexOf('@') > 0) lookup({ email: value }, 'We could not find a payment with that email.');
    else if (value.replace(/\D/g, '').length >= 10) lookup({ phone: value }, 'We could not find a payment with that phone number.');
    else msg.textContent = 'Enter the email (with @) or the 10-digit phone number you paid with.';
  });
})();
