import { walk, collectBlocks } from './walker.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const mkId   = n => ({ type: 'Identifier', name: n });
const mkNum  = v => ({ type: 'NumericLiteral', value: v, raw: String(v) });
const mkStr  = s => ({ type: 'StringLiteral', value: s, raw: null });
const binop  = (op, l, r) => ({ type: 'BinaryExpression', operator: op, left: l, right: r });
const call   = (base, args) => ({ type: 'CallExpression', base, arguments: args });
const local  = (names, init = []) => ({ type: 'LocalStatement', variables: names, init });
const assign = (vars, init) => ({ type: 'AssignmentStatement', variables: vars, init });

let _uid = 0;
const uid = p => `__${p}_${(_uid++).toString(36)}`;

/* ------------------------------------------------------------------ */
/* 0. Watermark                                                        */
/* ------------------------------------------------------------------ */
export const WATERMARK = '-- this script is protected by surrre4L!';
export const watermark = src => WATERMARK + '\n' + src;

/* ------------------------------------------------------------------ */
/* 1. Identifier renaming (classic _0xABCD)                            */
/* ------------------------------------------------------------------ */
function collectDeclared(ast) {
  const declared = new Set();
  walk(ast, {
    LocalStatement: n => n.variables.forEach(v => declared.add(v.name)),
    FunctionDeclaration: n => {
      if (n.isLocal && n.identifier) declared.add(n.identifier.name);
      n.parameters.forEach(p => { if (p.type === 'Identifier') declared.add(p.name); });
    },
    ForNumericStatement: n => n.variable && declared.add(n.variable.name),
    ForGenericStatement: n => n.variables.forEach(v => declared.add(v.name)),
  });
  return declared;
}

function rewriteIdentifiers(ast, mapper) {
  walk(ast, {
    Identifier: (n, parent) => {
      if (parent && parent.type === 'MemberExpression' && parent.identifier === n) return;
      if (parent && parent.type === 'TableKeyString' && parent.key === n) return;
      if (parent && parent.type === 'FunctionDeclaration'
          && parent.identifier === n && !parent.isLocal) return;
      const mapped = mapper(n.name);
      if (mapped) n.name = mapped;
    },
  });
}

export function renamePass(ast) {
  const declared = collectDeclared(ast);
  const map = new Map();
  let i = 0;
  for (const name of declared) {
    i++;
    map.set(name, '_0x' + i.toString(16).padStart(4, '0'));
  }
  rewriteIdentifiers(ast, n => map.get(n));
  return ast;
}

/* ------------------------------------------------------------------ */
/* 2. Mangle — look-alike identifier soup (l, I, 1, O, 0, S, 5, Z)     */
/* ------------------------------------------------------------------ */
const MANGLE_CHARS = 'Il1O0S5Zz';

function mangleName(len) {
  let s = '_';
  for (let i = 0; i < len; i++) {
    s += MANGLE_CHARS[Math.floor(Math.random() * MANGLE_CHARS.length)];
  }
  return s;
}

export function manglePass(ast) {
  const declared = collectDeclared(ast);
  const map = new Map();
  for (const name of declared) {
    map.set(name, mangleName(6 + Math.floor(Math.random() * 6)));
  }
  rewriteIdentifiers(ast, n => map.get(n));
  return ast;
}

/* ------------------------------------------------------------------ */
/* 3. S-Flood — the "full of S" technique                              */
/*     Every local becomes S, SS, SSS, SSSS, ...                       */
/* ------------------------------------------------------------------ */
export function sFloodPass(ast) {
  const declared = collectDeclared(ast);
  const map = new Map();
  let i = 1;
  for (const name of declared) {
    map.set(name, 'S'.repeat(i));
    i++;
  }
  rewriteIdentifiers(ast, n => map.get(n));

  // Also obfuscate unbound global lookups so they don't stand out
  // (they will already have been rewritten by the env pass if it ran).
  return ast;
}

/* ------------------------------------------------------------------ */
/* 4. Environment hiding                                               */
/* ------------------------------------------------------------------ */
const ENV_SKIP = new Set(['_ENV', '_G', '_VERSION', 'self', 'S', 'SS']);

