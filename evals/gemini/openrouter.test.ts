import { describe, expect, it } from 'vitest';
import { extractJson } from './openrouter';

describe('extractJson', () => {
  it('reads plain JSON and fenced JSON with surrounding prose', () => {
    expect(extractJson('{"a":1,"b":[2]}')).toEqual({ a: 1, b: [2] });
    expect(extractJson('Claro:\n```json\n[{"section":"1"}]\n```\nListo.')).toEqual([{ section: '1' }]);
    expect(extractJson('Resultado: [1, 2, 3] fin')).toEqual([1, 2, 3]);
  });

  it('unwraps an object that only holds one array (a common model habit)', () => {
    expect(extractJson('{"requisitos":[{"excerpt":"x"}]}')).toEqual([{ excerpt: 'x' }]);
    expect(extractJson('{"features":["a"],"nota":"b"}')).toEqual({ features: ['a'], nota: 'b' });
  });

  it('fails clearly without JSON', () => {
    expect(() => extractJson('sin datos')).toThrow('no contiene JSON');
    expect(() => extractJson('{"a":')).toThrow();
  });
});
