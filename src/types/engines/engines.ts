// Shapes of the external scanners' JSON output. Only the fields this action reads are
// declared, and all of them are optional: the output is parsed from an external process
// and must be treated as untrusted.

export interface Platform {
  /** Release-asset name of the OS. */
  readonly os: 'linux' | 'darwin' | 'windows';
  readonly arch: 'x64' | 'arm64';
  readonly windows: boolean;
}

// ---------------------------------------------------------------- OSV-Scanner
export interface OsvAffected {
  readonly package?: { readonly name?: string; readonly ecosystem?: string };
  readonly ranges?: readonly {
    readonly events?: readonly {
      readonly introduced?: string;
      readonly fixed?: string;
    }[];
  }[];
}

export interface OsvVulnerability {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly summary?: string;
  readonly details?: string;
  readonly affected?: readonly OsvAffected[];
  readonly database_specific?: { readonly severity?: string };
}

export interface OsvGroup {
  readonly ids?: readonly string[];
  readonly aliases?: readonly string[];
  /** CVSS score as a string, e.g. `"7.5"`, or `""` when unknown. */
  readonly max_severity?: string;
}

export interface OsvPackageResult {
  readonly package?: {
    readonly name?: string;
    readonly version?: string;
    readonly ecosystem?: string;
  };
  readonly vulnerabilities?: readonly OsvVulnerability[];
  readonly groups?: readonly OsvGroup[];
}

export interface OsvOutput {
  readonly results?: readonly {
    readonly source?: { readonly path?: string; readonly type?: string };
    readonly packages?: readonly OsvPackageResult[];
  }[];
}

// --------------------------------------------------------------------- Semgrep
export interface SemgrepResult {
  readonly check_id?: string;
  readonly path?: string;
  readonly start?: { readonly line?: number };
  readonly extra?: {
    readonly severity?: string;
    readonly message?: string;
    readonly metadata?: { readonly cwe?: string | readonly string[] };
  };
}

export interface SemgrepOutput {
  readonly results?: readonly SemgrepResult[];
  readonly errors?: readonly { readonly level?: string; readonly message?: string }[];
}

// -------------------------------------------------------------------- Gitleaks
export interface GitleaksResult {
  readonly RuleID?: string;
  readonly Description?: string;
  readonly File?: string;
  readonly StartLine?: number;
  /** Present in the raw report. NEVER copy it into a finding. */
  readonly Secret?: string;
  /** Present in the raw report. NEVER copy it into a finding. */
  readonly Match?: string;
}
