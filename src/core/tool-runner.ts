import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
  errorCode?: string;
  timedOut?: boolean;
};

export type RunCommandOptions = {
  timeoutMs?: number;
  maxOutputBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function appendCapped(current: string, chunk: string, maxBytes: number): string {
  if (Buffer.byteLength(current) >= maxBytes) {
    return current;
  }
  const next = current + chunk;
  if (Buffer.byteLength(next) <= maxBytes) {
    return next;
  }
  return `${next.slice(0, maxBytes)}\n[hex-validator output truncated at ${maxBytes} bytes]`;
}

export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const finish = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      stdout = appendCapped(stdout, data.toString(), maxOutputBytes);
    });
    child.stderr?.on('data', (data) => {
      stderr = appendCapped(stderr, data.toString(), maxOutputBytes);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({
        code: 1,
        stdout,
        stderr: stderr || error.message,
        ...(error.code ? { errorCode: error.code } : {}),
      });
    });
    child.on('close', (code) => {
      finish({
        code: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr: timedOut ? `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim() : stderr,
        timedOut,
      });
    });
  });
}

export function runPnpm(
  args: string[],
  cwd: string,
  options?: RunCommandOptions
): Promise<CommandResult> {
  return runCommand('pnpm', args, cwd, options);
}

export function findLocalBin(command: string, cwd: string): string | null {
  let current = cwd;
  while (true) {
    const candidate = path.join(current, 'node_modules', '.bin', command);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function runPnpmExec(
  toolName: string,
  args: string[],
  cwd: string,
  options?: RunCommandOptions
): Promise<CommandResult> {
  const localBin = findLocalBin(toolName, cwd);
  if (localBin) {
    return runCommand(localBin, args, cwd, options);
  }

  return runPnpm(['exec', toolName, ...args], cwd, options);
}

export function runPnpmScript(
  scriptName: string,
  args: string[],
  cwd: string,
  options?: RunCommandOptions
): Promise<CommandResult> {
  return runPnpm(['run', scriptName, ...args], cwd, options);
}
