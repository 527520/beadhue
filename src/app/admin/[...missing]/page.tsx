import { notFound } from 'next/navigation';

/** 后台里没有的地址交给 `admin/not-found.tsx`，在后台外壳内提示；根 404 只管前台。 */
export default function AdminMissingPage() {
  notFound();
}
