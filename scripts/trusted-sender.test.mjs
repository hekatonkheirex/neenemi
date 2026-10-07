import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { assertTrustedSender, isLocalUrl } = require('../electron/trusted-sender.cjs');

const mainFrame = { url: 'http://127.0.0.1:3001/' };
const eventFor = (frame, sender = { mainFrame }) => ({ senderFrame: frame, sender });

describe('assertTrustedSender', () => {
  it('acepta el marco principal servido desde el servidor local', () => {
    expect(() => assertTrustedSender(eventFor(mainFrame))).not.toThrow();
    const localhost = { url: 'http://localhost:5173/x' };
    expect(() => assertTrustedSender(eventFor(localhost, { mainFrame: localhost }))).not.toThrow();
  });

  it('rechaza un iframe aunque sea local', () => {
    expect(() => assertTrustedSender(eventFor({ url: 'http://127.0.0.1:3001/frame' }))).toThrow(/no autorizado/);
  });

  it.each(['https://example.com/', 'file:///tmp/a.html', 'http://127.0.0.1.evil.com/', ''])('rechaza el origen %s', (url) => {
    const frame = { url };
    expect(() => assertTrustedSender(eventFor(frame, { mainFrame: frame }))).toThrow(/no autorizado/);
  });

  it('rechaza eventos sin marco o sin remitente', () => {
    expect(() => assertTrustedSender({})).toThrow(/no autorizado/);
    expect(() => assertTrustedSender({ senderFrame: mainFrame })).toThrow(/no autorizado/);
    expect(() => assertTrustedSender(undefined)).toThrow(/no autorizado/);
  });
});

describe('isLocalUrl', () => {
  it('solo acepta http en loopback', () => {
    expect(isLocalUrl('http://127.0.0.1:1/')).toBe(true);
    expect(isLocalUrl('https://127.0.0.1/')).toBe(false);
    expect(isLocalUrl('no es url')).toBe(false);
  });
});
