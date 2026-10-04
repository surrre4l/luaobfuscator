import { walk, collectBlocks } from './walker.js';

/* ── helpers ──────────────────────────────────────────────────── */
const mkId   = n => ({ type: 'Identifier', name: n });
const mkNum  = v => ({ type: 'NumericLiteral', value: v, raw: String(v) });
const binop  = (op, l, r) => ({ type: 'BinaryExpression', operator: op, left: l, right: r });
const call   = (b, a) => ({ type: 'CallExpression', base: b, arguments: a });
const local  = (n, i = []) => ({ type: 'LocalStatement', variables: n, init: i });
const assign = (v, i) => ({ type: 'AssignmentStatement', variables: v, init: i });

let _uid = 0;
const uid = p => `__${p}_${(_uid++).toString(36)}`;

/* ── watermark ────────────────────────────────────────────────── */
export const WATERMARK = '-- this script is protected by surrre4L!';
export const watermark = s => WATERMARK + '\n' + s;

/* ── declared-set collector ───────────────────────────────────── */
function collectDeclared(ast) {
  const d = new Set();
  walk(ast, {
    LocalStatement: n => n.variables.forEach(v => d.add(v.name)),
    FunctionDeclaration: n => {
      if (n.isLocal && n.identifier) d.add(n.identifier.name);
      n.parameters.forEach(p => { if (p.type === 'Identifier') d.add(p.name); });
    },
    ForNumericStatement: n => n.variable && d.add(n.variable.name),
    ForGenericStatement: n => n.variables.forEach(v => d.add(v.name)),
  });
  return d;
}

function rewriteIds(ast, mapper) {
  walk(ast, {
    Identifier: (n, parent) => {
      if (parent && parent.type === 'MemberExpression' && parent.identifier === n) return;
      if (parent && parent.type === 'TableKeyString' && parent.key === n) return;
      if (parent && parent.type === 'FunctionDeclaration'
          && parent.identifier === n && !parent.isLocal) return;
      const m = mapper(n.name);
      if (m) n.name = m;
    },
  });
}

/* ── 1. Identifier styles ─────────────────────────────────────── */
export function renamePass(ast) {
  const d = collectDeclared(ast);
  const prefix = '_0x' + Math.floor(Math.random() * 0xff).toString(16).padStart(2, '0');
  const map = new Map();
  let i = 0;
  for (const name of d) {
    i++;
    map.set(name, prefix + i.toString(16).padStart(4, '0'));
  }
  rewriteIds(ast, n => map.get(n));
  return ast;
}

const MANGLE = 'Il1O0S5ZzoO0iIl1';
export function manglePass(ast) {
  const d = collectDeclared(ast);
  const map = new Map();
  for (const name of d) {
    let s = '_';
    const len = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < len; i++) s += MANGLE[Math.floor(Math.random() * MANGLE.length)];
    map.set(name, s);
  }
  rewriteIds(ast, n => map.get(n));
  return ast;
}

function repeatFlood(ast, ch) {
  const d = collectDeclared(ast);
  const map = new Map();
  let i = 1;
  for (const name of d) map.set(name, ch.repeat(i++));
  rewriteIds(ast, n => map.get(n));
  return ast;
}
export const sFloodPass = a => repeatFlood(a, 'S');
export const kFloodPass = a => repeatFlood(a, 'K');
export const lFloodPass = a => repeatFlood(a, 'L');

// Scramble — random mixes drawn from confusing chars, no repeats
export function scramblePass(ast) {
  const d = collectDeclared(ast);
  const CHARS = 'Il1O0S5ZzoKi';
  const used = new Set();
  const map = new Map();
  for (const name of d) {
    let s;
    do {
      s = '_';
      const len = 5 + Math.floor(Math.random() * 6);
      for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
    } while (used.has(s));
    used.add(s);
    map.set(name, s);
  }
  rewriteIds(ast, n => map.get(n));
  return ast;
}

