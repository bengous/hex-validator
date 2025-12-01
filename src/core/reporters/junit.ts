import type { PluginResult } from '@validator/types';

export function junitReporter(results: PluginResult[]) {
  const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };
  const esc = (s: string) => s.replace(/[<&>]/g, (c) => map[c] ?? c);
  let failures = 0;
  let tests = 0;
  const testcases: string[] = [];
  for (const r of results) {
    tests += 1;
    if (r.status === 'fail') {
      failures += 1;
    }
    const name = esc(r.name);
    if (r.status === 'fail') {
      const msg = esc(
        (r.messages ?? []).map((m) => `${m.level}: ${m.file ?? ''} ${m.message}`).join('\n')
      );
      testcases.push(
        `<testcase name="${name}"><failure message="${name}"><![CDATA[${msg}]]></failure></testcase>`
      );
    } else if (r.status === 'warn') {
      const msg = esc(
        (r.messages ?? []).map((m) => `${m.level}: ${m.file ?? ''} ${m.message}`).join('\n')
      );
      testcases.push(
        `<testcase name="${name}"><skipped message="warning"><![CDATA[${msg}]]></skipped></testcase>`
      );
    } else {
      testcases.push(`<testcase name="${name}"/>`);
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="hex-validator" tests="${tests}" failures="${failures}">\n${testcases.join('\n')}\n</testsuite>`;
  process.stdout.write(`${xml}\n`);
}
