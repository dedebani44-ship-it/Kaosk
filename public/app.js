const form = document.querySelector('#download-form');
const input = document.querySelector('#url');
const result = document.querySelector('#result');
const infoButton = document.querySelector('#info-button');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setBusy(isBusy) {
  document.querySelectorAll('button').forEach((button) => {
    button.disabled = isBusy;
  });
}

function showMessage(message, isError = false) {
  result.classList.remove('hidden');
  result.innerHTML = `<div><h3>${isError ? 'Terjadi masalah' : 'Info'}</h3><p>${escapeHtml(message)}</p></div>`;
}

function download(type) {
  const url = input.value.trim();
  if (!url) return;
  const target = `/api/download?type=${encodeURIComponent(type)}&url=${encodeURIComponent(url)}`;
  window.location.href = target;
}

async function fetchInfo() {
  const url = input.value.trim();
  if (!url) return;

  setBusy(true);
  showMessage('Mengambil detail media...');

  try {
    const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gagal mengambil detail.');

    result.classList.remove('hidden');
    result.innerHTML = `
      ${data.thumbnail ? `<img src="${escapeHtml(data.thumbnail)}" alt="Thumbnail ${escapeHtml(data.title)}" />` : ''}
      <div>
        <h3>${escapeHtml(data.title)}</h3>
        <p>${data.uploader ? `Uploader: ${escapeHtml(data.uploader)}` : 'Uploader tidak tersedia'}</p>
        <p>${data.duration ? `Durasi: ${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, '0')}` : 'Durasi tidak tersedia'}</p>
        <p>${data.formats.length} format terdeteksi. Tombol unduh akan memilih kualitas terbaik otomatis.</p>
      </div>
    `;
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  download(submitter?.dataset.type || 'video');
});

infoButton.addEventListener('click', fetchInfo);
