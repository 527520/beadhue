import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('邮箱格式不正确').max(254, '邮箱过长'));
