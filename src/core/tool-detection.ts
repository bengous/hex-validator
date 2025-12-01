import { spawn } from 'node:child_process';

export type ToolInfo = {
  available: boolean;
  version?: string;
  path?: string;
};

export async function detectTool(
  command: string,
  args: string[] = ['--version'],
  cwd: string = process.cwd()
): Promise<ToolInfo> {
  return new Promise((resolve) => {
    const fullCommand = `${command} ${args.join(' ')}`;
    const proc = spawn(fullCommand, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      timeout: 5000,
    });

    let stdoutOutput = '';
    let stderrOutput = '';

    proc.stdout?.on('data', (data) => {
      stdoutOutput += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderrOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const stdoutTrimmed = stdoutOutput.trim();
        const stderrTrimmed = stderrOutput.trim();

        let versionMatch = stdoutTrimmed.match(/v?(\d+\.\d+\.\d+)/);
        if (!versionMatch && stderrTrimmed) {
          versionMatch = stderrTrimmed.match(/v?(\d+\.\d+\.\d+)/);
        }

        const result: ToolInfo = {
          available: true,
          path: command,
        };
        if (versionMatch?.[1]) {
          result.version = versionMatch[1];
        }
        resolve(result);
      } else {
        resolve({ available: false });
      }
    });

    proc.on('error', () => {
      resolve({ available: false });
    });
  });
}

export async function detectPnpmTool(
  toolName: string,
  cwd: string = process.cwd()
): Promise<ToolInfo> {
  return detectTool(`pnpm exec ${toolName}`, ['--version'], cwd);
}

const toolCache = new Map<string, ToolInfo>();

export async function getCachedToolInfo(
  command: string,
  cwd: string = process.cwd()
): Promise<ToolInfo> {
  const key = `${command}:${cwd}`;

  const cached = toolCache.get(key);
  if (cached) {
    return cached;
  }

  const info = await detectPnpmTool(command, cwd);
  toolCache.set(key, info);

  return info;
}
