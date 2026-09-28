import { afterEach, describe, expect, it, vi } from 'vitest';
import { printOrSaveCurrentPageAsPdf } from './print';

afterEach(() => vi.unstubAllGlobals());

describe('printOrSaveCurrentPageAsPdf', () => {
  it('renders a desktop PDF with the light report theme and restores the selected theme', async () => {
    const dataset = { theme: 'dark' };
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('window', {
      dataSystemsDesktop: {
        saveCurrentPageAsPdf: async () => {
          expect(dataset.theme).toBe('light');
          return { saved: true, filePath: '/tmp/report.pdf' };
        },
      },
    });

    await expect(printOrSaveCurrentPageAsPdf('report')).resolves.toEqual({ saved: true, filePath: '/tmp/report.pdf' });
    expect(dataset.theme).toBe('dark');
  });

  it('restores the selected theme when saving fails', async () => {
    const dataset = { theme: 'dark' };
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('window', {
      dataSystemsDesktop: {
        saveCurrentPageAsPdf: async () => {
          expect(dataset.theme).toBe('light');
          throw new Error('Save failed');
        },
      },
    });

    await expect(printOrSaveCurrentPageAsPdf('report')).rejects.toThrow('Save failed');
    expect(dataset.theme).toBe('dark');
  });

  it('uses the light report theme in browser printing and restores it afterwards', async () => {
    const dataset = { theme: 'dark' };
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('window', { print: () => expect(dataset.theme).toBe('light') });

    await expect(printOrSaveCurrentPageAsPdf('report')).resolves.toBeNull();
    expect(dataset.theme).toBe('dark');
  });
});
