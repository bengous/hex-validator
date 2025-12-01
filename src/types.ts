export type Scope = 'staged' | 'changed' | 'full';
export type E2EMode = 'auto' | 'always' | 'off';

export type Status = 'pass' | 'fail' | 'warn' | 'skipped';

export type Message = {
  level: 'info' | 'warn' | 'error';
  file?: string;
  line?: number;
  col?: number;
  code?: string;
  message: string;
  suggestion?: string;
  fixable?: boolean;
};

export type PluginResult = {
  name: string;
  status: Status;
  messages?: Message[];
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  artifacts?: Record<string, unknown>;
  stage?: string;
};

export type PluginContext = {
  cwd: string;
  ci: boolean;
  scope: Scope;
  changedFiles: string[];
  stagedFiles: string[];
  targetFiles?: string[];
  env: NodeJS.ProcessEnv;
  config: ValidatorConfig;
};

export type PluginOptions = {
  [key: string]: unknown;
};

export type Plugin = {
  name: string;
  run: (ctx: PluginContext) => Promise<PluginResult>;
};

export type TaskSpec = {
  plugin: Plugin;
};

export type StageSpec = {
  name: string;
  parallel?: boolean;
  tasks: TaskSpec[];
  // Policy: how to treat warns
  failOnWarn?: boolean;
};

export type ValidatorConfig = {
  stages: StageSpec[];
  e2e?: E2EMode;
  reporters?: Array<'terminal' | 'json' | 'junit'>;
};

export type RunOptions = {
  scope: Scope;
  ci: boolean;
  maxWorkers: number;
  report: 'summary' | 'json' | 'junit';
  e2e: E2EMode;
  quiet?: boolean;
  verbose?: boolean;
  paths?: string[];
  cwd?: string;
};
