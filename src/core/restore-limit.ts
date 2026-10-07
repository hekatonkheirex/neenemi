/** Largest SQLite backup the restore endpoint accepts. Client-safe: the panel shows the same limit the server enforces. */
export const MAX_RESTORE_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_RESTORE_LABEL = `${MAX_RESTORE_BYTES / 1024 ** 3} GB`;
