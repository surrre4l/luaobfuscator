$('obfuscate-btn').addEventListener('click', () => {
  const src = inputEl.value.trim();
  if (!src) { outputEl.value = '-- No input'; return; }

  // Which identifier style?
  const idstyle = document.querySelector('input[name=idstyle]:checked').value;

  // Stacked string encodings — applied in this order
  const chain = [];
  if ($('str-caesar').checked) chain.push('caesar');
  if ($('str-xor').checked)    chain.push('xor');
  if ($('str-b64').checked)    chain.push('b64');

  const opts = {
    rename:      idstyle === 'rename',
    mangle:      idstyle === 'mangle',
    sFlood:      idstyle === 'sflood',
    env:         $('opt-env').checked,
    deadCode:    $('opt-deadcode').checked,
    numberSplit: $('opt-numsplit').checked,
    flatten:     $('opt-flatten').checked,
    stringChain: chain,
    vm:          $('opt-vm').checked,
    minify:      $('opt-minify').checked,
  };

  const t0 = performance.now();
  try {
    const result = obfuscate(src, opts);
    const t1 = performance.now();
    outputEl.value = result;
    const before = src.length, after = result.length;
    stats.textContent =
      `Input: ${before} B · Output: ${after} B · Ratio: ${(after / before * 100).toFixed(1)}%` +
      ` · ${(t1 - t0).toFixed(1)} ms` +
      ` · enc=[${chain.join('→') || 'none'}] · id=${idstyle}`;
  } catch (err) {
    outputEl.value = '-- Error: ' + err.message;
    stats.textContent = '';
  }
});