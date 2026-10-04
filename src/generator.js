const PREC = {
  'or':1, 'and':2,
  '<':3, '>':3, '<=':3, '>=':3, '~=':3, '==':3,
  '|':4, '~':5, '&':6, '<<':7, '>>':7,
  '..':8, '+':9, '-':9,
  '*':10, '/':10, '//':10, '%':10,
  'unary':11, '^':12,
};

const indent = lvl => '  '.repeat(lvl);

export function generate(ast, { minify = false } = {}) {
  return genBlock(ast.body, 0, minify).trim() + '\n';
}

function genBlock(stmts, level, mini) {
  const i = mini ? '' : indent(level);
  const nl = mini ? ' ' : '\n';
  return stmts.map(s => genStatement(s, level, mini, i, nl)).join(mini ? ' ' : '');
}

function genStatement(s, level, mini, i, nl) {
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
      out += mini ? ' ' : '\n';
      out += genBlock(s.body, level + 1, mini);
      out += i + 'end' + nl;
      return out;
    }
    case 'IfStatement': {
      let out = '';
      s.clauses.forEach(c => {
        if (c.type === 'IfClause') out += i + 'if ' + genExpr(c.condition) + ' then' + (mini ? ' ' : '\n');
        else if (c.type === 'ElseifClause') out += i + 'elseif ' + genExpr(c.condition) + ' then' + (mini ? ' ' : '\n');
        else out += i + 'else' + (mini ? ' ' : '\n');
        out += genBlock(c.body, level + 1, mini);
      });
      out += i + 'end' + nl;
      return out;
    }
    case 'WhileStatement':
      return i + 'while ' + genExpr(s.condition) + ' do' + (mini ? ' ' : '\n')
        + genBlock(s.body, level + 1, mini) + i + 'end' + nl;
    case 'RepeatStatement':
      return i + 'repeat' + (mini ? ' ' : '\n') + genBlock(s.body, level + 1, mini)
        + i + 'until ' + genExpr(s.condition) + nl;
    case 'DoStatement':
      return i + 'do' + (mini ? ' ' : '\n') + genBlock(s.body, level + 1, mini) + i + 'end' + nl;
    case 'ReturnStatement':
      return i + 'return' + (s.arguments.length ? ' ' + s.arguments.map(genExpr).join(',') : '') + nl;
    case 'BreakStatement':
      return i + 'break' + nl;
    case 'ForNumericStatement':
      return i + 'for ' + s.variable.name + '=' + genExpr(s.start) + ',' + genExpr(s.end)
        + (s.step ? ',' + genExpr(s.step) : '') + ' do' + (mini ? ' ' : '\n')
        + genBlock(s.body, level + 1, mini) + i + 'end' + nl;
    case 'ForGenericStatement':
      return i + 'for ' + s.variables.map(v => v.name).join(',') + ' in '
        + s.iterators.map(genExpr).join(',') + ' do' + (mini ? ' ' : '\n')
        + genBlock(s.body, level + 1, mini) + i + 'end' + nl;
    default:
      throw new Error('Unknown statement type: ' + s.type);
  }
}

function genExpr(e, parentPrec = 0) {
  switch (e.type) {
    case 'Identifier': return e.name;
    case 'NumericLiteral': return e.raw || String(e.value);
    case 'StringLiteral': return e.raw || JSON.stringify(e.value);
    case 'BooleanLiteral': return e.value ? 'true' : 'false';
    case 'NilLiteral': return 'nil';
    case 'VarargLiteral': return '...';
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
      return genExpr(e.base, 13) + '(' + e.arguments.map(a => genExpr(a)).join(',') + ')';
    case 'TableConstructorExpression':
      return '{' + e.fields.map(f => {
        if (f.type === 'TableKey') return '[' + genExpr(f.key) + ']=' + genExpr(f.value);
        if (f.type === 'TableKeyString') return f.key.name + '=' + genExpr(f.value);
        return genExpr(f.value);
      }).join(',') + '}';
    case 'FunctionExpression': {
      const params = e.parameters.map(p => p.type === 'VarargLiteral' ? '...' : p.name).join(',');
      const body = genBlock(e.body, 1, false);
      return 'function(' + params + ')\n' + body + 'end';
    }
    default:
      throw new Error('Unknown expression type: ' + e.type);
  }
}