const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src', 'components', 'Portals');
const tag = 'di' + 'v';

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.jsx')) {
      const t = fs.readFileSync(p, 'utf8');
      const badOpen = '<' + 'motion-safe';
      const badClose = '</' + 'motion-safe>';
      const n = t
        .split(badOpen)
        .join('<' + tag)
        .split(badClose)
        .join('</' + tag + '>');
      if (n !== t) {
        fs.writeFileSync(p, n);
        console.log('fixed', p);
      }
    }
  }
}

walk(root);
