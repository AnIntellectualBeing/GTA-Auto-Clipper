const params = new URLSearchParams(window.location.search);
const status = document.querySelector('#download-status');

if (params.get('preview') === '1') {
  document.querySelector('#download-link').addEventListener('click', (event) => {
    event.preventDefault();
    status.textContent = 'Preview mode: downloads unlock after a confirmed payment on the live site.';
  });
} else {
  window.setTimeout(() => {
    status.textContent = 'Starting your ZIP download… If it doesn’t start, use the red button above.';
    window.location.assign('/api/download');
  }, 500);
}
