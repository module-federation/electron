// Fails if a published package depends on a URL, git, or file spec. npm consumers
// can't install those, e.g. a pkg.pr.new preview pinned while waiting on a fix.
import { readdirSync, readFileSync } from 'node:fs';

const unpublishable = /^(https?:|git\+|git:|github:|file:|link:)/;
let failed = false;

for (const dir of readdirSync('packages')) {
  const file = `packages/${dir}/package.json`;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (pkg.private) continue;

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (unpublishable.test(spec)) {
        console.log(
          `::error file=${file}::${field}.${name} is "${spec}", which can't be published`,
        );
        failed = true;
      }
    }
  }
}

if (!failed) console.log('All packages are publishable.');
process.exit(failed ? 1 : 0);