export function envPass(ast) {
  const locals = new Set();
  walk(ast, {
    LocalStatement: n => n.variables.forEach(v => locals.add(v.name)),
    FunctionDeclaration: n => {
      if (n.identifier) locals.add(n.identifier.name);
      n.parameters.forEach(p => { if (p.type === 'Identifier') locals.add(p.name); });
    },
    ForNumericStatement: n => n.variable && locals.add(n.variable.name),
    ForGenericStatement: n => n.variables.forEach(v => locals.add(v.name)),
  });

  const envName = '__env';

  walk(ast, {
    Identifier: (n, parent) => {
      if (parent && parent.type === 'MemberExpression' && parent.identifier === n) return;
      if (parent && parent.type === 'TableKeyString' && parent.key === n) return;
      if (locals.has(n.name)) return;
      if (ENV_SKIP.has(n.name)) return;
      if (n.name.startsWith('__')) return;

      const original = n.name;
      n.type = 'IndexExpression';
      n.base = { type: 'Identifier', name: envName };
      n.index = mkStr(original);
    },
  });

  const prelude = local([mkId(envName)], [{
    type: 'LogicalExpression', operator: 'or',
    left: {
      type: 'LogicalExpression', operator: 'and',
      left: mkId('getfenv'),
      right: call(mkId('getfenv'), [mkNum(1)]),
    },
    right: {
      type: 'LogicalExpression', operator: 'or',
      left: mkId('_ENV'),
      right: mkId('_G'),
    },
  }]);

  ast.body.unshift(prelude);
  return ast;
}

/* ------------------------------------------------------------------ */
/* 5. String encoding — chained / stacked                              */
/* ------------------------------------------------------------------ */
const DECODERS = {
  xor: `local function __xd(s,k)
  local t={}
  for i=1,#s do t[i]=string.char(bit32.bxor(string.byte(s,i),k)) end
  return table.concat(t)
end`,
  b64: `local function __b64(s)
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  return (s:gsub('[^'..b..'=]',''):gsub('.',function(x)
    if x=='=' then return '' end
    local r,f='',(b:find(x,1,true)-1)
    for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
    return r
  end):gsub('%d%d%d?%d?%d?%d?%d?%d?',function(x)
    if #x~=8 then return '' end
    local c=0
    for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
    return string.char(c)
  end))
end`,
  caesar: `local function __cs(s,k)
  local t={}
  for i=1,#s do t[i]=string.char((string.byte(s,i)+k)%256) end
  return table.concat(t)
end`,
};

function toBytes(str) {
  const b = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff;
  return b;
}
function bytesToLuaLit(bytes) {
  let out = '"';
  for (const b of bytes) {
    if (b >= 32 && b < 127 && b !== 34 && b !== 92) out += String.fromCharCode(b);
    else out += '\\' + String(b).padStart(3, '0');
  }
  return out + '"';
}

/**
 * chain is an ordered array like ['caesar','xor','b64'] —
 * caesar is applied first, b64 last. Decoders are nested in reverse.
 */
function encodeChain(value, chain) {
  let bytes = toBytes(value);
  const decoders = [];

  for (const mode of chain) {
    if (mode === 'xor') {
      const k = 1 + Math.floor(Math.random() * 255);
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ k;
      bytes = out;
      decoders.push({ fn: '__xd', args: [mkNum(k)] });
    } else if (mode === 'caesar') {
      const k = 1 + Math.floor(Math.random() * 255);
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] + k) & 0xff;
      bytes = out;
      decoders.push({ fn: '__cs', args: [mkNum(k)] });
    } else if (mode === 'b64') {
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      const b64 = btoa(bin);
      bytes = toBytes(b64);
      decoders.push({ fn: '__b64', args: [] });
    }
  }

  const lit = { type: 'StringLiteral', value: null, raw: bytesToLuaLit(bytes) };

  // Build nested call — outermost = first encoder's decoder
  let expr = lit;
  const rev = [...decoders].reverse();
  for (const d of rev) {
    expr = { type: 'CallExpression', base: mkId(d.fn), arguments: [expr, ...d.args] };
  }
  return { expr, used: new Set(chain) };
}

export function stringPass(ast, chain) {
  if (!chain || chain.length === 0) return { ast, decoderCode: '' };

  const usedDecoders = new Set();

  walk(ast, {
    StringLiteral: node => {
      if (!node.value) return;
      const { expr, used } = encodeChain(node.value, chain);
      used.forEach(u => usedDecoders.add(u));
      Object.assign(node, expr);
    },
  });

  const decoderCode = [...usedDecoders]
    .map(k => DECODERS[k])
    .filter(Boolean)
    .join('\n');

  return { ast, decoderCode };
}

/* ------------------------------------------------------------------ */
/* 6. Dead code injection                                              */
/* ------------------------------------------------------------------ */
export function deadCodePass(ast) {
  const blocks = collectBlocks(ast);
  for (const b of blocks) {
    if (!b.body || b.body.length === 0) continue;

    const n = 1 + Math.floor(Math.random() * 2);
    const inserts = [];
    for (let k = 0; k < n; k++) {
      const a = 1 + Math.floor(Math.random() * 1000);
      const b2 = 1 + Math.floor(Math.random() * 1000);
      inserts.push(local([mkId(uid('v'))], [
        binop('-', binop('+', mkNum(a), mkNum(b2)), mkNum(a))
      ]));
    }
    b.body.unshift(...inserts);
  }
  return ast;
}

