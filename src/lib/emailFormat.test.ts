import { describe, expect, it } from 'vitest';
import { isValidEmail } from './emailFormat';
import { emailSchema } from './emailSchema';

describe('isValidEmail', () => {
  it('与 emailSchema 判定一致', () => {
    const samples = [
      'a@b.co', ' Lu@Example.COM ', 'a+tag@mail.example.io', "o'neil@example.com", 'first.last@sub.example.cn', 'a_b-c@x-y.com',
      '', 'plain', 'a@b', 'a@b.c', '.a@b.com', 'a.@b.com', 'a..b@c.com', 'a@-b.com', 'a@b..com', 'a b@c.com', 'a@b.c0m', '中文@例子.中国',
      `${'x'.repeat(243)}@example.com`, `${'x'.repeat(244)}@example.com`,
    ];
    for (const sample of samples) expect(isValidEmail(sample), sample).toBe(emailSchema.safeParse(sample).success);
  });
});
