/**
 * Two dev-server patches. Webpack 5 rejects a file when a statement appears
 * before `import`. Create React App's dev tools both do that:
 * Babel's JSX filename helper, and the React Refresh loader.
 */
const fs = require('fs');
const path = require('path');

function patchBabel() {
  const target = path.join(
    __dirname,
    '..',
    'node_modules',
    '@babel',
    'core',
    'lib',
    'transformation',
    'block-hoist-plugin.js'
  );
  if (!fs.existsSync(target)) {
    console.warn('Babel is not installed yet; skipped the import-order fix.');
    return;
  }

  const source = fs.readFileSync(target, 'utf8');
  if (source.includes('bodyNode.type === "ImportDeclaration"')) return;

  const needle = 'function priority(bodyNode) {\n  const priority = bodyNode == null ? void 0 : bodyNode._blockHoist;';
  const needleCrlf = needle.replace(/\n/g, '\r\n');
  const matched = source.includes(needle) ? needle : source.includes(needleCrlf) ? needleCrlf : '';
  if (!matched) {
    console.error('Could not update Babel import order. The block-hoist plugin layout changed.');
    process.exit(1);
  }

  const replacement = `function priority(bodyNode) {
  if (bodyNode && bodyNode.type === "ImportDeclaration") return 4;
  const priority = bodyNode == null ? void 0 : bodyNode._blockHoist;`;
  fs.writeFileSync(target, source.replace(matched, replacement));
  console.log('Updated Babel so import lines stay above the JSX filename helper.');
}

function patchRefreshLoader() {
  const target = path.join(
    __dirname,
    '..',
    'node_modules',
    '@pmmmwh',
    'react-refresh-webpack-plugin',
    'loader',
    'index.js'
  );
  if (!fs.existsSync(target)) {
    console.warn('React Refresh loader is not installed yet; skipped that fix.');
    return;
  }

  let source = fs.readFileSync(target, 'utf8');
  if (source.includes("node.add(['\\n\\n', RefreshSetupRuntime, '\\n\\n', RefreshModuleRuntime])")) return;

  const prepend = "node.prepend([RefreshSetupRuntime, '\\n\\n']);\n        node.add(['\\n\\n', RefreshModuleRuntime]);";
  const prependCrlf = prepend.replace(/\n/g, '\r\n');
  const joined = "return [[RefreshSetupRuntime, source, RefreshModuleRuntime].join('\\n\\n'), inputSourceMap];";
  if (!source.includes(prepend) && !source.includes(prependCrlf)) {
    console.error('Could not update the React Refresh loader. Its layout changed.');
    process.exit(1);
  }
  if (!source.includes(joined)) {
    console.error('Could not update the React Refresh loader join. Its layout changed.');
    process.exit(1);
  }

  source = source.replace(
    source.includes(prepend) ? prepend : prependCrlf,
    "node.add(['\\n\\n', RefreshSetupRuntime, '\\n\\n', RefreshModuleRuntime]);"
  );
  source = source.replace(
    joined,
    "return [[source, RefreshSetupRuntime, RefreshModuleRuntime].join('\\n\\n'), inputSourceMap];"
  );
  fs.writeFileSync(target, source);
  console.log('Updated React Refresh so it no longer inserts code above import lines.');
}

patchBabel();
patchRefreshLoader();