/* ------------------------------------------------------------------ */
/* 7. Number splitting (recursive)                                     */
/* ------------------------------------------------------------------ */
function splitOnce(value) {
  if (!Number.isInteger(value) || Math.abs(value) < 4) return null;
  const a = Math.floor(value / 2) + (Math.random() < 0.5 ? 0 : 1);
  const b = value - a;
  if (a === 0 || b === 0) return null;
  if (Math.random() < 0.5) return binop('+', mkNum(a), mkNum(b));
  const b2 = 1 + Math.floor(Math.random() * 100);
  return binop('-', mkNum(value + b2), mkNum(b2));
}

export function numberSplitPass(ast, maxDepth = 3) {
  walk(ast, {
    NumericLiteral: (node, parent) => {
      if (parent && parent.type === 'ForNumericStatement'
          && (parent.start === node || parent.end === node || parent.step === node)) return;
      if (!Number.isInteger(node.value) || Math.abs(node.value) < 4) return;

      const repl = splitOnce(node.value);
      if (!repl) return;

      let depth = 1;
      while (depth < maxDepth) {
        const leaves = [];
        (function collect(n) {
          if (n.type === 'BinaryExpression') { collect(n.left); collect(n.right); }
          else leaves.push(n);
        })(repl);
        const leaf = leaves[Math.floor(Math.random() * leaves.length)];
        if (leaf.type !== 'NumericLiteral') break;
        const sub = splitOnce(leaf.value);
        if (!sub) break;
        Object.assign(leaf, sub);
        depth++;
      }
      Object.assign(node, repl);
    },
  });
  return ast;
}

/* ------------------------------------------------------------------ */
/* 8. Strong control-flow flattening                                   */
/*     state = 1*K+O, 2*K+O, ...  (arithmetic-hidden dispatcher)       */
/* ------------------------------------------------------------------ */
function hasReturnOrBreak(node) {
  let found = false;
  walk(node, {
    ReturnStatement: () => { found = true; },
    BreakStatement: () => { found = true; },
  });
  return found;
}

function flattenStrong(stmts) {
  if (stmts.length < 3) return stmts;
  if (stmts.some(s => s.type === 'LocalStatement')) return stmts;
  if (stmts.some(s => s.type === 'FunctionDeclaration')) return stmts;
  if (stmts.some(s => hasReturnOrBreak(s))) return stmts;

  const stName = uid('st');
  const K = 3 + Math.floor(Math.random() * 97);
  const O = 5 + Math.floor(Math.random() * 97);
  const stateVal = i => i * K + O;

  const decl = local([mkId(stName)], [mkNum(stateVal(1))]);

  const clauses = [];
  for (let i = 0; i < stmts.length; i++) {
    const body = [stmts[i]];
    const next = i === stmts.length - 1 ? 0 : i + 2;
    body.push(assign([mkId(stName)], [mkNum(stateVal(next))]));
    clauses.push({
      type: i === 0 ? 'IfClause' : 'ElseifClause',
      condition: binop('==', mkId(stName), mkNum(stateVal(i + 1))),
      body,
    });
  }
  clauses.push({ type: 'ElseClause', body: [] });

  const whileStmt = {
    type: 'WhileStatement',
    condition: binop('~=', mkId(stName), mkNum(0)),
    body: [{ type: 'IfStatement', clauses }],
  };

  return [{ type: 'DoStatement', body: [decl, whileStmt] }];
}

export function strongFlattenPass(ast) {
  const blocks = collectBlocks(ast);
  for (const b of blocks) {
    if (b.body && b.body.length >= 3) {
      b.body = flattenStrong(b.body);
    }
  }
  return ast;
}

/* ------------------------------------------------------------------ */
/* 9. VM / loader wrapper                                              */
/* ------------------------------------------------------------------ */
export function vmWrap(source, { xorKey = null } = {}) {
  const key = xorKey != null ? xorKey : 1 + Math.floor(Math.random() * 255);
  const bytes = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) bytes[i] = source.charCodeAt(i) ^ key;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);

  return `-- Luau Obfuscator \u00b7 VM Loader
local function __b64(s)
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  return (s:gsub('[^'..b..'=]',''):gsub('.',function(x)
    if x=='=' then return '' end
    local r,f='',(b:find(x,1,true)-1)
    for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
    return r
  end):gsub('%d%d%d?%d?%d?%d?%d?%d?',function(x)
    if #x~=8 then return '' end
    local c=0
    for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
    return string.char(c)
  end))
end
local function __xd(s,k)
  local t={}
  for i=1,#s do t[i]=string.char(bit32.bxor(string.byte(s,i),k)) end
  return table.concat(t)
end
local __p="${b64}"
local __src=__xd(__b64(__p),${key})
local __fn=(loadstring or load)(__src,"=obf")
if __fn then __fn() end
`;
}