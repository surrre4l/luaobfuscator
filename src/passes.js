import { walk, collectBlocks } from './walker.js';
import { generate } from './generator.js';

/* ---------- helpers ---------- */
const mkId   = n => ({ type: 'Identifier', name: n });
const mkNum  = v => ({ type: 'NumericLiteral', value: v, raw: String(v) });
const mkStr  = s => ({ type: 'StringLiteral', value: s, raw: null });
const binop  = (op, l, r) => ({ type: 'BinaryExpression', operator: op, left: l, right: r });
const call   = (base, args) => ({ type: 'CallExpression', base, arguments: args });
const local  = (names, init = []) => ({ type: 'LocalStatement', variables: names, init });
const assign = (vars, init) => ({ type: 'AssignmentStatement', variables: vars, init });

let _uid = 0;
const uid = p => `__${p}_${(_uid++).toString(36)}`;

/* ---------- 1. Identifier renaming ---------- */
export function renamePass(ast) {
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

  const map = new Map();
  let i = 0;
  for (const name of declared) {
    i++;
    map.set(name, '_0x' + i.toString(16).padStart(4, '0'));
  }

  walk(ast, {
    Identifier: (n, parent) => {
      if (parent && parent.type === 'MemberExpression' && parent.identifier === n) return;
      if (parent && parent.type === 'TableKeyString' && parent.key === n) return;
      if (parent && parent.type === 'FunctionDeclaration'
          && parent.identifier === n && !parent.isLocal) return;
      if (map.has(n.name)) n.name = map.get(n.name);
    },
  });
  return ast;
}

/* ---------- 2. Environment hiding ---------- */
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

  const envName = '__env';

  walk(ast, {
    Identifier: (n, parent) => {
      if (parent && parent.type === 'MemberExpression' && parent.identifier === n) return;
      if (parent && parent.type === 'TableKeyString' && parent.key === n) return;
      if (locals.has(n.name)) return;
      if (ENV_SKIP.has(n.name)) return;
      if (n.name.startsWith('__')) return;

      // Turn the node itself into  __env["name"]
      const original = n.name;
      n.type = 'IndexExpression';
      n.base = { type: 'Identifier', name: envName };
      n.index = mkStr(original);
    },
  });

  // Prepend:  local __env = (getfenv and getfenv(1)) or _ENV or _G
  const prelude = {
    type: 'LocalStatement',
    variables: [mkId(envName)],
    init: [{
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
    }],
  };

  ast.body.unshift(prelude);
  return ast;
}

/* ---------- 3. String encoding ---------- */
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

function escByte(b) {
  // Emit a Lua string literal byte-escape that's always safe
  return '\\' + String(b).padStart(3, '0');
}
function bytesToLua(bytes) {
  let out = '"';
  for (const b of bytes) {
    if (b >= 32 && b < 127 && b !== 34 && b !== 92) out += String.fromCharCode(b);
    else out += escByte(b);
  }
  return out + '"';
}

export function stringPass(ast, mode) {
  if (mode === 'none') return ast;

  const used = { xor: false, b64: false, caesar: false };

  walk(ast, {
    StringLiteral: node => {
      const value = node.value;
      if (!value) return;

      if (mode === 'xor') {
        const key = 1 + Math.floor(Math.random() * 255);
        const bytes = [];
        for (let i = 0; i < value.length; i++) bytes.push(value.charCodeAt(i) ^ key);
        const lit = mkStr(null);
        lit.raw = bytesToLua(bytes);
        node.type = 'CallExpression';
        node.base = mkId('__xd');
        node.arguments = [lit, mkNum(key)];
        used.xor = true;
      } else if (mode === 'b64') {
        const b64 = btoa(unescape(encodeURIComponent(value)));
        node.type = 'CallExpression';
        node.base = mkId('__b64');
        node.arguments = [mkStr(null).constructor === Object ? Object.assign(mkStr(b64), { raw: JSON.stringify(b64) }) : mkStr(b64)];
        node.arguments[0].raw = JSON.stringify(b64);
        used.b64 = true;
      } else if (mode === 'caesar') {
        const key = 1 + Math.floor(Math.random() * 255);
        const bytes = [];
        for (let i = 0; i < value.length; i++) bytes.push((value.charCodeAt(i) + key) % 256);
        const lit = mkStr(null);
        lit.raw = bytesToLua(bytes);
        node.type = 'CallExpression';
        node.base = mkId('__cs');
        node.arguments = [lit, mkNum(key)];
        used.caesar = true;
      }
    },
  });

  const decoderCode = Object.keys(used).filter(k => used[k]).map(k => DECODERS[k]).join('\n');
  if (decoderCode) {
    // Parse decoder prelude and prepend to body
    // Simple line-based parse is not safe → use our own parser
    // We import it lazily to avoid cycles
    return { ast, decoderCode };
  }
  return { ast, decoderCode: '' };
}

