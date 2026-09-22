'use client';

import type { ReactNode } from 'react';
import { useMobileLayout } from '@/components/layout/useMobileLayout';
import Modal from '@/components/ui/Modal';
import { zhCN } from '@/messages/zh-CN';

/** One settings tree: sidebar on desktop, accessible bottom sheet on narrow screens. */
export default function WorkbenchSettings({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const narrow = useMobileLayout('(max-width: 800px)');
  if (narrow && open) {
    return <Modal label={zhCN.beadhue.patternSettings} onClose={onClose} panelClassName="beadhue-settings settings-panel beadhue-settings-sheet">
      {children}
    </Modal>;
  }
  return <aside className="beadhue-settings settings-panel" aria-label={zhCN.beadhue.patternSettings} hidden={narrow}>{children}</aside>;
}
