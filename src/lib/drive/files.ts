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

async function search(token: string, q: string): Promise<string | null> {
  const res = await fetch(
    `${FILES}?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=modifiedTime desc&pageSize=10`,
    { headers: auth(token) },
  );
  if (!res.ok) await failed('search Drive', res);
  const body = (await res.json()) as { files?: Array<{ id: string }> };
  return body.files?.[0]?.id ?? null;
}

/**
 * Everything is found by name, not by a cached id: the user can delete or rename
 * the folder or the file in Drive, and a stale id would then fail forever.
 */
export async function locate(token: string): Promise<{ folderId: string; fileId: string | null }> {
  const folderQuery = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  let folderId = await search(token, folderQuery);
  if (!folderId) {
    const res = await fetch(FILES, {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!res.ok) await failed('create the Drive folder', res);
    folderId = ((await res.json()) as { id: string }).id;
  }

  const fileId = await search(
    token,
    `'${folderId}' in parents and name = '${FILE_NAME}' and trashed = false`,
  );
  return { folderId, fileId };
}

/** The ETag is what the write is made conditional on, so it is required, not optional. */
async function etagOf(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${FILES}/${fileId}?fields=id`, { headers: auth(token) });
  if (!res.ok) await failed('read the Drive copy', res);
  const etag = res.headers.get('etag');
  if (!etag) throw new Error('Drive returned no ETag, so nothing was written.');
  return etag;
}

export async function download(
  token: string,
  fileId: string,
): Promise<{ text: string; etag: string }> {
  const res = await fetch(`${FILES}/${fileId}?alt=media`, { headers: auth(token) });
  if (!res.ok) await failed('read the Drive copy', res);
  return { text: await res.text(), etag: res.headers.get('etag') ?? (await etagOf(token, fileId)) };
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
  etag: string,
  body: string,
): Promise<void> {
  const res = await fetch(`${UPLOAD}/${fileId}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: { ...auth(token), 'Content-Type': 'application/json', 'If-Match': etag },
    body,
  });
  if (res.status === 412) throw new Conflict();
  if (!res.ok) await failed('write the Drive copy', res);
}
