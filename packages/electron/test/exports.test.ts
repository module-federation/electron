import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';

// Everything resolves through package.json `exports`, so these check the built files a consumer gets.
const require = createRequire(import.meta.url);
const importPackage = (specifier: string) => import(/* webpackIgnore: true */ specifier);

const manifestPath = require.resolve('@module-federation/electron/package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const urlHelpers = ['federationBaseUrl', 'federationUrl', 'toAppId'];
const subpaths: Record<string, string[]> = {
  '.': ['registerFederationScheme', 'serveFederatedApps', ...urlHelpers],
  './rsbuild': ['pluginElectron', 'pluginModuleFederationElectron', ...urlHelpers],
  './vite': ['electron', 'federationElectron', ...urlHelpers],
};

describe('package exports', () => {
  for (const [subpath, names] of Object.entries(subpaths)) {
    const specifier = path.posix.join('@module-federation/electron', subpath);

    it(`${specifier} points at built ESM, CJS and types`, () => {
      const target = manifest.exports[subpath];
      for (const condition of ['import', 'require']) {
        for (const file of [target[condition].types, target[condition].default]) {
          expect(existsSync(path.join(path.dirname(manifestPath), file))).toBe(true);
        }
      }
    });

    // The root entry imports `electron`, which only loads inside an Electron process.
    // `pnpm smoke` covers it there.
    if (subpath === '.') continue;

    // Build configs load these entries, so they must not pull in `electron`.
    it(`${specifier} does not import electron`, () => {
      const target = manifest.exports[subpath];
      for (const condition of ['import', 'require']) {
        const seen = new Set<string>();
        const visit = (file: string) => {
          if (seen.has(file)) return;
          seen.add(file);
          const code = readFileSync(file, 'utf8');
          expect(code).not.toMatch(/(?:from |require\()["']electron["']/);
          for (const [, local] of code.matchAll(/(?:from |require\()["'](\.\/[^"']+)["']/g)) {
            visit(path.join(path.dirname(file), local as string));
          }
        };
        visit(path.join(path.dirname(manifestPath), target[condition].default));
        expect(seen.size).toBeGreaterThan(1);
      }
    });

    it(`${specifier} loads with require()`, () => {
      const mod = require(specifier);
      for (const name of names) expect(typeof mod[name]).toBe('function');
    });

    it(`${specifier} loads with import()`, async () => {
      const mod = await importPackage(specifier);
      for (const name of names) expect(typeof mod[name]).toBe('function');
    });
  }
});