/* ── 2. Environment hiding ────────────────────────────────────── */
const ENV_SKIP = new Set(['_ENV', '_G', '_VERSION', 'self']);

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

  const ENV = '__env';
  walk(ast, {
    Identifier: (n, parent) => {
      if (parent && parent.type === 'MemberExpression' && parent.identifier === n) return;
      if (parent && parent.type === 'TableKeyString' && parent.key === n) return;
      if (locals.has(n.name)) return;
      if (ENV_SKIP.has(n.name)) return;
      if (n.name.startsWith('__')) return;
      const orig = n.name;
      n.type = 'IndexExpression';
      n.base = mkId(ENV);
      n.index = { type: 'StringLiteral', value: orig, raw: JSON.stringify(orig) };
    },
  });

  ast.body.unshift(local([mkId(ENV)], [{
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
  }]));

  return ast;
}

/* ── 3. String encoding ───────────────────────────────────────── */
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
  rot: `local function __rt(s)
  local t={}
  for i=1,#s do t[i]=string.char((string.byte(s,i)+13)%256) end
  return table.concat(t)
end`,
  rev: `local function __rv(s)
  return s:reverse()
end`,
};

function toBytes(str) {
  const b = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff;
  return b;
}
function bytesLit(bytes) {
  let out = '"';
  for (const b of bytes) {
    if (b >= 32 && b < 127 && b !== 34 && b !== 92) out += String.fromCharCode(b);
    else out += '\\' + String(b).padStart(3, '0');
  }
  return out + '"';
}

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
    } else if (mode === 'rot') {
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] + 13) & 0xff;
      bytes = out;
      decoders.push({ fn: '__rt', args: [] });
    } else if (mode === 'rev') {
      bytes = new Uint8Array([...bytes].reverse());
      decoders.push({ fn: '__rv', args: [] });
    }
  }

  const lit = { type: 'StringLiteral', value: null, raw: bytesLit(bytes) };

  let expr = lit;
  const revDec = [...decoders].reverse();
  for (const d of revDec) {
    expr = { type: 'CallExpression', base: mkId(d.fn), arguments: [expr, ...d.args] };
  }
  return { expr, used: new Set(chain) };
}

export function stringPass(ast, chain) {
  if (!chain || !chain.length) return { ast, decoderCode: '' };
  const used = new Set();
  walk(ast, {
    StringLiteral: node => {
      if (node.value == null) return;
      const { expr, used: u } = encodeChain(node.value, chain);
      u.forEach(x => used.add(x));
      Object.assign(node, expr);
    },
  });
  const decoderCode = [...used].map(k => DECODERS[k]).filter(Boolean).join('\n');
  return { ast, decoderCode };
}

/* ── 4. Dead code injection ───────────────────────────────────── */
function deadStmt() {
  // local __v = a OP b  where result is meaningless
  const a = 1 + Math.floor(Math.random() * 2000);
  const b = 1 + Math.floor(Math.random() * 2000);
  const op = ['+', '-', '*'][Math.floor(Math.random() * 3)];
  if (op === '*') {
    return local([mkId(uid('v'))], [binop('-', binop('*', mkNum(a), mkNum(b)), mkNum(a * b))]);
  }
  return local([mkId(uid('v'))], [binop('-', binop(op, mkNum(a), mkNum(b)), mkNum(op === '+' ? a + b : a - b))]);
}

function deadIf() {
  // if 1==2 then ... end  (never executes)
  return {
    type: 'IfStatement',
    clauses: [{
      type: 'IfClause',
      condition: binop('==', mkNum(1), mkNum(2)),
      body: [local([mkId(uid('x'))], [mkNum(Math.random() * 1000)])],
    }, {
      type: 'ElseClause',
      body: [],
    }],
  };
}

export function deadCodePass(ast) {
  const blocks = collectBlocks(ast);
  for (const b of blocks) {
    if (!b.body || b.body.length === 0) continue;
    const inserts = [];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) inserts.push(deadStmt());
    if (Math.random() < 0.4) inserts.push(deadIf());
    b.body.unshift(...inserts);
  }
  return ast;
}

