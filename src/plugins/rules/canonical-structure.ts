import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import { validateStructure } from '../../validators/structure';

const PLUGIN_NAME = 'Canonical Module Structure';

function normalizeMessage(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+\s*/u, '').trim();
}

function addMessages(target: Message[], entries: string[], level: Message['level'], code: string) {
  for (const entry of entries) {
    target.push({
      level,
      code,
      message: normalizeMessage(entry),
    });
  }
}

function shouldSkip(ctx: PluginContext): boolean {
  if (ctx.scope === 'full') {
    return false;
  }

  const files = ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles;
  return files.every((file) => !file.startsWith('src/modules/'));
}

export const canonicalStructurePlugin: Plugin = {
  name: PLUGIN_NAME,
  async run(ctx: PluginContext): Promise<PluginResult> {
    if (shouldSkip(ctx)) {
      return { name: PLUGIN_NAME, status: 'skipped' };
    }

    const { errors, warnings, modulesChecked } = await validateStructure(ctx.cwd);
    const messages: Message[] = [];

    if (errors.length > 0) {
      addMessages(messages, errors, 'error', 'structure/missing');
    }

    if (warnings.length > 0) {
      addMessages(messages, warnings, 'warn', 'structure/optional-missing');
    }

    if (errors.length === 0 && modulesChecked > 0) {
      messages.push({
        level: 'info',
        code: 'structure/summary',
        message: `All ${modulesChecked} modules include mandatory folders.`,
      });
    }

    let status: PluginResult['status'] = 'pass';
    if (errors.length > 0) {
      status = 'fail';
    } else if (warnings.length > 0) {
      status = 'warn';
    }

    return {
      name: PLUGIN_NAME,
      status,
      ...(messages.length > 0 ? { messages } : {}),
      artifacts: { modulesChecked },
    };
  },
};
