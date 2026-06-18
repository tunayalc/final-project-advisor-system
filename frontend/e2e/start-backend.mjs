import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');
const backendDir = path.join(repoRoot, 'backend');
const tempDir = mkdtempSync(path.join(tmpdir(), 'danisman-atama-e2e-'));
const dbPath = path.join(tempDir, 'danisman_atama.e2e.db');

const child = spawn(process.execPath, ['server.js'], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: '3000',
    DB_PATH: dbPath,
    JWT_SECRET: 'playwright-e2e-secret',
  },
  stdio: 'inherit',
});

let shuttingDown = false;

function cleanup() {
  rmSync(tempDir, { recursive: true, force: true });
}

function stop(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('exit', cleanup);

child.on('exit', (code, signal) => {
  cleanup();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
