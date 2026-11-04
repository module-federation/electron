import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';

// Everything resolves through package.json `exports`, so these check the built files a consumer gets.
const require = createRequire(import.meta.url);
const importPackage = (specifier: string) => import(/* webpackIgnore: true */ specifier);

const manifestPath = require.resolve('@module-federation/electron/package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const subpaths: Record<string, string[]> = {
  '.': ['federationBaseUrl', 'federationUrl', 'toAppId'],
  './main': ['registerFederationScheme', 'serveFederatedApps'],
  './rsbuild': ['pluginElectron', 'pluginModuleFederationElectron'],
  './vite': ['electron', 'federationElectron'],
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

    // `./main` imports `electron`, which only loads inside an Electron process.
    if (subpath === './main') continue;

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
