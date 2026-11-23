// Access page helpers: copy button, and remember the link in this browser so the sales page can
// show "Open your downloads" next time. The page works without this script.
(function () {
  var input = document.getElementById('access-url');
  var button = document.getElementById('copy-access');
  if (!input) return;
  try {
    var pay = document.getElementById('payment-id');
    localStorage.setItem('masterclip.access', JSON.stringify({ url: input.value, paymentId: pay ? pay.textContent : '', at: Date.now() }));
    localStorage.removeItem('masterclip.order');
  } catch (e) { /* storage blocked: fine */ }
  if (!button) return;
  button.addEventListener('click', function () {
    var done = function () { button.textContent = 'Copied ✓'; };
    var fallback = function () {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      try { document.execCommand('copy'); done(); } catch (e) { button.textContent = 'Select & copy'; }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(done, fallback);
    else fallback();
  });
})();
