/** zod 4 `z.email()` 的默认正则；与 emailSchema 口径一致由 emailFormat.test.ts 保证。 */
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** 浏览器端表单预检用的邮箱格式检查（去首尾空白、转小写后匹配，≤ 254 字），不引 zod。 */
export function isValidEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && EMAIL.test(normalized);
}
