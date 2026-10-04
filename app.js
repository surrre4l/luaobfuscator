import { obfuscate } from './src/obfuscator.js';

const $ = id => document.getElementById(id);
const inputEl   = $('input');
const outputEl  = $('output');
const fileInput = $('file-input');
const dropzone  = $('dropzone');
const filename  = $('filename');
const stats     = $('stats');

/* ---------- File upload / drag-drop ---------- */
function loadFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.lua') && !name.endsWith('.txt')) {
    filename.textContent = '❌ Only .lua or .txt files are supported';
    return;
  }
  filename.textContent = '📄 ' + file.name;
  const reader = new FileReader();
  reader.onload = e => { inputEl.value = e.target.result; };
  reader.readAsText(file);
}

fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('over'); })
);
['dragleave', 'drop'].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('over'); })
);
dropzone.addEventListener('drop', e => {
  if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
});

/* ---------- Run obfuscation ---------- */
$('obfuscate-btn').addEventListener('click', () => {
  const src = inputEl.value.trim();
  if (!src) { outputEl.value = '-- No input'; return; }

  const strMode = document.querySelector('input[name=strmode]:checked').value;
  const opts = {
    rename:     $('opt-rename').checked,
    env:        $('opt-env').checked,
    deadCode:   $('opt-deadcode').checked,
    flatten:    $('opt-flatten').checked,
    stringMode: strMode,
    vm:         $('opt-vm').checked,
    minify:     $('opt-minify').checked,
  };

  const t0 = performance.now();
  try {
    const result = obfuscate(src, opts);
    const t1 = performance.now();
    outputEl.value = result;
    const before = src.length, after = result.length;
    const ratio = (after / before * 100).toFixed(1);
    stats.textContent =
      `Input: ${before} B · Output: ${after} B · Ratio: ${ratio}% · ${(t1 - t0).toFixed(1)} ms`;
  } catch (err) {
    outputEl.value = '-- Error: ' + err.message;
    stats.textContent = '';
  }
});

/* ---------- Copy / download ---------- */
$('copy-btn').addEventListener('click', async () => {
  if (!outputEl.value) return;
  try {
    await navigator.clipboard.writeText(outputEl.value);
    $('copy-btn').textContent = '✓ Copied';
    setTimeout(() => { $('copy-btn').textContent = 'Copy'; }, 1200);
  } catch {
    outputEl.select(); document.execCommand('copy');
  }
});

$('download-btn').addEventListener('click', () => {
  if (!outputEl.value) return;
  const blob = new Blob([outputEl.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'obfuscated.lua';
  a.click();
  URL.revokeObjectURL(url);
});