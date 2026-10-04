import { obfuscate } from './src/obfuscator.js';

const $ = id => document.getElementById(id);
const inputEl    = $('input');
const outputEl   = $('output');
const fileInput  = $('file-input');
const dropzone   = $('dropzone');
const filenameEl = $('filename');
const statsEl    = $('stats');
const statsTag   = $('stats-tag');
const inputTag   = $('input-tag');
const presetTag  = $('preset-tag');
const idHint     = $('idstyle-hint');
const chainHint  = $('chain-hint');
const obfBtn     = $('obfuscate-btn');

/* ── tabs ─────────────────────────────────────────────────────── */
const layout = document.querySelector('.layout');
const cards  = document.querySelectorAll('.layout .card');
const tabs   = document.querySelectorAll('.tab');
function setTab(name) {
  layout.dataset.active = name;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  cards.forEach(c => c.classList.toggle('show', c.dataset.tab === name));
}
tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
setTab('input');

/* ── file upload ──────────────────────────────────────────────── */
const ALLOWED = ['.lua', '.txt'];
const MAX = 5 * 1024 * 1024;

function setFileLabel(name, size) {
  if (!name) { filenameEl.textContent = 'no file selected'; return; }
  filenameEl.textContent = `📄 ${name} · ${(size / 1024).toFixed(1)} KB`;
}

function loadFile(file) {
  if (!file) return;
  const name = (file.name || '').toLowerCase();
  if (!ALLOWED.some(e => name.endsWith(e))) {
    filenameEl.textContent = '❌ only .lua or .txt allowed'; return;
  }
  if (file.size > MAX) {
    filenameEl.textContent = '❌ file too large (max 5 MB)'; return;
  }
  const r = new FileReader();
  r.onload = e => {
    inputEl.value = e.target.result;
    setFileLabel(file.name, file.size);
    updateInputTag();
  };
  r.onerror = () => { filenameEl.textContent = '❌ read error'; };
  r.readAsText(file);
}

fileInput.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (f) loadFile(f);
  fileInput.value = '';
});
$('clear-file').addEventListener('click', () => {
  inputEl.value = '';
  setFileLabel(null);
  updateInputTag();
});

['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.add('over');
  })
);
['dragleave', 'drop'].forEach(ev =>
  dropzone.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.remove('over');
  })
);
dropzone.addEventListener('drop', e => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadFile(f);
});

document.addEventListener('paste', e => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f) { loadFile(f); e.preventDefault(); return; }
    }
  }
});

/* ── tags / hints ─────────────────────────────────────────────── */
function updateInputTag() {
  const n = inputEl.value.length;
  inputTag.textContent = n === 0 ? 'empty' : n.toLocaleString() + ' B';
}
inputEl.addEventListener('input', updateInputTag);
updateInputTag();

const ID_HINTS = {
  rename:   '_0xab0001, _0xab0002, _0xab0003',
  mangle:   '_l1O0S5Zz, _Il1O0S5, _SI5Zz1O',
  scramble: '_I1KzO5l, _S0ZIl1o, _Z5K1lS0',
  sflood:   'S, SS, SSS, SSSS, SSSSS',
  kflood:   'K, KK, KKK, KKKK, KKKKK',
  lflood:   'L, LL, LLL, LLLL, LLLLL',
  none:     'original names preserved',
};

function updateHints() {
  const style = (document.querySelector('input[name=idstyle]:checked') || {}).value || 'rename';
  idHint.textContent = ID_HINTS[style] || ID_HINTS.rename;

  const chain = [];
  if ($('str-caesar').checked) chain.push('Caesar');
  if ($('str-xor').checked)    chain.push('XOR');
  if ($('str-b64').checked)    chain.push('Base64');
  if ($('str-rot').checked)    chain.push('ROT13');
  if ($('str-rev').checked)    chain.push('Reverse');
  chainHint.textContent = chain.length ? chain.join(' → ') : 'none';
}

document.querySelectorAll(
  'input[name=idstyle], #str-xor, #str-b64, #str-caesar, #str-rot, #str-rev'
).forEach(el => el.addEventListener('change', updateHints));
updateHints();

