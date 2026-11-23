/** Languages the action can recognise by file extension. */
export type LanguageId =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'scala'
  | 'csharp'
  | 'c'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'swift'
  | 'dart'
  | 'elixir'
  | 'lua'
  | 'r'
  | 'solidity'
  | 'shell'
  | 'powershell'
  | 'batch'
  | 'vb'
  | 'terraform';

export interface LanguageInfo {
  /** Display name, e.g. `C#`. */
  readonly name: string;
  /** File extensions including the dot. Matching is case-sensitive first, then lower-case. */
  readonly extensions: readonly string[];
  /** Semgrep registry ruleset for this language, when one exists. */
  readonly semgrepRuleset?: string;
}

export interface DetectedLanguage {
  readonly id: LanguageId;
  readonly name: string;
  /** Number of files with this language. */
  readonly files: number;
}

export interface DetectedEcosystem {
  /** OSV ecosystem name, e.g. `npm` or `PyPI`. */
  readonly name: string;
  /** Manifest and lock files that belong to this ecosystem. */
  readonly manifests: readonly string[];
}

export interface DetectResult {
  /** Sorted by file count, most files first. */
  readonly languages: readonly DetectedLanguage[];
  readonly ecosystems: readonly DetectedEcosystem[];
}
