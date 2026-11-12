import { FILE_NAME, FOLDER_NAME } from './config';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/** The file moved between our read and our write. Sync answers with a full second pass. */
export class Conflict extends Error {
  constructor() {
    super('The Drive copy changed while syncing.');
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function failed(what: string, res: Response): Promise<never> {
  throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

type Found = { id: string; headRevisionId?: string };

async function search(token: string, q: string, fields = 'files(id)'): Promise<Found | null> {
  const res = await fetch(
    `${FILES}?q=${encodeURIComponent(q)}&fields=${fields}&orderBy=modifiedTime desc&pageSize=10`,
    { headers: auth(token) },
  );
  if (!res.ok) await failed('search Drive', res);
  const body = (await res.json()) as { files?: Found[] };
  return body.files?.[0] ?? null;
}

/**
 * Everything is found by name, not by a cached id: the user can delete or rename
 * the folder or the file in Drive, and a stale id would then fail forever.
 */
export async function locate(
  token: string,
): Promise<{ folderId: string; fileId: string | null; revisionId: string | null }> {
  const folderQuery = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  let folderId = (await search(token, folderQuery))?.id ?? null;
  if (!folderId) {
    const res = await fetch(FILES, {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!res.ok) await failed('create the Drive folder', res);
    folderId = ((await res.json()) as { id: string }).id;
  }

  const file = await search(
    token,
    `'${folderId}' in parents and name = '${FILE_NAME}' and trashed = false`,
    'files(id,headRevisionId)',
  );
  return { folderId, fileId: file?.id ?? null, revisionId: file?.headRevisionId ?? null };
}

/**
 * A browser cannot read Drive's ETag header (CORS does not expose it), so the
 * concurrency token is the revision id from the JSON body instead.
 */
async function revisionOf(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${FILES}/${fileId}?fields=headRevisionId`, { headers: auth(token) });
  if (!res.ok) await failed('read the Drive copy', res);
  return ((await res.json()) as { headRevisionId?: string }).headRevisionId ?? '';
}

export async function download(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${FILES}/${fileId}?alt=media`, { headers: auth(token) });
  if (!res.ok) await failed('read the Drive copy', res);
  return res.text();
}

export async function createFile(
  token: string,
  folderId: string,
  body: string,
): Promise<void> {
  const boundary = `wc${Math.random().toString(36).slice(2)}`;
  const payload = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: FILE_NAME, parents: [folderId], mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: payload,
  });
  if (!res.ok) await failed('create the Drive copy', res);
}

export async function updateFile(
  token: string,
  fileId: string,
  expectedRevision: string,
  body: string,
): Promise<void> {
  // Check-then-write, one request wide. A lost race is not fatal: the merge is a
  // union, so the next sync from either side puts the missing rows back.
  if ((await revisionOf(token, fileId)) !== expectedRevision) throw new Conflict();

  const res = await fetch(`${UPLOAD}/${fileId}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) await failed('write the Drive copy', res);
}
