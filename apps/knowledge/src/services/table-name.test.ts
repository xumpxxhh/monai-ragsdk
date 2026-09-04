import { describe, expect, it } from 'vitest';

import { legacyDoublePrefixedTableName, tableNameFor } from '../services/table-name.js';

describe('tableNameFor', () => {
  it('does not double-prefix kb-<uuid> ids', () => {
    expect(tableNameFor('kb-1e80b748-a66e-4aea-a438-4098a551aa10')).toBe(
      'kb_1e80b748_a66e_4aea_a438_4098a551aa10',
    );
  });

  it('prefixes a leading-digit uuid so the identifier is valid', () => {
    expect(tableNameFor('1e80b748-a66e-4aea-a438-4098a551aa10')).toBe(
      'kb_1e80b748_a66e_4aea_a438_4098a551aa10',
    );
  });
});

describe('legacyDoublePrefixedTableName', () => {
  it('reproduces the old kb_kb_ table name', () => {
    expect(legacyDoublePrefixedTableName('kb-1e80b748-a66e-4aea-a438-4098a551aa10')).toBe(
      'kb_kb_1e80b748_a66e_4aea_a438_4098a551aa10',
    );
  });
});
