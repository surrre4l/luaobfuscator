/* ── footer year ─────────────────────────────────────────────── */
document.getElementById('year').textContent = '© ' + new Date().getFullYear();

/* ── live hints ──────────────────────────────────────────────── */
const idstyleHint = document.getElementById('idstyle-hint');
const chainHint   = document.getElementById('chain-hint');
const presetTag   = document.getElementById('preset-tag');
const inputTag    = document.getElementById('input-tag');

const ID_HINTS = {
  rename: '_0x0001, _0x0002, _0x0003',
  mangle: '_l1O0S5Zz, _Il1O0S5, _SI5Zz1O',
  sflood: 'S, SS, SSS, SSSS, SSSSS',
  none:   'original names preserved',
};

function updateHints() {
  const style = document.querySelector('input[name=idstyle]:checked').value;
  idstyleHint.textContent = ID_HINTS[style];

  const chain = [];
  if (document.getElementById('str-caesar').checked) chain.push('Caesar');
  if (document.getElementById('str-xor').checked)    chain.push('XOR');
  if (document.getElementById('str-b64').checked)    chain.push('Base64');
  chainHint.textContent = chain.length ? chain.join(' → ') : 'none';
}

document.querySelectorAll('input[name=idstyle], #str-xor, #str-b64, #str-caesar')
  .forEach(el => el.addEventListener('change', updateHints));
updateHints();

/* ── input size tag ──────────────────────────────────────────── */
inputEl.addEventListener('input', () => {
  const n = inputEl.value.length;
  inputTag.textContent = n === 0 ? 'empty' : n.toLocaleString() + ' B';
});

/* ── presets ─────────────────────────────────────────────────── */
const PRESETS = {
  light:    { idstyle:'rename', caesar:false, xor:true,  b64:false, env:true,  dead:false, num:false, cff:false, vm:false, mini:true  },
  balanced: { idstyle:'mangle', caesar:false, xor:true,  b64:false, env:true,  dead:true,  num:true,  cff:true,  vm:false, mini:false },
  paranoid: { idstyle:'sflood', caesar:true,  xor:true,  b64:true,  env:true,  dead:true,  num:true,  cff:true,  vm:false, mini:false },
};

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;

  document.querySelector(`input[name=idstyle][value="${p.idstyle}"]`).checked = true;
  document.getElementById('str-caesar').checked = p.caesar;
  document.getElementById('str-xor').checked    = p.xor;
  document.getElementById('str-b64').checked    = p.b64;
  document.getElementById('opt-env').checked      = p.env;
  document.getElementById('opt-deadcode').checked = p.dead;
  document.getElementById('opt-numsplit').checked = p.num;
  document.getElementById('opt-flatten').checked  = p.cff;
  document.getElementById('opt-vm').checked       = p.vm;
  document.getElementById('opt-minify').checked   = p.mini;

  presetTag.textContent = name;
  document.querySelectorAll('.preset').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === name));
  updateHints();
}

document.querySelectorAll('.preset').forEach(btn =>
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset)));
applyPreset('balanced');