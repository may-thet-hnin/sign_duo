// `npm run dev:lan`: the Vite dev server and the LAN helper in one terminal.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const children = [
  spawn(process.execPath, ['server/lan-relay.mjs'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: root, stdio: 'inherit' }),
];
const stop = () => { for (const child of children) child.kill(); process.exit(0); };
for (const child of children) child.on('exit', code => { if (code) stop(); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
