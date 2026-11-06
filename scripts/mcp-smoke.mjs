import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const data = await mkdtemp(path.join(tmpdir(), 'wc-mcp-e2e-'));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'mcp/server.ts'],
  env: { ...process.env, WC_DATA_DIR: data },
});
const client = new Client({ name: 'wc-smoke', version: '0.0.1' });
await client.connect(transport);

const text = (r) => r.content?.map((c) => c.text ?? '').join('\n') ?? '';
const check = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log('ok:', msg);
};

const tools = (await client.listTools()).tools.map((t) => t.name);
check(tools.includes('create_program') && tools.includes('list_sessions'), `tools: ${tools.join(', ')}`);

const program = {
  schema_version: 1,
  id: 'smoke-day',
  name: 'Smoke Day',
  schedule: { day: 'wednesday' },
  exercises: [
    { id: 'squat', name: 'Squat', sets: 3, reps: { min: 5, max: 5 }, weight: { value: 40, unit: 'kg' }, rest_seconds: 90 },
  ],
};

const created = await client.callTool({ name: 'create_program', arguments: { program } });
check(!created.isError && text(created).includes('smoke-day'), 'create_program writes the file');

const dupe = await client.callTool({ name: 'create_program', arguments: { program } });
check(dupe.isError && text(dupe).includes('already exists'), 'duplicate is refused');

const bad = await client.callTool({
  name: 'validate_program',
  arguments: { program: { ...program, exercises: [{ ...program.exercises[0], sets: 0 }] } },
});
check(text(bad).includes('exercises[0].sets'), 'validation reuses the importer paths');

const listed = JSON.parse(text(await client.callTool({ name: 'list_programs', arguments: {} })));
check(listed.length === 1 && listed[0].exerciseCount === 1, 'list_programs reads back the file');

const fetched = await client.callTool({ name: 'get_program', arguments: { id: 'smoke-day' } });
check(JSON.parse(text(fetched)).name === 'Smoke Day', 'get_program returns importable JSON');

const archived = await client.callTool({ name: 'archive_program', arguments: { id: 'smoke-day' } });
check(!archived.isError, 'archive_program');
const empty = JSON.parse(text(await client.callTool({ name: 'list_programs', arguments: {} })));
check(empty.length === 0, 'archived program leaves the list');
const kept = await readFile(path.join(data, 'programs', 'archive', 'smoke-day.json'), 'utf8');
check(JSON.parse(kept).id === 'smoke-day', 'archived file still exists');

const noHistory = text(await client.callTool({ name: 'list_sessions', arguments: {} }));
check(noHistory.includes('History → Export'), 'missing history export explains itself');

await client.close();
await rm(data, { recursive: true, force: true });
