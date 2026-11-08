import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  archiveProgram,
  getProgram,
  listPrograms,
  readHistory,
  saveProgram,
  validateProgram,
  writeIndex,
} from './store';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = process.env.WC_DATA_DIR ?? path.resolve(here, '..', 'data');

const server = new McpServer({ name: 'workout-companion', version: '0.1.0' });

const asText = (value: unknown) => ({
  content: [
    { type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
});

const failure = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

const asJson = (program: unknown): string =>
  typeof program === 'string' ? program : JSON.stringify(program);

server.registerTool(
  'list_programs',
  {
    title: 'List programs',
    description: 'Programs stored in data/programs. Returns id, name, scheduled days, exercise count.',
    inputSchema: {},
  },
  async () => asText(await listPrograms(dataRoot)),
);

server.registerTool(
  'get_program',
  {
    title: 'Get program',
    description: 'The exact JSON of one program, ready to import.',
    inputSchema: { id: z.string().describe('Program id, e.g. "workout-a"') },
  },
  async ({ id }) => {
    const text = await getProgram(dataRoot, id);
    return text ? asText(text) : failure(`No program "${id}" in data/programs.`);
  },
);

server.registerTool(
  'validate_program',
  {
    title: 'Validate program',
    description:
      'Runs the app importer against a program and returns its real errors (path + message), or "valid".',
    inputSchema: { program: z.unknown().describe('Program object, or its JSON text') },
  },
  async ({ program }) => {
    const issues = await validateProgram(asJson(program));
    return issues.length > 0
      ? asText(issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)))
      : asText('valid');
  },
);

server.registerTool(
  'create_program',
  {
    title: 'Create program',
    description:
      'Validates and writes data/programs/<id>.json. Refuses an existing id unless replace is true.',
    inputSchema: {
      program: z.unknown().describe('Program object, or its JSON text'),
      replace: z.boolean().optional().describe('Overwrite an existing program with the same id'),
    },
  },
  async ({ program, replace }) => {
    const result = await saveProgram(dataRoot, asJson(program), { replace });
    if (!result.ok) return failure(result.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('\n'));
    return asText(`Saved data/programs/${result.id}.json`);
  },
);

server.registerTool(
  'update_program',
  {
    title: 'Update program',
    description: 'Replaces an existing program. The id inside the JSON must match the id argument.',
    inputSchema: {
      id: z.string(),
      program: z.unknown().describe('Program object, or its JSON text'),
    },
  },
  async ({ id, program }) => {
    const result = await saveProgram(dataRoot, asJson(program), { replace: true, expectedId: id });
    if (!result.ok) return failure(result.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('\n'));
    return asText(`Updated data/programs/${result.id}.json`);
  },
);

server.registerTool(
  'archive_program',
  {
    title: 'Archive program',
    description: 'Moves a program to data/programs/archive. Nothing is deleted.',
    inputSchema: { id: z.string() },
  },
  async ({ id }) => {
    const moved = await archiveProgram(dataRoot, id);
    return moved ? asText(`Archived "${id}".`) : failure(`No program "${id}" to archive.`);
  },
);

server.registerTool(
  'list_sessions',
  {
    title: 'List sessions',
    description:
      'Finished sessions from data/history/workout-history.json (History → Export in the app). Newest first.',
    inputSchema: {
      programId: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
  },
  async ({ programId, limit }) => {
    const history = await readHistory(dataRoot);
    if (!history) {
      return asText(
        'No history export found. In the app: History → Export, then save the file as data/history/workout-history.json.',
      );
    }
    const rows = history.sessions
      .filter((s) => !programId || s.programId === programId)
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
      .slice(0, limit ?? 50)
      .map((s) => ({
        id: s.id,
        programId: s.programId,
        programName: s.programName,
        finishedAt: s.finishedAt,
        durationMs: s.summary.durationMs,
        setsCompleted: s.summary.setsCompleted,
        setsSkipped: s.summary.setsSkipped,
        volumeKg: s.summary.volumeKg,
        rpe: s.summary.rpe,
        endedEarly: s.summary.endedEarly,
      }));
    return asText({ exportedAt: history.exportedAt, count: rows.length, sessions: rows });
  },
);

server.registerTool(
  'get_session',
  {
    title: 'Get session',
    description: 'One full session summary by id, including per-exercise sets.',
    inputSchema: { sessionId: z.string() },
  },
  async ({ sessionId }) => {
    const history = await readHistory(dataRoot);
    const row = history?.sessions.find((s) => s.id === sessionId);
    return row ? asText(row) : failure(`No session "${sessionId}" in the history export.`);
  },
);

server.registerTool(
  'refresh_index',
  {
    title: 'Refresh index',
    description: 'Rebuilds data/programs/index.json from the program files (used by the dev sync button).',
    inputSchema: {},
  },
  async () => {
    await writeIndex(dataRoot);
    return asText('Index rebuilt.');
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
