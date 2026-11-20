import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// esbuild cannot delete its temp files in the system temp folder on this machine,
// so both it and Vite get a temp folder inside the project.
const tmp = path.resolve('.tmp');
mkdirSync(tmp, { recursive: true });
process.env.TMP = tmp;
process.env.TEMP = tmp;
process.env.TMPDIR = tmp;

const [mode = 'build', ...rest] = process.argv.slice(2);
// Run Vite's own entry with this Node, so no shell is involved and paths with
// spaces are safe.
const vite = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [vite, mode, ...rest], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
