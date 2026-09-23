import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComponentsShowcase } from './ComponentsShowcase';

export const metadata: Metadata = { title: "组件总览", robots: { index: false, follow: false } };

/** R15 组件总览（后续各票的视觉对照基准）；只在非生产环境可访问。 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ComponentsShowcase />;
}
