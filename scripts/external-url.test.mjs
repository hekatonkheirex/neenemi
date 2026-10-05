import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { openExternalSafely } = require('../electron/external-url.cjs');

describe('openExternalSafely', () => {
  it.each(['https://datasystems.com.py', 'http://example.com/a?b=1', 'mailto:ventas@example.com'])(
    'abre %s',
    (url) => {
      const shell = { openExternal: vi.fn() };
      expect(openExternalSafely(shell, url)).toBe(true);
      expect(shell.openExternal).toHaveBeenCalledWith(url);
    },
  );

  it.each(['file:///etc/passwd', 'smb://host/share', 'ms-msdt:/id', 'javascript:alert(1)', 'no es url', ''])(
    'bloquea %s',
    (url) => {
      const shell = { openExternal: vi.fn() };
      expect(openExternalSafely(shell, url)).toBe(false);
      expect(shell.openExternal).not.toHaveBeenCalled();
    },
  );
});
