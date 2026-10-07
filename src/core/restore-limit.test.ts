import { describe, expect, it } from 'vitest';
import { MAX_RESTORE_BYTES, MAX_RESTORE_LABEL } from './restore-limit';

describe('restore limit', () => {
  it('derives the label from the byte limit', () => {
    expect(MAX_RESTORE_BYTES).toBe(2_147_483_648);
    expect(MAX_RESTORE_LABEL).toBe('2 GB');
  });
});
