/**
 * 知识库向量表名：由 collectionId 收成合法 SQL 标识符。
 * ID 已是 `kb-<uuid>`，只替换非法字符，不再叠加 kb_，否则会出现 kb_kb_...。
 * 清洗后若仍以数字开头（历史裸 UUID），才补 kb_。
 */
export function tableNameFor(collectionId: string): string {
  const sanitized = collectionId.replace(/[^A-Za-z0-9]/g, '_');
  const compact = /^[A-Za-z_]/.test(sanitized) ? sanitized : `kb_${sanitized}`;
  assertSqlIdentifier(compact);
  return compact;
}

/**
 * 旧实现无条件再加一层 kb_。已有库可能仍占用该表名，ensure 时迁到规范名，删除时两边都 DROP。
 */
export function legacyDoublePrefixedTableName(collectionId: string): string {
  const compact = `kb_${collectionId.replace(/[^A-Za-z0-9]/g, '_')}`;
  assertSqlIdentifier(compact);
  return compact;
}

export function quoteSqlIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function assertSqlIdentifier(value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error('无效的知识库 ID');
  }
}
