interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map() };

  for (const filePath of paths) {
    const parts = filePath.split('/');
    let currentNode = root;

    for (const part of parts) {
      if (!currentNode.children.has(part)) {
        currentNode.children.set(part, { name: part, children: new Map() });
      }
      currentNode = currentNode.children.get(part)!;
    }
  }

  return root;
}

function generateTreeString(node: TreeNode, prefix: string = ''): string {
  let result = '';
  const entries = Array.from(node.children.values());
  const lastIndex = entries.length - 1;

  entries.forEach((child, index) => {
    const isLast = index === lastIndex;
    result += `${prefix}${isLast ? '└── ' : '├── '}${child.name}\n`;
    result += generateTreeString(child, `${prefix}${isLast ? '    ' : '│   '}`);
  });

  return result;
}

/**
 * Generates a nice tree structure from a list of file paths.
 */
export function generateTree(paths: string[]): string {
  const tree = buildTree(paths);
  return '.\n' + generateTreeString(tree);
}
