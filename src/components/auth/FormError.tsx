import { FormAlert } from '@/components/ui/field';

/** 表单级错误（role=alert，供无障碍与测试定位）：挂在提交按钮上方。 */
export default function FormError({ message }: { message: string | null }) {
  return <FormAlert>{message}</FormAlert>;
}
