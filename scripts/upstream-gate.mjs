import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PINNED_UPSTREAM_SHA = '6d96ab92e827e0471586c6291c78067b495ef44a';
const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const COMMANDS = Object.freeze({
  dev: ['run', 'dev'],
  build: ['run', 'build'],
  lint: ['run', 'lint'],
  'test:e2e': ['run', 'test:e2e'],
  'tauri:build': ['run', 'tauri:build'],
  'test:unit': ['exec', '--offline', '--', 'vitest', 'run'],
});

function git(source, args) {
  const result = spawnSync('git', ['-C', source, ...args], {
    encoding: 'utf8', timeout: 10_000, shell: false, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Git ${args[0]} failed: ${result.error?.message ?? result.stderr?.trim() ?? 'unknown error'}`);
  }
  return result.stdout.trim();
}

export function verifyUpstream({
  source = join(PROJECT_ROOT, 'upstream', 'locally-uncensored'),
  expectedSha = PINNED_UPSTREAM_SHA,
} = {}) {
  const errors = [];
  const location = resolve(source);
  let actualSha = null;
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) errors.push('Invalid expected commit SHA');
  if (!existsSync(location)) {
    errors.push('Upstream submodule is absent. Run: git submodule update --init --recursive');
    return { ok: false, source: location, expectedSha, actualSha, errors };
  }
  try {
    if (lstatSync(location).isSymbolicLink()) throw new Error('Symbolic source root is forbidden');
    if (!statSync(location).isDirectory()) throw new Error('Not a directory');
    const worktreeRoot = git(location, ['rev-parse', '--show-toplevel']);
    if (realpathSync(worktreeRoot) !== realpathSync(location)) {
      throw new Error('Source is not the Git worktree root');
    }
    actualSha = git(location, ['rev-parse', 'HEAD']);
    if (actualSha !== expectedSha) errors.push(`Commit mismatch: ${actualSha}`);
    const flags = git(location, ['ls-files', '-v', '-z']).split('\0').filter(Boolean);
    if (flags.some(entry => !entry.startsWith('H '))) {
      errors.push('Unexpected Git index flags (assume-unchanged, skip-worktree or nonstandard index state)');
    }
    const tracked = git(location, ['status', '--porcelain', '--untracked-files=no']);
    if (tracked) errors.push('Upstream tracked files have local modifications');
    if (git(location, ['ls-files', '--others', '--exclude-standard', '-z'])) {
      errors.push('Upstream has untracked non-ignored files');
    }
  } catch (error) {
    errors.push(error.message);
  }
  for (const relative of ['README.md', 'LICENSE', 'package.json', 'src/App.tsx', 'src/api/rag.ts', 'src-tauri/Cargo.toml']) {
    try {
      if (!statSync(join(location, relative)).isFile()) errors.push(`Not a file: ${relative}`);
    } catch { errors.push(`Missing upstream file: ${relative}`); }
  }
  try {
    const license = readFileSync(join(location, 'LICENSE'), 'utf8');
    if (!license.includes('GNU AFFERO GENERAL PUBLIC LICENSE')) errors.push('AGPL-3.0 license is missing');
    const pkg = JSON.parse(readFileSync(join(location, 'package.json'), 'utf8'));
    if (pkg.license !== 'AGPL-3.0-only') errors.push('Unexpected upstream package license');
    if (pkg.version !== '2.6.7') errors.push(`Unexpected upstream version: ${pkg.version}`);
  } catch (error) { errors.push(`Metadata validation failed: ${error.message}`); }
  return { ok: errors.length === 0, source: location, expectedSha, actualSha, errors };
}

export function runUpstream(action, { root = PROJECT_ROOT, expectedSha = PINNED_UPSTREAM_SHA } = {}) {
  const source = join(root, 'upstream', 'locally-uncensored');
  const status = verifyUpstream({ source, expectedSha });
  if (action === 'verify') {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return status.ok ? 0 : 1;
  }
  if (!Object.hasOwn(COMMANDS, action)) {
    process.stderr.write(`Unknown command: ${action}\n`);
    return 2;
  }
  if (!status.ok) {
    process.stderr.write(`${JSON.stringify(status, null, 2)}\n`);
    return 1;
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['--prefix', source, ...COMMANDS[action]], {
    stdio: 'inherit', shell: false,
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runUpstream(process.argv[2] ?? 'verify');
}
