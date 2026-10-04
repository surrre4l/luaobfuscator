const PREC = {
  'or':1, 'and':2,
  '<':3, '>':3, '<=':3, '>=':3, '~=':3, '==':3,
  '|':4, '~':5, '&':6, '<<':7, '>>':7,
  '..':8, '+':9, '-':9,
  '*':10, '/':10, '//':10, '%':10,
  'unary':11, '^':12,
};

const ind = l => '  '.repeat(l);

export function generate(ast, { minify = false } = {}) {
  return genBlock(ast.body, 0, minify).trim() + '\n';
}

function genBlock(stmts, level, m) {
  const i  = m ? '' : ind(level);
  const nl = m ? ' ' : '\n';
  return stmts.map(s => genStmt(s, level, m, i, nl)).join(m ? ' ' : '');
}

function genStmt(s, level, m, i, nl) {
  switch (s.type) {
    case 'LocalStatement': {
      let out = i + 'local ' + s.variables.map(genExpr).join(',');
      if (s.init.length) out += '=' + s.init.map(genExpr).join(',');
      return out + nl;
    }
    case 'AssignmentStatement':
      return i + s.variables.map(genExpr).join(',') + '=' + s.init.map(genExpr).join(',') + nl;
    case 'CallStatement':
      return i + genExpr(s.expression) + nl;
    case 'FunctionDeclaration': {
      let out = i + (s.isLocal ? 'local ' : '') + 'function ';
      if (s.identifier) out += s.identifier.name;
      out += '(' + s.parameters.map(p => p.type === 'VarargLiteral' ? '...' : p.name).join(',') + ')';
      out += m ? ' ' : '\n';
      out += genBlock(s.body, level + 1, m);
      out += i + 'end' + nl;
      return out;
    }
    case 'IfStatement': {
      let out = '';
      for (const c of s.clauses) {
        if (c.type === 'IfClause')        out += i + 'if ' + genExpr(c.condition) + ' then' + (m ? ' ' : '\n');
        else if (c.type === 'ElseifClause') out += i + 'elseif ' + genExpr(c.condition) + ' then' + (m ? ' ' : '\n');
        else                              out += i + 'else' + (m ? ' ' : '\n');
        out += genBlock(c.body, level + 1, m);
      }
      return out + i + 'end' + nl;
    }
    case 'WhileStatement':
      return i + 'while ' + genExpr(s.condition) + ' do' + (m ? ' ' : '\n')
        + genBlock(s.body, level + 1, m) + i + 'end' + nl;
    case 'RepeatStatement':
      return i + 'repeat' + (m ? ' ' : '\n') + genBlock(s.body, level + 1, m)
        + i + 'until ' + genExpr(s.condition) + nl;
    case 'DoStatement':
      return i + 'do' + (m ? ' ' : '\n') + genBlock(s.body, level + 1, m) + i + 'end' + nl;
    case 'ReturnStatement':
      return i + 'return' + (s.arguments.length ? ' ' + s.arguments.map(genExpr).join(',') : '') + nl;
    case 'BreakStatement':
      return i + 'break' + nl;
    case 'ForNumericStatement':
      return i + 'for ' + s.variable.name + '=' + genExpr(s.start) + ',' + genExpr(s.end)
        + (s.step ? ',' + genExpr(s.step) : '') + ' do' + (m ? ' ' : '\n')
        + genBlock(s.body, level + 1, m) + i + 'end' + nl;
    case 'ForGenericStatement':
      return i + 'for ' + s.variables.map(v => v.name).join(',') + ' in '
        + s.iterators.map(genExpr).join(',') + ' do' + (m ? ' ' : '\n')
        + genBlock(s.body, level + 1, m) + i + 'end' + nl;
    default:
      throw new Error('Unknown statement: ' + s.type);
  }
}

function genExpr(e, parentPrec = 0) {
  switch (e.type) {
    case 'Identifier':     return e.name;
    case 'NumericLiteral': return e.raw != null ? e.raw : String(e.value);
    case 'StringLiteral':  return e.raw != null ? e.raw : JSON.stringify(e.value);
    case 'BooleanLiteral': return e.value ? 'true' : 'false';
    case 'NilLiteral':     return 'nil';
    case 'VarargLiteral':  return '...';
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const p = PREC[e.operator] || 5;
      const s = genExpr(e.left, p) + ' ' + e.operator + ' ' + genExpr(e.right, p + 0.5);
      return p < parentPrec ? '(' + s + ')' : s;
    }
    case 'UnaryExpression': {
      const p = PREC.unary;
      const s = e.operator + ' ' + genExpr(e.argument, p);
      return p < parentPrec ? '(' + s + ')' : s;
    }
    case 'MemberExpression':
      return genExpr(e.base, 13) + e.indexer + e.identifier.name;
    case 'IndexExpression':
      return genExpr(e.base, 13) + '[' + genExpr(e.index) + ']';
    case 'CallExpression':
      return genExpr(e.base, 13) + '(' + e.arguments.map(genExpr).join(',') + ')';
    case 'TableConstructorExpression':
      return '{' + e.fields.map(f => {
        if (f.type === 'TableKey')       return '[' + genExpr(f.key) + ']=' + genExpr(f.value);
        if (f.type === 'TableKeyString') return f.key.name + '=' + genExpr(f.value);
        return genExpr(f.value);
      }).join(',') + '}';
    case 'FunctionExpression': {
      const params = e.parameters.map(p => p.type === 'VarargLiteral' ? '...' : p.name).join(',');
      return 'function(' + params + ')\n' + genBlock(e.body, 1, false) + 'end';
    }
    default:
      throw new Error('Unknown expression: ' + e.type);
  }
}