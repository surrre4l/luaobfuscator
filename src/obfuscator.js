import { parse } from './parser.js';
import { generate } from './generator.js';
import {
  renamePass, envPass, stringPass, deadCodePass, flattenPass, vmWrap,
} from './passes.js';

export function obfuscate(source, opts = {}) {
  const o = {
    rename: true, env: true, deadCode: true, flatten: true,
    stringMode: 'xor', vm: false, minify: false,
    ...opts,
  };

  // 1. Parse
  let ast;
  try { ast = parse(source); }
  catch (err) { throw new Error('Parse error: ' + err.message); }

  // 2. String encoding (needs to run before env/rename so its
  //    generated identifiers keep their meaning, and so strings
  //    inside generated decoders aren't re-encoded)
  let decoderCode = '';
  if (o.stringMode !== 'none') {
    const res = stringPass(ast, o.stringMode);
    ast = res.ast;
    decoderCode = res.decoderCode;
  }

  // 3. Environment hiding
  if (o.env) ast = envPass(ast);

  // 4. Dead code
  if (o.deadCode) ast = deadCodePass(ast);

  // 5. Flattening
  if (o.flatten) ast = flattenPass(ast);

  // 6. Rename identifiers
  if (o.rename) ast = renamePass(ast);

  // 7. Generate
  let out = generate(ast, { minify: o.minify });

  // 8. Splice decoder prelude on top
  if (decoderCode) {
    out = decoderCode + '\n' + out;
  }

  // 9. VM wrapper (last)
  if (o.vm) out = vmWrap(out);

  return out;
}