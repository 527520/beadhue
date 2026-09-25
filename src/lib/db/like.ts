/** ILIKE 模式：用户输入里的 `%`、`_`、`\` 按字面匹配（PostgreSQL 默认以反斜杠为转义符），搜「100%」不会变成匹配一切。 */
const escapeLike = (q: string) => q.replace(/[\\%_]/gu, (char) => `\\${char}`);

/** 包含匹配。 */
export function containsPattern(q: string): string {
  return `%${escapeLike(q)}%`;
}

/** 开头匹配（列表只显示编号前 8 位，管理员照着搜）。 */
export function startsWithPattern(q: string): string {
  return `${escapeLike(q)}%`;
}
