import { describe, expect, it } from 'vitest';

import { parseEvalDatasetJson } from './eval-dataset';

describe('parseEvalDatasetJson', () => {
  it('accepts a minimal golden dataset', () => {
    const result = parseEvalDatasetJson(
      JSON.stringify({
        name: 'demo',
        version: '1.0.0',
        samples: [{ id: 'q1', query: '退货？', relevantSourceIds: ['doc-a'] }],
      }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.sampleCount).toBe(1);
      expect(result.name).toBe('demo');
    }
  });

  it('rejects empty samples and duplicate ids', () => {
    expect(parseEvalDatasetJson('{"name":"d","version":"1","samples":[]}')).toEqual({
      error: 'samples 不能为空',
    });
    expect(
      parseEvalDatasetJson(
        JSON.stringify({
          name: 'd',
          version: '1',
          samples: [
            { id: 'q1', query: 'a', relevantSourceIds: ['x'] },
            { id: 'q1', query: 'b', relevantSourceIds: ['y'] },
          ],
        }),
      ),
    ).toEqual({ error: '重复 sample id: q1' });
  });

  it('rejects invalid json', () => {
    expect(parseEvalDatasetJson('{')).toEqual({ error: '不是合法 JSON' });
  });
});
