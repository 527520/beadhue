'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { keysPattern, type BeadMode } from '@/lib/render/beads';
import { BEAD_SAMPLE_COLORS } from '@/lib/render/beadTokens';
import { zhCN } from '@/messages/zh-CN';
import { BeadImage } from '@/components/ui/bead-image';
import { buttonVariants } from '@/components/ui/button';

/** 三步配图的豆色键（BEAD_SAMPLE_COLORS）：照片取景 → 色板 → 拼好的成品。 */
const ART: ReadonlyArray<{ rows: string; mode: BeadMode }> = [
  { mode: 'flat', rows: 'KKKKKKKKKKKK|KCCCCCCCCYYK|KCCCCCCCCYYK|KCCCCCCCCCCK|KCCCGCCCCCCK|KCCGGGCCCCCK|KCGGGGGCCGCK|KGGGGGGGGGGK|KGGGGGGGGGGK|KTTTTTTTTTTK|KTTTTTTTTTTK|KKKKKKKKKKKK' },
  { mode: 'bead', rows: '..........|.RR.OO.YY.|.RR.OO.YY.|..........|.GG.CC.BB.|.GG.CC.BB.|..........|.VV.PP.KK.|.VV.PP.KK.|..........' },
  { mode: 'bead', rows: '...........|..RRR.RRR..|.RRPRRRRRR.|.RPRRRRRRR.|.RRRRRRRRR.|..RRRRRRR..|...RRRRR...|....RRR....|.....R.....|...........' },
];

/**
 * 帮助页「三步上手」（原首页新手引导 OnboardingGuide 并入此处）：每步一张豆粒渲染示例图 + 标题 + 说明，
 * 末尾唯一主按钮「开始制作」。
 */
export function HelpSteps() {
  const t = zhCN.onboarding;
  const labels = zhCN.pages.help.stepArt;
  const patterns = useMemo(() => ART.map((item) => keysPattern(item.rows.split('|'), BEAD_SAMPLE_COLORS)), []);
  const steps = [
    { title: t.step1Title, body: t.step1Body },
    { title: t.step2Title, body: t.step2Body },
    { title: t.step3Title, body: t.step3Body },
  ];
  return (
    <div className="grid gap-6">
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="grid min-w-0 content-start gap-3 rounded-lg border border-line p-4 max-sm:grid-cols-[88px_minmax(0,1fr)] max-sm:gap-x-4">
            <div className="grid aspect-square place-items-center self-start rounded-md bg-bg-subtle p-4 max-sm:p-2">
              <BeadImage pattern={patterns[index]} mode={ART[index].mode} alt={labels[index]} lazy={false} className="size-full" />
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <p className="text-caption text-ink-3 tabular-nums">{`0${index + 1}`}</p>
              <h3 className="text-title-3 text-balance text-ink">{step.title}</h3>
              <p className="mt-1 text-body-sm text-pretty text-ink-3">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Link href="/app" className={buttonVariants({ variant: 'primary' })}>{zhCN.pages.help.start}</Link>
      </div>
    </div>
  );
}
