import { parse } from './parser.js';
import { generate } from './generator.js';
import {
  watermark, WATERMARK,
  renamePass, manglePass, sFloodPass, envPass,
  stringPass, deadCodePass, numberSplitPass,
  strongFlattenPass, vmWrap,
} from './passes.js';

/**
 * opts:
 *   rename        bool
 *   mangle        bool   (overrides rename)
 *   sFlood        bool   (overrides mangle + rename)
 *   env           bool
 *   deadCode      bool
 *   numberSplit   bool
 *   flatten       bool
 *   stringChain   array  e.g. ['caesar','xor','b64']
 *   vm            bool
 *   minify        bool
 */
export function obfuscate(source, opts = {}) {
  const o = {
    rename: true, mangle: false, sFlood: false,
    env: true, deadCode: true, numberSplit: true, flatten: true,
    stringChain: ['xor'], vm: false, minify: false,
    ...opts,
  };

  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    // Fallback — parse failed (e.g. Luau type annotations).
    // Still produce output via VM wrap so nothing is lost.
    const wrapped = vmWrap(source, {});
    return watermark(wrapped) + '\n-- fallback: ' + err.message + '\n';
  }

  // ---- String encoding (chained) ----
  let decoderCode = '';
  if (o.stringChain && o.stringChain.length) {
    const res = stringPass(ast, o.stringChain);
    ast = res.ast;
    decoderCode = res.decoderCode;
  }

  // ---- Env hiding ----
  if (o.env) ast = envPass(ast);

  // ---- Dead code ----
  if (o.deadCode) ast = deadCodePass(ast);

  // ---- Number splitting ----
  if (o.numberSplit) ast = numberSplitPass(ast, 3);

  // ---- Strong CFF ----
  if (o.flatten) ast = strongFlattenPass(ast);

  // ---- Renaming — one style wins ----
  if (o.sFlood)       ast = sFloodPass(ast);
  else if (o.mangle)  ast = manglePass(ast);
  else if (o.rename)  ast = renamePass(ast);

  // ---- Generate ----
  let out = generate(ast, { minify: o.minify });
  if (decoderCode) out = decoderCode + '\n' + out;

  // ---- VM wrapper (optional) ----
  if (o.vm) out = vmWrap(out, {});

  // ---- Watermark always last so it's the first line ----
  return watermark(out);
}