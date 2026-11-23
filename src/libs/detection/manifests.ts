// Manifest / lock file name -> OSV ecosystem. OSV-Scanner reads all of these.
const MANIFESTS: ReadonlyMap<string, string> = new Map([
  ['package.json', 'npm'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['yarn.lock', 'npm'],
  ['pnpm-lock.yaml', 'npm'],
  ['bun.lock', 'npm'],
  ['requirements.txt', 'PyPI'],
  ['Pipfile.lock', 'PyPI'],
  ['poetry.lock', 'PyPI'],
  ['uv.lock', 'PyPI'],
  ['pdm.lock', 'PyPI'],
  ['pyproject.toml', 'PyPI'],
  ['setup.py', 'PyPI'],
  ['go.mod', 'Go'],
  ['go.sum', 'Go'],
  ['Cargo.toml', 'crates.io'],
  ['Cargo.lock', 'crates.io'],
  ['pom.xml', 'Maven'],
  ['build.gradle', 'Maven'],
  ['build.gradle.kts', 'Maven'],
  ['gradle.lockfile', 'Maven'],
  ['composer.json', 'Packagist'],
  ['composer.lock', 'Packagist'],
  ['Gemfile', 'RubyGems'],
  ['Gemfile.lock', 'RubyGems'],
  ['packages.lock.json', 'NuGet'],
  ['deps.json', 'NuGet'],
  ['pubspec.lock', 'Pub'],
  ['mix.lock', 'Hex'],
  ['Package.resolved', 'SwiftURL'],
  ['renv.lock', 'CRAN'],
  ['conan.lock', 'ConanCenter'],
]);

/** Ecosystem of a manifest by its base name, or `null` if it is not a manifest. */
export function ecosystemOf(baseName: string): string | null {
  return MANIFESTS.get(baseName) ?? (baseName.endsWith('.csproj') ? 'NuGet' : null);
}
