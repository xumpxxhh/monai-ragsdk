import { describe, expect, it } from 'vitest';

import { parseTraceIds } from './eval-format';

describe('parseTraceIds', () => {
  it('splits comma and whitespace', () => {
    expect(parseTraceIds('a, b\nc')).toEqual(['a', 'b', 'c']);
  });

  it('returns undefined when empty', () => {
    expect(parseTraceIds('  ,  ')).toBeUndefined();
  });
});