/* ── 5. Number splitting ──────────────────────────────────────── */
function splitNum(value) {
  if (!Number.isInteger(value) || Math.abs(value) < 4) return null;
  const strategy = Math.floor(Math.random() * 3);

  if (strategy === 0) {
    const a = Math.floor(value / 2) + Math.floor(Math.random() * 2) - 1;
    if (a === 0 || a === value) return null;
    return binop('+', mkNum(a), mkNum(value - a));
  } else if (strategy === 1) {
    const b = 1 + Math.floor(Math.random() * 500);
    return binop('-', mkNum(value + b), mkNum(b));
  } else {
    const m = 2 + Math.floor(Math.random() * 5);
    const q = Math.floor(value / m);
    if (q * m !== value) {
      const r = value - q * m;
      return binop('+', binop('*', mkNum(q), mkNum(m)), mkNum(r));
    }
    return binop('*', mkNum(q), mkNum(m));
  }
}

export function numberSplitPass(ast, depth = 3) {
  walk(ast, {
    NumericLiteral: (node, parent) => {
      if (parent && parent.type === 'ForNumericStatement'
          && (parent.start === node || parent.end === node || parent.step === node)) return;
      if (!Number.isInteger(node.value) || Math.abs(node.value) < 4) return;

      const repl = splitNum(node.value);
      if (!repl) return;

      let d = 1;
      while (d < depth) {
        const leaves = [];
        (function collect(n) {
          if (n.type === 'BinaryExpression') { collect(n.left); collect(n.right); }
          else leaves.push(n);
        })(repl);
        const leaf = leaves[Math.floor(Math.random() * leaves.length)];
        if (leaf.type !== 'NumericLiteral') break;
        const sub = splitNum(leaf.value);
        if (!sub) break;
        Object.assign(leaf, sub);
        d++;
      }
      Object.assign(node, repl);
    },
  });
  return ast;
}

/* ── 6. Strong control-flow flattening ────────────────────────── */
function hasReturnOrBreak(node) {
  let f = false;
  walk(node, {
    ReturnStatement: () => { f = true; },
    BreakStatement: () => { f = true; },
  });
  return f;
}

function flattenStrong(stmts) {
  if (stmts.length < 3) return stmts;
  if (stmts.some(s => s.type === 'LocalStatement')) return stmts;
  if (stmts.some(s => s.type === 'FunctionDeclaration')) return stmts;
  if (stmts.some(s => hasReturnOrBreak(s))) return stmts;

  const stName = uid('st');
  const K = 4 + Math.floor(Math.random() * 40);   // state multiplier
  const O = 7 + Math.floor(Math.random() * 200);  // state offset
  const state = i => i * K + O;

  // Optional second layer: hidden dispatch value
  const clauses = [];
  for (let i = 0; i < stmts.length; i++) {
    let body = [stmts[i]];
    const next = i === stmts.length - 1 ? 0 : i + 2;
    body.push(assign([mkId(stName)], [mkNum(state(next))]));

    // Wrap 30% of the statements in a trivially-true conditional
    if (Math.random() < 0.3) {
      body[0] = {
        type: 'IfStatement',
        clauses: [
          { type: 'IfClause', condition: binop('~=', mkNum(3), mkNum(4)), body: [body[0]] },
          { type: 'ElseClause', body: [deadStmt()] },
        ],
      };
    }
    clauses.push({
      type: i === 0 ? 'IfClause' : 'ElseifClause',
      condition: binop('==', mkId(stName), mkNum(state(i + 1))),
      body,
    });
  }
  clauses.push({ type: 'ElseClause', body: [] });

  return [{
    type: 'DoStatement',
    body: [
      local([mkId(stName)], [mkNum(state(1))]),
      {
        type: 'WhileStatement',
        condition: binop('~=', mkId(stName), mkNum(0)),
        body: [{ type: 'IfStatement', clauses }],
      },
    ],
  }];
}

export function strongFlattenPass(ast) {
  const blocks = collectBlocks(ast);
  for (const b of blocks) {
    if (b.body && b.body.length >= 3) b.body = flattenStrong(b.body);
  }
  return ast;
}

/* ── 7. VM loader wrapper ─────────────────────────────────────── */
export function vmWrap(source, { xorKey = null } = {}) {
  const key = xorKey != null ? xorKey : 1 + Math.floor(Math.random() * 255);
  const bytes = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) bytes[i] = source.charCodeAt(i) ^ key;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return `-- Luau Obfuscator · VM Loader
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