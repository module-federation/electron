// Rehearses the OTA flow offline, without Zephyr:
//   1. build both remotes as v1, plus the host and the Electron shell
//   2. serve the remotes like Zephyr's edge, open the app and check it shows v1, v1
//   3. rebuild only the Vite remote as v2
//   4. reload the same window, as "Check for updates" does, and check it shows v1, v2
//      while the host's build output is unchanged
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;

function run(command, args, env = {}) {
  const childEnv = { ...process.env, ...env };
  delete childEnv.ZEPHYR_DEPLOY;
  // Electron runs as plain Node when launched from a terminal that sets this.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(command, args, { cwd: here, env: childEnv, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
}

function step(label, command, args, env) {
  const result = run(command, args, env);
  if (!result.ok) {
    console.error(`✗ ${label}\n${result.output}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
  return result.output;
}

function hashDir(dir) {
  const hash = createHash('sha256');
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(path.relative(dir, full)).update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex').slice(0, 12);
}

/** Starts the app and resolves each time it reports the versions it rendered. */
function launchApp() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    'pnpm',
    ['--filter', 'ota-electron', 'exec', 'electron', '.', '--smoke', '--reload-on-stdin'],
    {
      cwd: here,
      env,
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  );
  let buffer = '';
  const waiters = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const reports = [...buffer.matchAll(/(?:\[smoke\] \w+: \S+.*\n){2}/g)];
    while (reports.length > 0 && waiters.length > 0) {
      const report = reports.shift()[0];
      buffer = buffer.slice(buffer.indexOf(report) + report.length);
      waiters.shift()(
        Object.fromEntries(
          [...report.matchAll(/\[smoke\] (\w+): (\S+)/g)].map(([, r, v]) => [r, v]),
        ),
      );
    }
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  return {
    nextReport: () => new Promise((resolve) => waiters.push(resolve)),
    reload: () => child.stdin.write('reload\n'),
    exited,
  };
}

const buildArgs = (pkg) => ['--filter', pkg, 'run', 'build'];

step('build remotes as v1', 'pnpm', ['--filter', 'ota-remote-*', 'run', 'build'], {
  DEMO_VERSION: 'v1',
});
step('build the host and the Electron shell', 'pnpm', buildArgs('ota-electron...'));

// A child process, because spawnSync below blocks this process's event loop.
const edge = spawn(process.execPath, [path.join(here, 'edge-server.mjs')], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  let output = '';
  edge.stdout.on('data', (chunk) => {
    output += chunk;
    // One line per remote once its port is listening.
    if (output.split('edge:').length > 2) resolve();
  });
  edge.once('exit', (code) => reject(new Error(`edge server exited with ${code}`)));
});
try {
  const hostBefore = hashDir(path.join(here, 'host/dist'));
  const app = launchApp();
  const before = await app.nextReport();
  console.log(`✓ open the app: ${JSON.stringify(before)}`);

  step('rebuild only the Vite remote as v2', 'pnpm', buildArgs('ota-remote-vite'), {
    DEMO_VERSION: 'v2',
  });

  const afterReport = app.nextReport();
  app.reload();
  const after = await afterReport;
  console.log(`✓ reload the window: ${JSON.stringify(after)}`);
  const exitCode = await app.exited;
  const hostAfter = hashDir(path.join(here, 'host/dist'));
  console.log(`  host build output: ${hostBefore} -> ${hostAfter}`);

  const updated =
    exitCode === 0 &&
    before.ota_remote_rsbuild === 'v1' &&
    before.ota_remote_vite === 'v1' &&
    after.ota_remote_rsbuild === 'v1' &&
    after.ota_remote_vite === 'v2' &&
    hostBefore === hostAfter;
  console.log(
    updated ? '✓ the Vite remote updated without rebuilding the host' : '✗ no OTA update',
  );
  process.exitCode = updated ? 0 : 1;
} finally {
  edge.kill();
}
