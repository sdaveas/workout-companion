/**
 * Google Drive sync constants.
 *
 * The client ID is public by design: the installed-app token flow carries no
 * secret, and the only thing an attacker can do with it is ask a user for
 * permission to that user's own Drive.
 */
export const CLIENT_ID = '639110879545-tvo01k0gtbe72v5urdgd0n9mk9f7fkio.apps.googleusercontent.com';

export const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Everything syncs to this one visible folder, so the file can be found and deleted by hand. */
export const FOLDER_NAME = 'Workout Companion';
export const FILE_NAME = 'workout-companion-backup.json';

/** localStorage keys: the connected state, and the access token with its expiry. */
export const STATE_KEY = 'wc:drive';
export const TOKEN_KEY = 'wc:driveToken';
