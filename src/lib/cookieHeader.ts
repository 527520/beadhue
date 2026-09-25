/** 解析请求 Cookie 头 → Map（重复同名取第一个；无头返回空 Map）。 */
export function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && !map.has(name)) map.set(name, value);
  }
  return map;
}
