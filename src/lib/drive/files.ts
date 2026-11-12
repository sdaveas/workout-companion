import { FOLDER_NAME } from './config';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function failed(what: string, res: Response): Promise<never> {
  throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

/** Everything is found by name: the user may have moved or renamed things by hand. */
async function findId(token: string, q: string): Promise<string | null> {
  const res = await fetch(
    `${FILES}?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=modifiedTime desc&pageSize=10`,
    { headers: auth(token) },
  );
  if (!res.ok) await failed('search Drive', res);
  const body = (await res.json()) as { files?: Array<{ id: string }> };
  return body.files?.[0]?.id ?? null;
}

async function findFolder(token: string): Promise<string | null> {
  return findId(
    token,
    `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
}

/** Overwrites the named file in Drive, or creates it. This is a copy, so a blind overwrite is the point. */
export async function saveBackup(token: string, name: string, body: string): Promise<void> {
  let folderId = await findFolder(token);
  if (!folderId) {
    const res = await fetch(FILES, {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!res.ok) await failed('create the Drive folder', res);
    folderId = ((await res.json()) as { id: string }).id;
  }

  const fileId = await findId(
    token,
    `'${folderId}' in parents and name = '${name}' and trashed = false`,
  );

  if (fileId) {
    const res = await fetch(`${UPLOAD}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) await failed('save to Drive', res);
    return;
  }

  const boundary = `wc${Math.random().toString(36).slice(2)}`;
  const payload = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' }),
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
  if (!res.ok) await failed('save to Drive', res);
}

/** The text of the named copy in Drive, or null when there is no copy yet. */
export async function loadBackup(token: string, name: string): Promise<string | null> {
  const folderId = await findFolder(token);
  if (!folderId) return null;

  const fileId = await findId(
    token,
    `'${folderId}' in parents and name = '${name}' and trashed = false`,
  );
  if (!fileId) return null;

  const res = await fetch(`${FILES}/${fileId}?alt=media`, { headers: auth(token) });
  if (!res.ok) await failed('read from Drive', res);
  return res.text();
}