/* ---------- 4. Dead code injection ---------- */
export function deadCodePass(ast) {
  const blocks = collectBlocks(ast);
  for (const b of blocks) {
    if (!b.body || b.body.length === 0) continue;

    // Build a few cheap opaque statements
    const n = 1 + Math.floor(Math.random() * 2);
    const inserts = [];
    for (let k = 0; k < n; k++) {
      const a = 1 + Math.floor(Math.random() * 1000);
      const b2 = 1 + Math.floor(Math.random() * 1000);
      const sum = a + b2;
      // local _v = a + b2 - a  (== b2)
      inserts.push(local([mkId(uid('v'))], [
        binop('-', binop('+', mkNum(a), mkNum(b2)), mkNum(a))
      ]));
    }
    b.body.unshift(...inserts);
  }
  return ast;
}

/* ---------- 5. Control-flow flattening ---------- */
function hasReturnOrBreak(node) {
  let found = false;
  walk(node, {
    ReturnStatement: () => { found = true; },
    BreakStatement: () => { found = true; },
    FunctionDeclaration: () => { /* nested functions are their own scope */ },
  });
  return found;
}

function flattenStmts(stmts) {
  if (stmts.length < 2) return stmts;
  if (stmts.some(s => s.type === 'LocalStatement')) return stmts;
  if (stmts.some(s => s.type === 'FunctionDeclaration')) return stmts;
  if (stmts.some(s => hasReturnOrBreak(s))) return stmts;

  const stName = uid('st');
  const decl = local([mkId(stName)], [mkNum(1)]);

  const clauses = [];
  for (let i = 0; i < stmts.length; i++) {
    const body = [stmts[i]];
    body.push(assign([mkId(stName)], [mkNum(i === stmts.length - 1 ? 0 : i + 2)]));
    const cond = binop('==', mkId(stName), mkNum(i + 1));
    clauses.push({
      type: i === 0 ? 'IfClause' : 'ElseifClause',
      condition: cond,
      body,
    });
  }
  clauses.push({ type: 'ElseClause', body: [] });

  const whileStmt = {
    type: 'WhileStatement',
    condition: binop('~=', mkId(stName), mkNum(0)),
    body: [{ type: 'IfStatement', clauses }],
  };

  return [{
    type: 'DoStatement',
    body: [decl, whileStmt],
  }];
}

export function flattenPass(ast) {
  const blocks = collectBlocks(ast);
  for (const b of blocks) {
    if (b.body && b.body.length >= 2) {
      b.body = flattenStmts(b.body);
    }
  }
  return ast;
}

/* ---------- 6. VM / loader wrapper ---------- */
export function vmWrap(source, { xorKey = null } = {}) {
  // xor-encode source, then base64 it
  const key = xorKey != null ? xorKey : 1 + Math.floor(Math.random() * 255);
  const bytes = [];
  for (let i = 0; i < source.length; i++) bytes.push(source.charCodeAt(i) ^ key);
  const u8 = new Uint8Array(bytes);
  const b64 = btoa(String.fromCharCode(...u8));

  const wrap = `-- Luau Obfuscator · VM Loader
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
  return wrap;
}