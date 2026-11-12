/**
 * Google Drive, manual copy only.
 *
 * The client ID is public by design: the token flow carries no secret, and the
 * only thing anyone can do with it is ask a user for permission to that user's
 * own Drive.
 */
export const CLIENT_ID = '639110879545-tvo01k0gtbe72v5urdgd0n9mk9f7fkio.apps.googleusercontent.com';

export const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** One visible folder, so the copy can be found, downloaded or deleted by hand. */
export const FOLDER_NAME = 'Workout Companion';
