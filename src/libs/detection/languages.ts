import path from 'node:path';

import type { LanguageId, LanguageInfo } from '@types';

export const LANGUAGES: Readonly<Record<LanguageId, LanguageInfo>> = {
  javascript: {
    name: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    semgrepRuleset: 'p/javascript',
  },
  typescript: {
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    semgrepRuleset: 'p/typescript',
  },
  python: { name: 'Python', extensions: ['.py', '.pyw'], semgrepRuleset: 'p/python' },
  go: { name: 'Go', extensions: ['.go'], semgrepRuleset: 'p/golang' },
  java: { name: 'Java', extensions: ['.java'], semgrepRuleset: 'p/java' },
  kotlin: { name: 'Kotlin', extensions: ['.kt', '.kts'], semgrepRuleset: 'p/kotlin' },
  scala: { name: 'Scala', extensions: ['.scala', '.sc'], semgrepRuleset: 'p/scala' },
  csharp: { name: 'C#', extensions: ['.cs'], semgrepRuleset: 'p/csharp' },
  c: {
    name: 'C/C++',
    extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh'],
    semgrepRuleset: 'p/c',
  },
  rust: { name: 'Rust', extensions: ['.rs'], semgrepRuleset: 'p/rust' },
  php: { name: 'PHP', extensions: ['.php', '.phtml'], semgrepRuleset: 'p/php' },
  ruby: {
    name: 'Ruby',
    extensions: ['.rb', '.rake', '.gemspec'],
    semgrepRuleset: 'p/ruby',
  },
  swift: { name: 'Swift', extensions: ['.swift'], semgrepRuleset: 'p/swift' },
  dart: { name: 'Dart', extensions: ['.dart'] },
  elixir: { name: 'Elixir', extensions: ['.ex', '.exs'] },
  lua: { name: 'Lua', extensions: ['.lua'] },
  r: { name: 'R', extensions: ['.r', '.R'] },
  solidity: { name: 'Solidity', extensions: ['.sol'] },
  shell: { name: 'Shell', extensions: ['.sh', '.bash', '.zsh'] },
  powershell: { name: 'PowerShell', extensions: ['.ps1', '.psm1', '.psd1'] },
  batch: { name: 'Batch', extensions: ['.bat', '.cmd'] },
  vb: { name: 'Visual Basic', extensions: ['.vb', '.vbs'] },
  terraform: { name: 'Terraform', extensions: ['.tf'], semgrepRuleset: 'p/terraform' },
};

const BY_EXTENSION: ReadonlyMap<string, LanguageId> = new Map(
  (Object.entries(LANGUAGES) as [LanguageId, LanguageInfo][]).flatMap(([id, info]) =>
    info.extensions.map((ext) => [ext, id] as const),
  ),
);

/** Language of a file from its extension (exact case first, then lower-case). */
export function languageOf(file: string): LanguageId | null {
  const ext = path.extname(file);
  return BY_EXTENSION.get(ext) ?? BY_EXTENSION.get(ext.toLowerCase()) ?? null;
}

/** Semgrep rulesets for the detected languages, always starting with `p/default`. */
export function semgrepRulesets(
  languages: readonly { readonly id: LanguageId }[],
): string[] {
  const rulesets = ['p/default'];
  for (const { id } of languages) {
    const ruleset = LANGUAGES[id].semgrepRuleset;
    if (ruleset && !rulesets.includes(ruleset)) rulesets.push(ruleset);
  }
  return rulesets;
}
