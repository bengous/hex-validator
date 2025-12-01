import os from 'node:os';
import type {
  PluginContext,
  PluginResult,
  RunOptions,
  StageSpec,
  ValidatorConfig,
} from '@validator/types';
import { resolvePathsToFiles } from '../utils/fs-utils';
import { getChangedFilesAgainstUpstream, getStagedFiles } from './git';

export async function runValidation(
  config: ValidatorConfig,
  options: RunOptions
): Promise<{ ok: boolean; results: PluginResult[] }> {
  const cwd = options.cwd ?? process.cwd();

  const targetFiles = options.paths ? await resolvePathsToFiles(options.paths, cwd) : undefined;

  const stagedFiles = await getStagedFiles(cwd);
  const changedFiles =
    options.scope === 'staged' ? stagedFiles : await getChangedFilesAgainstUpstream(cwd);

  const ctx: PluginContext = {
    cwd,
    ci: options.ci,
    scope: options.scope,
    changedFiles,
    stagedFiles,
    env: process.env,
    config,
  };
  if (targetFiles) {
    ctx.targetFiles = targetFiles;
  }

  const results: PluginResult[] = [];
  const maxWorkers = Math.max(
    1,
    Math.min(options.maxWorkers || Math.min(4, Math.max(2, os.cpus().length - 1)), 8)
  );

  for (const stage of config.stages) {
    const wrappedTasks = stage.tasks.map(
      (t) => () =>
        runTask(t.plugin, ctx).catch((err: unknown): PluginResult => {
          const msg = err instanceof Error ? err.message : 'Task crashed';
          const stack = err instanceof Error && err.stack ? err.stack : undefined;
          const messages: NonNullable<PluginResult['messages']> = [
            { level: 'error', message: msg },
          ];
          if (stack) {
            messages.push({ level: 'info', message: stack });
          }
          const result: PluginResult = {
            name: t.plugin.name,
            status: 'fail',
            messages,
          };
          if (stack) {
            result.stderr = stack;
          }
          return result;
        })
    );
    const stageResults = stage.parallel
      ? await runParallel(wrappedTasks, maxWorkers)
      : await runSequential(wrappedTasks);

    const orderedStageResults = stage.parallel
      ? sortResultsByTaskOrder(stageResults, stage.tasks)
      : stageResults;

    const stageResultsWithMeta = orderedStageResults.map((r) => ({ ...r, stage: stage.name }));
    results.push(...stageResultsWithMeta);

    const failed = stageResultsWithMeta.some((r) => r.status === 'fail');
    const warned = stageResultsWithMeta.some((r) => r.status === 'warn');
    if (failed || (stage.failOnWarn && warned)) {
      return { ok: false, results };
    }
  }
  return { ok: true, results };
}

function sortResultsByTaskOrder(results: PluginResult[], tasks: StageSpec['tasks']) {
  const order = new Map<string, number>();
  tasks.forEach((task, idx) => {
    if (!order.has(task.plugin.name)) {
      order.set(task.plugin.name, idx);
    }
  });
  return [...results].sort((a, b) => {
    const aIdx = order.get(a.name);
    const bIdx = order.get(b.name);
    if (typeof aIdx === 'number' && typeof bIdx === 'number') {
      return aIdx - bIdx;
    }
    if (typeof aIdx === 'number') {
      return -1;
    }
    if (typeof bIdx === 'number') {
      return 1;
    }
    return 0;
  });
}

async function runTask(
  plugin: { name: string; run: (ctx: PluginContext) => Promise<PluginResult> },
  ctx: PluginContext
): Promise<PluginResult> {
  const t0 = Date.now();
  try {
    const res = await plugin.run(ctx);
    return { ...res, durationMs: Date.now() - t0 };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Plugin crashed';
    const stack = err instanceof Error && err.stack ? err.stack : undefined;
    const messages: NonNullable<PluginResult['messages']> = [{ level: 'error', message: msg }];
    if (stack) {
      messages.push({ level: 'info', message: stack });
    }
    const result: PluginResult = {
      name: plugin.name,
      status: 'fail',
      messages,
      durationMs: Date.now() - t0,
    };
    if (stack) {
      result.stderr = stack;
    }
    return result;
  }
}

async function runParallel<T>(tasks: Array<() => Promise<T>>, maxWorkers: number): Promise<T[]> {
  const out: T[] = [];
  const queue = tasks.slice();
  let running = 0;
  return new Promise((resolve) => {
    const pump = () => {
      if (queue.length === 0 && running === 0) {
        return resolve(out);
      }
      while (running < maxWorkers && queue.length > 0) {
        const fn = queue.shift();
        if (!fn) {
          break;
        }
        running += 1;
        fn()
          .then((res) => {
            out.push(res);
            running -= 1;
            pump();
          })
          .catch((err) => {
            // Defensive: should not happen because callers wrap tasks with catch.
            // Still, ensure the queue keeps flowing without unhandled rejections.
            try {
              // Push a placeholder result to keep counts stable when T matches PluginResult.
              (out as T[]).push(err as unknown as T);
            } catch {}
            running -= 1;
            pump();
          });
      }
    };
    pump();
  });
}

async function runSequential<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  const out: T[] = [];
  for (const t of tasks) {
    out.push(await t());
  }
  return out;
}