/* ── presets ──────────────────────────────────────────────────── */
const PRESETS = {
  light: {
    idstyle:'rename', caesar:false, xor:true, b64:false, rot:false, rev:false,
    env:false, dead:false, num:false, cff:false, vm:false, mini:true,
  },
  balanced: {
    idstyle:'mangle', caesar:false, xor:true, b64:false, rot:false, rev:false,
    env:true, dead:true, num:true, cff:true, vm:false, mini:false,
  },
  paranoid: {
    idstyle:'scramble', caesar:true, xor:true, b64:true, rot:false, rev:true,
    env:true, dead:true, num:true, cff:true, vm:false, mini:false,
  },
  max: {
    idstyle:'sflood', caesar:true, xor:true, b64:true, rot:true, rev:true,
    env:true, dead:true, num:true, cff:true, vm:true, mini:false,
  },
};

function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  const el = document.querySelector(`input[name=idstyle][value="${p.idstyle}"]`);
  if (el) el.checked = true;
  $('str-caesar').checked  = p.caesar;
  $('str-xor').checked     = p.xor;
  $('str-b64').checked     = p.b64;
  $('str-rot').checked     = p.rot;
  $('str-rev').checked     = p.rev;
  $('opt-env').checked     = p.env;
  $('opt-deadcode').checked = p.dead;
  $('opt-numsplit').checked = p.num;
  $('opt-flatten').checked = p.cff;
  $('opt-vm').checked      = p.vm;
  $('opt-minify').checked  = p.mini;

  presetTag.textContent = name;
  document.querySelectorAll('.preset').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === name));
  updateHints();
}
document.querySelectorAll('.preset').forEach(b =>
  b.addEventListener('click', () => applyPreset(b.dataset.preset)));
applyPreset('balanced');

/* ── obfuscate ────────────────────────────────────────────────── */
obfBtn.addEventListener('click', () => {
  const src = inputEl.value.trim();
  if (!src) {
    outputEl.value = '-- No input. Paste or drop a .lua/.txt file first.';
    if (window.innerWidth < 1000) setTab('output');
    return;
  }

  const idstyle = (document.querySelector('input[name=idstyle]:checked') || {}).value || 'rename';
  const chain = [];
  if ($('str-caesar').checked) chain.push('caesar');
  if ($('str-xor').checked)    chain.push('xor');
  if ($('str-b64').checked)    chain.push('b64');
  if ($('str-rot').checked)    chain.push('rot');
  if ($('str-rev').checked)    chain.push('rev');

  const opts = {
    idstyle,
    env:         $('opt-env').checked,
    deadCode:    $('opt-deadcode').checked,
    numberSplit: $('opt-numsplit').checked,
    flatten:     $('opt-flatten').checked,
    stringChain: chain,
    vm:          $('opt-vm').checked,
    minify:      $('opt-minify').checked,
  };

  obfBtn.disabled = true;
  const orig = obfBtn.textContent;
  obfBtn.textContent = 'Working…';

  setTimeout(() => {
    const t0 = performance.now();
    try {
      const out = obfuscate(src, opts);
      const t1 = performance.now();
      outputEl.value = out;

      const before = src.length, after = out.length;
      const ratio = (after / before * 100).toFixed(1);

      statsEl.textContent =
        `in ${before} B · out ${after} B · ratio ${ratio}%\n` +
        `id=${idstyle} · enc=[${chain.join('→') || 'none'}] · ${(t1 - t0).toFixed(1)} ms`;
      statsTag.textContent = ratio + '%';

      if (window.innerWidth < 1000) setTab('output');
    } catch (err) {
      outputEl.value = '-- Error: ' + err.message;
      statsEl.textContent = '';
      statsTag.textContent = 'error';
      if (window.innerWidth < 1000) setTab('output');
    } finally {
      obfBtn.disabled = false;
      obfBtn.textContent = orig;
    }
  }, 20);
});

/* ── copy / download ──────────────────────────────────────────── */
$('copy-btn').addEventListener('click', async () => {
  if (!outputEl.value) return;
  const btn = $('copy-btn');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(outputEl.value);
    } else {
      outputEl.removeAttribute('readonly');
      outputEl.select();
      document.execCommand('copy');
      outputEl.setAttribute('readonly', '');
    }
    btn.textContent = '✓ Copied';
  } catch { btn.textContent = '❌ Failed'; }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
});

$('download-btn').addEventListener('click', () => {
  if (!outputEl.value) return;
  const blob = new Blob([outputEl.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'obfuscated.lua';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});