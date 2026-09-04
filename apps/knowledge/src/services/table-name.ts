/**
 * 知识库向量表名：由 collectionId 收成合法 SQL 标识符。
 * 必须与 apps/server 的 collection-table-name.ts 保持一致，否则会打到空表。
 */
export function tableNameFor(collectionId: string): string {
  const sanitized = collectionId.replace(/[^A-Za-z0-9]/g, '_');
  const compact = /^[A-Za-z_]/.test(sanitized) ? sanitized : `kb_${sanitized}`;
  assertSqlIdentifier(compact);
  return compact;
}

/** 旧实现无条件再加一层 kb_；删除库时 server 会 DROP 两边，本服务只读检索规范表名。 */
export function legacyDoublePrefixedTableName(collectionId: string): string {
  const compact = `kb_${collectionId.replace(/[^A-Za-z0-9]/g, '_')}`;
  assertSqlIdentifier(compact);
  return compact;
}

function assertSqlIdentifier(value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error('无效的知识库 ID');
  }
}
