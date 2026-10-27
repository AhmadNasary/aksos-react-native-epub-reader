// Compiles src/ to lib/ (CommonJS + .d.ts) and copies the sound assets next to it.
// Metro uses the "react-native" field (src/), plain Node / bundlers use lib/.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tsc = require.resolve('typescript/bin/tsc', { paths: [root] });

fs.rmSync(path.join(root, 'lib'), { recursive: true, force: true });
execFileSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.build.json')], { stdio: 'inherit', cwd: root });

fs.cpSync(path.join(root, 'src', 'assets'), path.join(root, 'lib', 'assets'), { recursive: true });
console.log('lib built');
