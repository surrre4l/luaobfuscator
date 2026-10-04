import { parse } from './parser.js';
import { generate } from './generator.js';
import {
  watermark,
  renamePass, manglePass, scramblePass,
  sFloodPass, kFloodPass, lFloodPass,
  envPass, stringPass,
  deadCodePass, numberSplitPass,
  strongFlattenPass, vmWrap,
} from './passes.js';

const ID_PASSES = {
  rename:   renamePass,
  mangle:   manglePass,
  scramble: scramblePass,
  sflood:   sFloodPass,
  kflood:   kFloodPass,
  lflood:   lFloodPass,
};

export function obfuscate(source, opts = {}) {
  const o = {
    idstyle: 'rename',
    env: true, deadCode: true, numberSplit: true, flatten: true,
    stringChain: ['xor'], vm: false, minify: false,
    ...opts,
  };

  let ast;
  try { ast = parse(source); }
  catch (err) {
    return watermark(vmWrap(source, {})) + '\n-- fallback: ' + err.message + '\n';
  }

  // 1. Strings
  let decoderCode = '';
  if (o.stringChain && o.stringChain.length) {
    const r = stringPass(ast, o.stringChain);
    ast = r.ast; decoderCode = r.decoderCode;
  }

  // 2. Env
  if (o.env) ast = envPass(ast);

  // 3. Dead code
  if (o.deadCode) ast = deadCodePass(ast);

  // 4. Number split
  if (o.numberSplit) ast = numberSplitPass(ast, 3);

  // 5. CFF
  if (o.flatten) ast = strongFlattenPass(ast);

  // 6. Identifier style
  const idPass = ID_PASSES[o.idstyle];
  if (idPass) ast = idPass(ast);

  // 7. Generate
  let out = generate(ast, { minify: o.minify });
  if (decoderCode) out = decoderCode + '\n' + out;

  // 8. VM wrapper
  if (o.vm) out = vmWrap(out, {});

  return watermark(out);
}