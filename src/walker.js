export function walk(node, visitors, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  const enter = visitors[node.type];
  if (enter) enter(node, parent);

  for (const key in node) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'scope' || key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, visitors, node);
    } else if (child && typeof child.type === 'string') {
      walk(child, visitors, node);
    }
  }

  const exit = visitors[node.type + ':exit'];
  if (exit) exit(node, parent);
}

// Collect every "block-holder" node so passes can rewrite its .body
export function collectBlocks(ast) {
  const blocks = [];
  walk(ast, {
    Chunk: n => blocks.push(n),
    DoStatement: n => blocks.push(n),
    WhileStatement: n => blocks.push(n),
    RepeatStatement: n => blocks.push(n),
    ForNumericStatement: n => blocks.push(n),
    ForGenericStatement: n => blocks.push(n),
    IfClause: n => blocks.push(n),
    ElseifClause: n => blocks.push(n),
    ElseClause: n => blocks.push(n),
    FunctionDeclaration: n => blocks.push(n),
    FunctionExpression: n => blocks.push(n),
  });
  return blocks;
}