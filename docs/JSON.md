# JSON Reporter Contract

`hex-validate --report=json` emits a versioned JSON envelope. Version 1 is additive-only:
existing fields keep their meaning, and new fields may be added.

```ts
type JsonReportV1 = {
  schemaVersion: 1;
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
    durationMs: number;
  };
  runOptions: {
    scope: 'staged' | 'changed' | 'full';
    e2e: 'auto' | 'always' | 'off';
    report: 'json';
    maxWorkers: number;
    ci: boolean;
    quiet: boolean;
    verbose: boolean;
    paths?: string[];
    cwd?: string;
  };
  results: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn' | 'skipped';
    stage?: string;
    durationMs?: number;
    messages?: Array<{
      level: 'info' | 'warn' | 'error';
      file?: string;
      line?: number;
      col?: number;
      code?: string;
      message: string;
      suggestion?: string;
      fixable?: boolean;
    }>;
    artifacts?: Record<string, unknown>;
    rawOutput?: {
      stdout?: string;
      stderr?: string;
    };
  }>;
};
```

`rawOutput` is included only when `--verbose` is set. Non-verbose JSON never exposes raw
`stdout` or `stderr`; curated data belongs in `messages` or `artifacts`.
