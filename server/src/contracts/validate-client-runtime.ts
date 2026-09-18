import vm from 'node:vm';
import { getLandingHtml } from '../views/landing.html.js';
import { getClientRuntimeScript } from '../views/scripts/client-runtime.js';

function collectInlineHandlerNames(source: string): Set<string> {
  const names = new Set<string>();
  const regex = /onclick\s*=\s*["']\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    names.add(match[1]);
  }
  return names;
}

const runtime = getClientRuntimeScript();

// 1. The generated browser JavaScript must be syntactically valid.
// This catches template-string escaping regressions that TypeScript cannot see.
new vm.Script(runtime, { filename: 'generated-client-runtime.js' });

// 2. Every inline onclick entry point emitted by the initial HTML or by the
// runtime's dynamic HTML templates must have a declared/runtime-bound handler.
const html = getLandingHtml({
  uptimeSeconds: 0,
  serverTime: new Date(0).toISOString(),
  version: 'validation',
  env: 'test',
  devices: [],
  customers: [],
  recentEvents: [],
  alerts: [],
});

const handlers = new Set<string>([
  ...collectInlineHandlerNames(html),
  ...collectInlineHandlerNames(runtime),
]);

const browserBuiltins = new Set(['alert', 'confirm', 'prompt']);

const missing: string[] = [];
for (const name of handlers) {
  if (browserBuiltins.has(name)) continue;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declared = new RegExp(`(?:async\\s+)?function\\s+${escaped}\\s*\\(`).test(runtime);
  const assigned = new RegExp(`window\\.${escaped}\\s*=`).test(runtime);
  if (!declared && !assigned) {
    missing.push(name);
  }
}

if (missing.length > 0) {
  throw new Error(
    `Generated CRM runtime references undefined inline handlers: ${missing.sort().join(', ')}`
  );
}

console.log(
  `Client runtime OK: syntax valid, ${handlers.size} inline handlers resolved`
);
