import { findLocalBin, runCommand, runPnpmExec } from './tool-runner';

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
  const result = await runCommand(command, args, cwd);
  if (result.code !== 0) {
    return { available: false };
  }

  const stdoutTrimmed = result.stdout.trim();
  const stderrTrimmed = result.stderr.trim();
  let versionMatch = stdoutTrimmed.match(/v?(\d+\.\d+\.\d+)/);
  if (!versionMatch && stderrTrimmed) {
    versionMatch = stderrTrimmed.match(/v?(\d+\.\d+\.\d+)/);
  }

  const info: ToolInfo = {
    available: true,
    path: command,
  };
  if (versionMatch?.[1]) {
    info.version = versionMatch[1];
  }
  return info;
}

export async function detectPnpmTool(
  toolName: string,
  cwd: string = process.cwd()
): Promise<ToolInfo> {
  const result = await runPnpmExec(toolName, ['--version'], cwd);
  if (result.code !== 0) {
    return { available: false };
  }
  const output = `${result.stdout}\n${result.stderr}`;
  const versionMatch = output.match(/v?(\d+\.\d+\.\d+)/);
  const info: ToolInfo = {
    available: true,
    path: `pnpm exec ${toolName}`,
  };
  if (versionMatch?.[1]) {
    info.version = versionMatch[1];
  }
  return info;
}

const toolCache = new Map<string, ToolInfo>();

async function detectLocalBin(
  command: string,
  cwd: string,
  args: string[] = ['--version']
): Promise<ToolInfo> {
  const localBin = findLocalBin(command, cwd);
  if (!localBin) {
    return { available: false };
  }
  const info = await detectTool(localBin, args, cwd);
  return info.available ? { ...info, path: localBin } : info;
}

export async function getCachedToolInfo(
  command: string,
  cwd: string = process.cwd()
): Promise<ToolInfo> {
  const key = `${command}:${cwd}`;

  const cached = toolCache.get(key);
  if (cached) {
    return cached;
  }

  const local = await detectLocalBin(command, cwd);
  if (local.available) {
    toolCache.set(key, local);
    return local;
  }

  const pnpm = await detectPnpmTool(command, cwd);
  if (pnpm.available) {
    toolCache.set(key, pnpm);
    return pnpm;
  }

  const info = await detectTool(command, ['--version'], cwd);
  toolCache.set(key, info);

  return info;
}
