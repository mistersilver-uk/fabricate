/**
 * Package a built module directory into a release zip.
 *
 * Ported from fabricate-premium (tools/src/package-zip.js). The inline
 * `tar -a` zip in scripts/release.js produces archives that Windows
 * Explorer's Shell.Application — used by "Extract All" and Foundry's
 * install-from-zip flow — sees as zero-item archives. This helper uses
 * PowerShell `Compress-Archive` on Windows and `zip` on Unix so local
 * dry-runs produce installable zips; CI (Ubuntu) takes the `zip` path.
 */
import { existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Zip the contents of `srcDir` into `outZipPath`. Excludes any nested
 * `*.zip`, LevelDB `LOCK`, and `*.map` sourcemap files (the production
 * sourcemap is emitted for CI/debug but kept out of every published zip).
 *
 * @param {string} srcDir - Absolute path to the directory to zip
 * @param {string} outZipPath - Absolute path of the zip to create
 */
export function zipDirectory(srcDir, outZipPath) {
  if (process.platform === 'win32') {
    const pwsh = existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
      ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
      : 'powershell.exe';
    // Compress-Archive can't filter on input, so stage to a temp dir first,
    // drop LOCK/`*.zip`/`*.map`, then archive the staged copy.
    const script = [
      `$ErrorActionPreference = 'Stop'`,
      `$src = '${srcDir.replace(/'/g, "''")}'`,
      `$zipPath = '${outZipPath.replace(/'/g, "''")}'`,
      `$staging = Join-Path $env:TEMP ('zipmod-' + [guid]::NewGuid())`,
      `New-Item -ItemType Directory -Path $staging | Out-Null`,
      `try {`,
      `  Copy-Item -Path (Join-Path $src '*') -Destination $staging -Recurse`,
      `  Get-ChildItem -Path $staging -Recurse -File |`,
      `    Where-Object { $_.Name -eq 'LOCK' -or $_.Name -like '*.zip' -or $_.Name -like '*.map' } |`,
      `    Remove-Item -Force`,
      `  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }`,
      `  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath`,
      `} finally {`,
      `  Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue`,
      `}`
    ].join('\n');
    execFileSync(pwsh, ['-NoProfile', '-Command', script], { stdio: 'inherit' });
  } else {
    // `zip` can exclude *.zip/LOCK by glob, but to also drop sourcemaps we stage
    // a copy without *.map first (mirroring the win32 staging above) and zip that,
    // then clean the staging up. Reassigning srcDir keeps the zip call unchanged.
    const staging = mkdtempSync(join(tmpdir(), 'zipmod-'));
    cpSync(srcDir, staging, { recursive: true, filter: src => !src.endsWith('.map') });
    srcDir = staging;
    execFileSync('zip', ['-r', outZipPath, '.', '--exclude', '*.zip', '--exclude', '*/LOCK'], {
      cwd: srcDir,
      stdio: 'inherit'
    });
    rmSync(staging, { recursive: true, force: true });
  }
}
