'use client';

import {
  ArrowLeft, ArrowUpDown, CircleDot, CloudOff, Copy, Download, Ellipsis, Eraser, FileDown, FolderOpen,
  Grid3x3, History, LayoutGrid, List, Paintbrush, Pencil, Plus, Redo2, Scan, Search, Share2, SlidersHorizontal, Star, Trash2, Undo2,
  Upload, X, ZoomIn,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { colorUsage } from '@/lib/render/beads';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { Chip, RemovableChip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogTrigger, DialogFooter, DialogHeader, DialogSample, DialogTitle, Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FieldLabel } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input, Textarea } from '@/components/ui/input';
import { LikeButton } from '@/components/ui/like-button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSample, MenuSampleItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Pagination } from '@/components/ui/pagination';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { SegmentedControl, Tab, Tabs, TabsList } from '@/components/ui/tabs';
import { ToastSample, useToast } from '@/components/ui/toast';
import { BeadDots, MetaItem, MetaSep, WorkCard } from '@/components/ui/work-card';
import { AUTHORS, BEADS, beadName, motifPattern, type Key } from './motifs';
import { KitSection, Label, Note, Panel, Row, SECTIONS, Spec } from './kit';

const COLOR_TOKENS = [
  ['--bg', 'bg-bg'], ['--bg-subtle', 'bg-bg-subtle'], ['--bg-muted', 'bg-bg-muted'], ['--bg-emphasis', 'bg-bg-emphasis'], ['--line', 'bg-line'],
  ['--line-strong', 'bg-line-strong'], ['--ink', 'bg-ink'], ['--ink-2', 'bg-ink-2'], ['--ink-3', 'bg-ink-3'], ['--ink-4', 'bg-ink-4'], ['--accent', 'bg-accent'],
  ['--accent-soft', 'bg-accent-soft'], ['--success', 'bg-success'], ['--warning', 'bg-warning'], ['--danger', 'bg-danger'], ['--featured', 'bg-featured'], ['--heart', 'bg-heart'],
] as const;
const TYPE_SCALE = [
  ['display', 'text-display', '创作一张拼豆图纸'], ['title-1', 'text-title-1', '橘猫团子'], ['title-2', 'text-title-2', '相似作品'], ['title-3', 'text-title-3', '色号清单'],
  ['body', 'text-body', '上传一张喜欢的图片，几秒生成图纸。'], ['body-sm', 'text-body-sm', '32×32 · 7 色 · 812 颗'], ['caption', 'text-caption', '2 小时前'],
] as const;
const PALETTES = [
  { value: 'mard', label: 'MARD 豆色绘经典 291 色' },
  { value: 'coco', label: 'COCO 221 色' },
  { value: 'perler', label: 'Perler 标准 90 色' },
];
const SORTS = [
  ['rec', '推荐'], ['new', '最新发布'], ['likes', '最多喜欢'],
] as const;

function toHex(color: string): string {
  const parts = color.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  return `#${parts.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function ComponentsShowcase() {
  return <Showcase />;
}

function Showcase() {
  const [current, setCurrent] = useState<string>(SECTIONS[0][0]);
  const lock = useRef(false);
  const chipBar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      if (lock.current) return;
      const offset = (window.matchMedia('(max-width: 767px)').matches ? 120 : 24) + 40;
      let next: string = SECTIONS[0][0];
      for (const node of document.querySelectorAll<HTMLElement>('[data-kit-sec]')) if (node.getBoundingClientRect().top - offset <= 0) next = node.dataset.kitSec ?? next;
      setCurrent(next);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const bar = chipBar.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-kit-jump="${current}"]`);
    if (bar && chip && bar.offsetParent) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' });
  }, [current]);

  const jump = (id: string) => {
    lock.current = true;
    window.setTimeout(() => {
      lock.current = false;
    }, 700);
    setCurrent(id);
    document.getElementById(`kit-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div data-ui="" className="min-h-dvh bg-bg pb-12">
      <header className="sticky top-0 z-40 flex h-topbar items-center gap-1 bg-bg/96 pr-2 pl-4 backdrop-blur-md md:hidden">
        <IconButton label="返回发现" tooltip={false} render={<Link href="/" />} nativeButton={false}>
          <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
        <span className="min-w-0 flex-1 text-center text-topbar text-ink">组件总览</span>
        <span aria-hidden="true" className="w-10 shrink-0" />
      </header>
      <div className="sticky top-topbar z-35 border-b border-line bg-bg md:hidden">
        <nav ref={chipBar} aria-label="组件目录" className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map(([id, text]) => (
            <Chip key={id} data-kit-jump={id} selected={current === id} onClick={() => jump(id)}>
              {text}
            </Chip>
          ))}
        </nav>
      </div>
      <div className="px-gutter">
        <div className="mx-auto w-full max-w-wide">
          <header className="pt-8 pb-6 max-md:pt-5 max-md:pb-4">
            <h1 className="text-title-1 text-ink">组件总览</h1>
            <p className="mt-1 max-w-prose text-body-sm text-ink-3">用户端与后台共用的一套组件；规格取自设计规格 §3，颜色、字号、圆角、阴影全部来自令牌。</p>
          </header>
          <div className="grid grid-cols-[184px_minmax(0,1fr)] items-start gap-10 max-lg:grid-cols-[152px_minmax(0,1fr)] max-lg:gap-6 max-md:block">
            <nav aria-label="组件目录" className="sticky top-6 max-h-[calc(100dvh-48px)] overflow-y-auto [scrollbar-width:thin] max-md:hidden">
              <ul className="grid">
                {SECTIONS.map(([id, text]) => (
                  <li key={id}>
                    <button
                      type="button"
                      data-slot="kit-toc-item"
                      aria-current={current === id ? 'true' : undefined}
                      onClick={() => jump(id)}
                      className="flex h-8 w-full items-center rounded-md px-3 text-left text-body-sm leading-none font-medium text-ink-3 transition-colors duration-state hover:bg-bg-subtle hover:text-ink focus-visible:focus-ring aria-[current=true]:bg-bg-muted aria-[current=true]:font-semibold aria-[current=true]:text-ink"
                    >
                      {text}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="grid min-w-0 gap-12 max-md:gap-9">
              <TokensSection />
              <ButtonsSection />
              <IconButtonsSection />
              <InputsSection />
              <SearchSection />
              <ChipsSection />
              <TabsSection />
              <SegSection />
              <MenusSection />
              <PopoverSection />
              <DialogsSection />
              <ConfirmSection />
              <SheetSection />
              <ToastsSection />
              <BadgesSection />
              <AvatarsSection />
              <EmptySection />
              <SkeletonSection />
              <PaginationSection />
              <ProgressSection />
              <ControlsSection />
              <TooltipSection />
              <CardsSection />
              <BeadsSection />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TokensSection() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[data-token]').forEach((node) => {
      const slot = node.parentElement?.querySelector('code');
      if (slot) slot.textContent = toHex(getComputedStyle(node).backgroundColor);
    });
  }, []);
  return (
    <KitSection id="tokens" title="令牌" rule="组件只引用令牌；十六进制色值只出现在豆色数据里。字号只有 7 级，控件高度只有 32 / 40 / 48。">
      <Panel>
        <Label>颜色</Label>
        <div ref={ref} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {COLOR_TOKENS.map(([name, className]) => (
            <div key={name} className="grid grid-cols-[36px_minmax(0,1fr)] grid-rows-2 items-center gap-x-2.5">
              <span data-token={name} className={cn('row-span-2 size-9 rounded-sm inset-ring-1 inset-ring-line', className)} />
              <b className="truncate font-mono text-caption font-semibold text-ink">{name}</b>
              <code className="font-mono text-caption font-normal text-ink-3" />
            </div>
          ))}
        </div>
        <Label>字号（只有 7 级）</Label>
        <div className="grid">
          {TYPE_SCALE.map(([name, className, sample], index) => (
            <div key={name} className={cn('grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-4 py-2.5 max-md:grid-cols-[64px_minmax(0,1fr)] max-md:gap-3', index > 0 && 'border-t border-line')}>
              <code className="font-mono text-caption font-normal text-ink-3">{name}</code>
              <span className={cn('truncate text-ink max-md:whitespace-normal', className, (name === 'body' || name === 'body-sm' || name === 'caption') && 'text-ink-2')}>{sample}</span>
            </div>
          ))}
        </div>
      </Panel>
    </KitSection>
  );
}

function ButtonsSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const variants = [['primary', '生成图纸'], ['secondary', '下载 PNG'], ['outline', '筛选'], ['ghost', '取消'], ['danger', '删除']] as const;
  const sizes = [['sm', 'sm · 32'], ['md', 'md · 40'], ['lg', 'lg · 48']] as const;
  return (
    <KitSection id="button" title="按钮" rule={<><b>每个视区只有一个主按钮</b>（主色实心）；danger 只用于确认弹窗的最终动作；禁用用 --bg-muted 底 + --ink-4 字，不用半透明；loading 时图标位换成旋转环，宽度不变。下方矩阵是规格样张，不代表真实页面。</>}>
      <Panel tone="specimen">
        <div role="table" aria-label="按钮变体与尺寸" className="grid grid-cols-[88px_repeat(3,max-content)] items-center gap-x-7 gap-y-4 overflow-x-auto max-md:grid-cols-[repeat(3,max-content)] max-md:gap-x-3 max-md:gap-y-2">
          <span className="max-md:hidden" />
          {sizes.map(([, text]) => <Label key={text}>{text}</Label>)}
          {variants.map(([variant, text]) => (
            <div key={variant} className="contents">
              <Label className="max-md:col-span-full max-md:mt-2">{variant}</Label>
              {sizes.map(([size]) => (
                <span key={size}>
                  <Button variant={variant} size={size}>{text}</Button>
                </span>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <Row>
          <Spec caption="带图标"><Button variant="primary"><Upload aria-hidden="true" strokeWidth={1.75} />上传图片</Button></Spec>
          <Spec caption="次按钮 + 图标"><Button variant="secondary"><Download aria-hidden="true" strokeWidth={1.75} />下载 PNG</Button></Spec>
          <Spec caption="描边 + 图标"><Button variant="outline"><SlidersHorizontal aria-hidden="true" strokeWidth={1.75} />筛选</Button></Spec>
          <Spec caption="幽灵 + 图标"><Button variant="ghost"><X aria-hidden="true" strokeWidth={1.75} />清除搜索</Button></Spec>
          <Spec caption="加载中（宽度不变）"><Button variant="primary" loading>生成图纸</Button><Button variant="secondary" loading>保存</Button></Spec>
          <Spec caption="禁用"><Button variant="primary" disabled>生成图纸</Button><Button variant="outline" disabled>筛选</Button></Spec>
          <Spec caption="点一下看 loading">
            <Button
              variant="secondary"
              loading={loading}
              onClick={() => {
                setLoading(true);
                window.setTimeout(() => {
                  setLoading(false);
                  toast('已导出 PDF', { icon: <FileDown aria-hidden="true" strokeWidth={1.75} /> });
                }, 1400);
              }}
            >
              导出 PDF
            </Button>
          </Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function IconButtonsSection() {
  const cat = useMemo(() => motifPattern('cat', 32), []);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [liked, setLiked] = useState(true);
  return (
    <KitSection id="icon-button" title="图标按钮" rule="圆形 32 / 40 / 48；必须有 aria-label，桌面加 tooltip；选中态深墨底白图标。">
      <Panel>
        <Row>
          <Spec caption="普通">
            <IconButton label="分享"><Share2 aria-hidden="true" strokeWidth={1.75} /></IconButton>
            <IconButton label="更多"><Ellipsis aria-hidden="true" strokeWidth={1.75} /></IconButton>
          </Spec>
          <Spec caption="实心">
            <IconButton variant="filled" label="撤销"><Undo2 aria-hidden="true" strokeWidth={1.75} /></IconButton>
            <IconButton variant="filled" label="重做"><Redo2 aria-hidden="true" strokeWidth={1.75} /></IconButton>
          </Spec>
          <Spec caption="选中（深墨）">
            <IconButton label="画笔" aria-pressed={tool === 'brush'} onClick={() => setTool('brush')}><Paintbrush aria-hidden="true" strokeWidth={1.75} /></IconButton>
            <IconButton label="橡皮" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser aria-hidden="true" strokeWidth={1.75} /></IconButton>
          </Spec>
          <Spec caption="图片上">
            <div className="relative aspect-square w-30 overflow-hidden rounded-lg bg-bg-subtle">
              <BeadImage pattern={cat} lazy={false} className="size-full" />
              <LikeButton title="橘猫团子" pressed={liked} onPressedChange={setLiked} className="absolute top-2 right-2" />
            </div>
          </Spec>
          <Spec caption="尺寸 32 / 40 / 48">
            <IconButton size="sm" variant="filled" label="小"><Plus aria-hidden="true" strokeWidth={1.75} /></IconButton>
            <IconButton variant="filled" label="中"><Plus aria-hidden="true" strokeWidth={1.75} /></IconButton>
            <IconButton size="lg" variant="filled" label="大"><Plus aria-hidden="true" strokeWidth={1.75} /></IconButton>
          </Spec>
          <Spec caption="禁用">
            <IconButton variant="filled" disabled label="重做（没有可重做的操作）" tooltip={false}><Redo2 aria-hidden="true" strokeWidth={1.75} /></IconButton>
          </Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function InputsSection() {
  const [palette, setPalette] = useState('mard');
  return (
    <KitSection id="input" title="输入" rule="高 40（触屏 44）、圆角 12、白底 + --line-strong；错误态红边 + 字段下方写清原因和改法，不用表单顶部横幅；规则写在说明里，不写进占位符。">
      <Panel>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-md:grid-cols-1">
          <Field label="作品名称" hint="最多 20 个字"><Input placeholder="例如：橘猫团子" /></Field>
          <Field label="作品名称 · 聚焦" hint="聚焦：主色边 + 3px 主色光晕"><Input defaultValue="橘猫团子" className="border-accent shadow-field-focus" /></Field>
          <Field label="邮箱" error="邮箱缺少域名后缀，例如 lu@example.com"><Input defaultValue="lu@example" /></Field>
          <Field label="制作规格 · 禁用" hint="由所选色板决定" disabled><Input defaultValue="5mm · 29×29" /></Field>
          <Field label="作品介绍"><Textarea placeholder="说说这张图纸的故事" /></Field>
          <div className="grid gap-1.5">
            <FieldLabel>色板</FieldLabel>
            <Select label="色板" options={PALETTES} value={palette} onValueChange={setPalette} />
            <span className="text-caption font-normal text-ink-3">选择按钮打开菜单，不用原生下拉框</span>
          </div>
        </div>
      </Panel>
    </KitSection>
  );
}

function SearchSection() {
  const anchor = useRef<HTMLDivElement>(null);
  const works = useMemo(() => [['橘猫团子', motifPattern('cat', 32), '32×32'], ['灰猫午睡', motifPattern('cat', 36, { O: 'S', o: 's', T: 'S', P: 'p' }), '36×36']] as const, []);
  return (
    <KitSection id="search" title="搜索" rule="胶囊，高 48（桌面顶栏 44）；默认 --bg-muted 底，聚焦变白底 + 浮起阴影；左放大镜、右清除；桌面聚焦展开建议面板，手机进入全屏搜索页。">
      <Panel>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-md:grid-cols-1">
          <Spec caption="默认 · 高 48" block><SearchField /></Spec>
          <Spec caption="有值 · 右侧清除" block><SearchField defaultValue="猫" aria-label="搜索" /></Spec>
          <Spec caption="聚焦 · 白底浮起（顶栏 44）" block>
            <div ref={anchor}>
              <SearchField compact defaultValue="猫咪" aria-label="搜索" wrapperClassName="bg-bg text-ink shadow-float inset-ring-1 inset-ring-line hover:bg-bg" />
            </div>
          </Spec>
          <Spec caption="建议面板">
            <Popover>
              <PopoverTrigger render={<Button variant="secondary" />}>打开建议面板</PopoverTrigger>
              <PopoverContent wide align="start" anchor={anchor} aria-label="搜索建议">
                <div className="grid">
                  <a href="#kit-search" className="flex min-h-9 items-center gap-2.5 rounded-menu-item px-2.5 text-body-sm text-ink hover:bg-bg-muted [&>svg]:size-4.5 [&>svg]:text-ink-3">
                    <Search aria-hidden="true" strokeWidth={1.75} />
                    <span>搜索「<b className="font-semibold text-ink">猫咪</b>」</span>
                    <span className="ml-auto text-caption font-normal text-ink-3">回车</span>
                  </a>
                  <div className="mx-1 my-1.5 h-px bg-line" />
                  <p className="px-2.5 pt-2 pb-1 text-caption text-ink-3">图纸</p>
                  {works.map(([title, pattern, size]) => (
                    <a key={title} href="#kit-search" className="flex min-h-9 items-center gap-2.5 rounded-menu-item px-2.5 text-body-sm text-ink hover:bg-bg-muted">
                      <BeadImage pattern={pattern} lazy={false} className="size-8 rounded-sm bg-bg-subtle" />
                      <span className="min-w-0 flex-1 truncate">{title}</span>
                      <span className="text-caption font-normal text-ink-3 tabular-nums">{size}</span>
                    </a>
                  ))}
                  <div className="mx-1 my-1.5 h-px bg-line" />
                  <p className="px-2.5 pt-2 pb-1 text-caption text-ink-3">作者</p>
                  <a href="#kit-search" className="flex min-h-9 items-center gap-2.5 rounded-menu-item px-2.5 text-body-sm text-ink hover:bg-bg-muted">
                    <Avatar id={AUTHORS.cheng.id} name={AUTHORS.cheng.name} color={AUTHORS.cheng.color} size="sm" />
                    <span>{AUTHORS.cheng.name}</span>
                  </a>
                </div>
              </PopoverContent>
            </Popover>
          </Spec>
        </div>
      </Panel>
    </KitSection>
  );
}

function ChipsSection() {
  const toast = useToast();
  const [on, setOn] = useState<Record<string, boolean>>({ 可爱: true, 水果: true });
  const [removed, setRemoved] = useState<string[]>([]);
  const toggle = (key: string) => setOn((prev) => ({ ...prev, [key]: !prev[key] }));
  const remove = (label: string) => {
    setRemoved((prev) => [...prev, label]);
    toast(`已移除「${label}」`, { action: { label: '撤销', onClick: () => setRemoved((prev) => prev.filter((item) => item !== label)) } });
  };
  return (
    <KitSection id="chip" title="芯片" rule="胶囊高 32；默认 --bg-muted，选中深墨底白字；可带计数；可移除芯片带 ×。">
      <Panel>
        <Row>
          <Spec caption="默认">{['动物', '猫咪'].map((label) => <Chip key={label} selected={!!on[label]} onClick={() => toggle(label)}>{label}</Chip>)}</Spec>
          <Spec caption="选中（深墨）"><Chip selected={!!on['可爱']} onClick={() => toggle('可爱')}>可爱</Chip></Spec>
          <Spec caption="可移除">
            {!removed.includes('30–40 格') ? <RemovableChip selected onRemove={() => remove('30–40 格')} removeLabel="移除筛选：30–40 格">30–40 格</RemovableChip> : null}
            {!removed.includes('夏天') ? <RemovableChip onRemove={() => remove('夏天')} removeLabel="移除标签：夏天">夏天</RemovableChip> : null}
          </Spec>
          <Spec caption="带计数">
            <Chip count={12} selected={!!on['星星人']} onClick={() => toggle('星星人')}>星星人</Chip>
            <Chip count={8} selected={!!on['水果']} onClick={() => toggle('水果')}>水果</Chip>
          </Spec>
          <Spec caption="描边">
            <Chip variant="outline" icon={<History aria-hidden="true" strokeWidth={1.75} />}>樱花杯垫</Chip>
            <Chip variant="outline" icon={<Plus aria-hidden="true" strokeWidth={1.75} />}>添加标签</Chip>
          </Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function TabsSection() {
  return (
    <KitSection id="tabs" title="页签" rule="页面级页签用「文字 + 2px 深墨下划线」；导航与页签不用分段控件。">
      <Panel>
        <Label>页面级页签</Label>
        <Tabs defaultValue="designs">
          <TabsList>
            <Tab value="designs">设计</Tab>
            <Tab value="public" count={12}>公开作品</Tab>
            <Tab value="likes">喜欢</Tab>
            <Tab value="palettes">色板</Tab>
          </TabsList>
        </Tabs>
        <Label>小号（面板内）</Label>
        <Tabs defaultValue="adjust">
          <TabsList size="sm">
            <Tab size="sm" value="colors">颜色</Tab>
            <Tab size="sm" value="adjust">调整</Tab>
            <Tab size="sm" value="info">信息</Tab>
          </TabsList>
        </Tabs>
      </Panel>
    </KitSection>
  );
}

function SegSection() {
  const [mode, setMode] = useState<'edit' | 'stitch'>('edit');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  return (
    <KitSection id="seg" title="分段" rule={<><b>只用于同一视图的模式切换</b>（编辑 / 跟拼、网格 / 列表）；不用于导航和排序。</>}>
      <Panel>
        <Row>
          <Spec caption="编辑器模式">
            <SegmentedControl label="模式" value={mode} onValueChange={setMode} items={[{ value: 'edit', label: '编辑' }, { value: 'stitch', label: '跟拼' }]} />
          </Spec>
          <Spec caption="视图（纯图标）">
            <SegmentedControl
              label="视图"
              value={view}
              onValueChange={setView}
              items={[
                { value: 'grid', label: '网格视图', iconOnly: true, icon: <LayoutGrid aria-hidden="true" strokeWidth={1.75} /> },
                { value: 'list', label: '列表视图', iconOnly: true, icon: <List aria-hidden="true" strokeWidth={1.75} /> },
              ]}
            />
          </Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function MenusSection() {
  const [sort, setSort] = useState<string>('rec');
  const icon = (Node: typeof FolderOpen) => <Node aria-hidden="true" strokeWidth={1.75} />;
  return (
    <KitSection id="menu" title="菜单" rule="圆角 16、浮起阴影、项高 36；左图标、右勾选；危险项红字置底并用分隔线隔开；宽度按内容 200–360。">
      <Panel>
        <Row>
          <Spec caption="操作菜单（含危险项）">
            <Menu>
              <MenuTrigger render={<IconButton variant="filled" label="更多操作" tooltip="更多"><Ellipsis aria-hidden="true" strokeWidth={1.75} /></IconButton>} />
              <MenuContent>
                <MenuItem icon={icon(FolderOpen)}>打开</MenuItem>
                <MenuItem icon={icon(Pencil)}>重命名</MenuItem>
                <MenuItem icon={icon(Copy)}>复制为新设计</MenuItem>
                <MenuItem icon={icon(Download)}>导出…</MenuItem>
                <MenuSeparator />
                <MenuItem danger icon={icon(Trash2)}>删除…</MenuItem>
              </MenuContent>
            </Menu>
          </Spec>
          <Spec caption="单选菜单（勾选）">
            <Menu>
              <MenuTrigger render={<Button variant="outline" />}>
                <ArrowUpDown aria-hidden="true" strokeWidth={1.75} />
                {SORTS.find(([value]) => value === sort)?.[1]}
              </MenuTrigger>
              <MenuContent aria-label="排序">
                <MenuRadioGroup value={sort} onValueChange={(value) => setSort(String(value))}>
                  <MenuLabel>排序</MenuLabel>
                  {SORTS.map(([value, text]) => <MenuRadioItem key={value} value={value}>{text}</MenuRadioItem>)}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
          </Spec>
          <Spec caption="静态样张" tall>
            <MenuSample role="group" aria-label="菜单样张">
              <MenuSampleItem icon={icon(FolderOpen)}>打开</MenuSampleItem>
              <MenuSampleItem icon={icon(Pencil)} trail="F2">重命名</MenuSampleItem>
              <MenuSampleItem icon={icon(LayoutGrid)} checked>网格视图</MenuSampleItem>
              <div className="mx-1 my-1.5 h-px bg-line" />
              <MenuSampleItem icon={icon(Trash2)} danger>删除…</MenuSampleItem>
            </MenuSample>
          </Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function PopoverSection() {
  const [picked, setPicked] = useState<Record<string, number>>({ 尺寸: 1, 颜色数: 1 });
  const groups = [['尺寸', ['小于 30 格', '30–40 格', '40 格以上']], ['颜色数', ['6 色以内', '7–10 色', '10 色以上']]] as const;
  return (
    <KitSection id="popover" title="弹出层" rule="锚定触发器；传入 sheetTitle 时手机自动变底部面板，桌面和手机是同一个组件。">
      <Panel>
        <Row>
          <Spec caption="筛选弹出层（手机为底部面板）">
            <Popover sheetTitle="筛选">
              <PopoverTrigger render={<Button variant="outline" />}>
                <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} />
                筛选
              </PopoverTrigger>
              <PopoverContent wide align="start" aria-label="筛选">
                <div className="grid gap-5 px-2 pt-2">
                  {groups.map(([title, items]) => (
                    <section key={title}>
                      <h3 className="mb-2.5 text-body-sm font-semibold text-ink">{title}</h3>
                      <Row tight>
                        {items.map((text, index) => (
                          <Chip key={text} variant="outline" selected={picked[title] === index} onClick={() => setPicked((prev) => ({ ...prev, [title]: prev[title] === index ? -1 : index }))}>
                            {text}
                          </Chip>
                        ))}
                      </Row>
                    </section>
                  ))}
                  <footer className="-mx-5 flex justify-between gap-2 border-t border-line px-5 pt-3 pb-2 max-md:mx-0 max-md:px-0">
                    <PopoverClose render={<Button variant="ghost" />}>清除全部</PopoverClose>
                    <PopoverClose render={<Button variant="primary" />}>显示 12 张图纸</PopoverClose>
                  </footer>
                </div>
              </PopoverContent>
            </Popover>
          </Spec>
          <Spec caption="宽度按内容：最小 200、最大 360；宽版 560"><Note>不跟随触发器拉满</Note></Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function DemoDialog({ size, title, trigger }: { size: 'sm' | 'md' | 'lg'; title: string; trigger: string }) {
  const width = { sm: 480, md: 640, lg: 880 }[size];
  return (
    <Dialog>
      <DialogTriggerButton>{trigger}</DialogTriggerButton>
      <DialogContent size={size}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-4">
          <p className="text-body-sm text-ink-2">最大宽 {width}px；手机上这是一个带拖动条的底部面板。</p>
          <Field label="名称"><Input defaultValue="橘猫团子 · 大号" /></Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>取消</DialogClose>
          <DialogClose render={<Button variant="primary" />}>保存</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogTriggerButton({ children, variant = 'secondary', icon }: { children: string; variant?: 'secondary' | 'danger-ghost'; icon?: ReactNode }) {
  return (
    <DialogTriggerSlot>
      <Button variant={variant}>{icon}{children}</Button>
    </DialogTriggerSlot>
  );
}

function DialogTriggerSlot({ children }: { children: ReactElement }) {
  return <DialogTrigger render={children} />;
}

function DialogsSection() {
  return (
    <KitSection id="dialog" title="弹窗" rule={<>圆角 24，最大宽 480 / 640 / 880；标题 title-2 + 右上关闭；底部按钮右对齐（次在左、主在右）；<b>手机上自动变底部面板</b>。</>}>
      <Panel>
        <Row>
          <Spec caption="480 · 默认"><DemoDialog size="sm" title="重命名设计" trigger="打开弹窗" /></Spec>
          <Spec caption="640 · md"><DemoDialog size="md" title="分享图纸" trigger="打开 640" /></Spec>
          <Spec caption="880 · lg"><DemoDialog size="lg" title="新建图纸" trigger="打开 880" /></Spec>
        </Row>
        <SampleStage>
          <DialogSample title="重命名设计" footer={<><Button variant="secondary">取消</Button><Button variant="primary">保存</Button></>}>
            <Field label="名称"><Input defaultValue="橘猫团子 · 大号" /></Field>
          </DialogSample>
        </SampleStage>
      </Panel>
    </KitSection>
  );
}

function SampleStage({ children }: { children: ReactNode }) {
  return <div className="grid place-items-center rounded-lg bg-ink/42 p-6 max-md:place-items-end max-md:justify-stretch max-md:px-0 max-md:pt-4 max-md:pb-0 max-md:[&>*]:w-full">{children}</div>;
}

function ConfirmSection() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <KitSection id="confirm" title="危险确认" rule="标题直接写后果和对象；正文说明哪些无法恢复；最终按钮用 danger 并写明动作，不写「确定」。">
      <Panel>
        <Row>
          <Spec caption="危险操作入口 → 确认弹窗">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTriggerButton variant="danger-ghost" icon={<Trash2 aria-hidden="true" strokeWidth={1.75} />}>删除设计…</DialogTriggerButton>
              <DialogContent>
                <DialogHeader><DialogTitle>删除「橘猫团子 · 大号」？</DialogTitle></DialogHeader>
                <DialogBody><p className="text-body-sm text-ink-2">删除后无法恢复；已公开的作品会同时从发现页移除。</p></DialogBody>
                <DialogFooter>
                  <DialogClose render={<Button variant="secondary" />}>取消</DialogClose>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setOpen(false);
                      toast('已删除「橘猫团子 · 大号」', { icon: <Trash2 aria-hidden="true" strokeWidth={1.75} />, action: { label: '撤销', onClick: () => toast('已恢复「橘猫团子 · 大号」') } });
                    }}
                  >
                    删除设计
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Spec>
        </Row>
        <SampleStage>
          <DialogSample title="删除「橘猫团子 · 大号」？" footer={<><Button variant="secondary">取消</Button><Button variant="danger">删除设计</Button></>}>
            <p className="text-body-sm text-ink-2">删除后无法恢复；已公开的作品会同时从发现页移除。</p>
          </DialogSample>
        </SampleStage>
      </Panel>
    </KitSection>
  );
}

function SheetSection() {
  const cat = useMemo(() => motifPattern('cat', 32), []);
  return (
    <KitSection id="sheet" title="抽屉" rule="后台列表点击行从右侧滑出详情（480px），不常驻空的右栏；Esc 或点遮罩关闭；手机为底部面板。">
      <Panel>
        <Row>
          <Spec caption="桌面右侧 480px；手机底部面板">
            <Sheet>
              <DialogTriggerButton>打开抽屉</DialogTriggerButton>
              <SheetContent>
                <SheetHeader divided><SheetTitle className="truncate">橘猫团子</SheetTitle></SheetHeader>
                <SheetBody className="flex flex-1 flex-col gap-6 pt-5 pb-6">
                  <div tabIndex={-1} className="grid h-60 place-items-center rounded-lg bg-bg-subtle max-md:h-50">
                    <BeadImage pattern={cat} lazy={false} className="size-52 rounded-md ring-1 ring-line max-md:size-42" />
                  </div>
                  <p className="text-body-sm text-ink-2">详情抽屉复用弹窗的遮罩、Esc 与焦点圈定，只是换成右侧版式。</p>
                </SheetBody>
                <SheetFooter><DialogClose render={<Button variant="secondary" />}>关闭</DialogClose></SheetFooter>
              </SheetContent>
            </Sheet>
          </Spec>
          <Spec caption="后台实例"><span className="text-body-sm font-medium text-accent">作品管理 → 点击任意一行（票 10）</span></Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function ToastsSection() {
  const toast = useToast();
  return (
    <KitSection id="toast" title="提示" rule="底部居中深墨胶囊：图标 + 一句话 + 可选动作，约 4 秒消失；动作与按钮用同一个动词（导出 → 已导出）。">
      <Panel>
        <Row>
          <Spec caption="成功"><Button onClick={() => toast('已导出 PNG')}>导出</Button></Spec>
          <Spec caption="带撤销动作">
            <Button onClick={() => toast('已删除「彩虹挂件」', { icon: <Trash2 aria-hidden="true" strokeWidth={1.75} />, action: { label: '撤销', onClick: () => toast('已恢复「彩虹挂件」') } })}>删除设计</Button>
          </Spec>
        </Row>
        <div className="flex flex-wrap gap-3 rounded-lg bg-bg-subtle p-4 max-md:[&>*]:whitespace-normal">
          <ToastSample message="已导出 PNG" />
          <ToastSample icon={<Trash2 aria-hidden="true" strokeWidth={1.75} />} message="已删除「彩虹挂件」" action="撤销" />
        </div>
      </Panel>
    </KitSection>
  );
}

function BadgesSection() {
  const melon = useMemo(() => motifPattern('watermelon', 32), []);
  return (
    <KitSection id="badge" title="徽标" rule="软底 + 同色字：中性 / 信息 / 成功 / 警告 / 危险；精选为黄底深墨字；图片上用白底。">
      <Panel>
        <Row>
          <Spec caption="中性"><Badge>草稿</Badge></Spec>
          <Spec caption="信息"><Badge tone="info">跟拼中</Badge></Spec>
          <Spec caption="成功"><Badge tone="success" dot>正常</Badge></Spec>
          <Spec caption="警告"><Badge tone="warning" dot>待审</Badge></Spec>
          <Spec caption="危险"><Badge tone="danger" dot>已下架</Badge></Spec>
          <Spec caption="精选"><Badge tone="featured"><Star aria-hidden="true" className="fill-current" />精选</Badge></Spec>
          <Spec caption="官方"><Badge tone="official">官方</Badge></Spec>
          <Spec caption="图片上">
            <div className="relative aspect-square w-24 overflow-hidden rounded-lg bg-bg-subtle">
              <BeadImage pattern={melon} lazy={false} className="size-full" />
              <Badge tone="on-image" className="absolute top-2 left-2">已公开</Badge>
            </div>
          </Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function AvatarsSection() {
  const people = [AUTHORS.lu, AUTHORS.cheng, AUTHORS.xing, AUTHORS.abu, AUTHORS.tang];
  const sizes = [['xs', 'xs · 20'], ['sm', 'sm · 24'], ['md', '默认 · 32'], ['lg', 'lg · 48'], ['xl', 'xl · 72']] as const;
  return (
    <KitSection id="avatar" title="头像" rule="圆形；没有头像时取首字，底色从豆粒色里按 ID 取。">
      <Panel>
        <Row>
          {sizes.map(([size, text], index) => (
            <Spec key={size} caption={text}><Avatar id={people[index].id} name={people[index].name} color={people[index].color} size={size} /></Spec>
          ))}
        </Row>
      </Panel>
    </KitSection>
  );
}

function EmptySection() {
  return (
    <KitSection id="empty" title="空状态" rule="豆粒插画 + 标题 + 一句说明 + 最多一个主按钮；页面上已有同一主按钮时，空状态只放次按钮。">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Panel tone="tight" className="content-center">
          <EmptyState kind="designs" title="还没有设计" description="上传一张图片，几秒生成可以照着拼的图纸。" actions={<><Button variant="primary">上传图片</Button><Button>从空白开始</Button></>} />
        </Panel>
        <Panel tone="tight" className="content-center">
          <EmptyState kind="search" title="没有找到“独角兽”相关的图纸" description="换个关键词，或去掉一些筛选条件再试试。" actions={<Button>清除搜索和筛选</Button>} />
        </Panel>
        <Panel tone="tight" className="content-center">
          <EmptyState kind="likes" title="还没有喜欢的作品" description="在发现页点作品右上角的心，就会收在这里。" actions={<Button render={<Link href="/" />} nativeButton={false}>去发现看看</Button>} />
        </Panel>
        <Panel tone="tight" className="content-center">
          <EmptyState kind="comments" title="还没有讨论" description="拼好了？分享一下你的成品和心得。" />
        </Panel>
      </div>
      <Panel>
        <Label>紧凑版（卡片、表格内）</Label>
        <EmptyState compact title="暂时没有记录" description="新的操作会出现在这里。" />
      </Panel>
    </KitSection>
  );
}

function SkeletonSection() {
  return (
    <KitSection id="skeleton" title="骨架" rule="与真实卡片同尺寸的灰块，是唯一允许循环的动效。">
      <Panel>
        <div className="grid grid-cols-4 gap-5 max-xl:grid-cols-2 max-md:gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} aria-hidden="true" className="flex flex-col gap-2.5 max-sm:gap-2">
              <Skeleton className="aspect-square rounded-lg" />
              <div className="grid gap-0.5 px-0.5">
                <Skeleton className="h-4 w-[70%]" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </KitSection>
  );
}

function PaginationSection() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  return (
    <KitSection id="pagination" title="分页" rule="后台表格底部通栏单行：总数 · 每页条数 · 页码 · 跳页；窄屏只保留「上一页 / 第 n/m 页 / 下一页」。">
      <Panel>
        <Label className="max-md:hidden">桌面 · 单行通栏</Label>
        <div className="overflow-hidden rounded-md border border-line max-md:hidden">
          <Pagination variant="full" page={page} pageCount={7} total={128} pageSize={size} onPageChange={setPage} onPageSizeChange={setSize} />
        </div>
        <Label>窄屏 · 只保留上一页 / 第 n/m 页 / 下一页</Label>
        <div className="max-w-105 rounded-md border border-line max-md:max-w-none">
          <Pagination variant="compact" page={page} pageCount={7} total={128} pageSize={size} onPageChange={setPage} />
        </div>
      </Panel>
    </KitSection>
  );
}

function ProgressSection() {
  return (
    <KitSection id="progress" title="进度条" rule="6px 深墨条，用于跟拼进度、原图空间、批次进度；旁边写出百分比。">
      <Panel>
        <div className="grid grid-cols-4 gap-6 max-lg:grid-cols-2 max-md:grid-cols-1">
          {([[0, '未开始'], [32, '跟拼 32%'], [78, '原图空间 78%'], [100, '批次完成']] as const).map(([value, text]) => <Progress key={text} value={value} label={text} />)}
        </div>
      </Panel>
    </KitSection>
  );
}

function ControlsSection() {
  const [colors, setColors] = useState(12);
  const line = 'flex cursor-pointer items-center justify-between gap-4 text-body-sm text-ink';
  return (
    <KitSection id="controls" title="开关与复选" rule="开关立即生效；复选用于多选和确认；滑杆用于连续参数，旁边实时显示数值。选中统一深墨。">
      <Panel>
        <div className="grid grid-cols-3 gap-x-8 gap-y-6 max-lg:grid-cols-1">
          <div className="grid content-start gap-3">
            <Label>开关</Label>
            <label className={line}><span>显示网格</span><Switch defaultChecked /></label>
            <label className={line}><span>显示色号</span><Switch /></label>
            <label className={cn(line, 'cursor-not-allowed text-ink-4')}><span>板缝（需先开网格）</span><Switch disabled /></label>
          </div>
          <div className="grid content-start gap-3">
            <Label>复选</Label>
            <Checkbox defaultChecked>作者已声明原创</Checkbox>
            <Checkbox>不含联系方式</Checkbox>
            <Checkbox disabled>已锁定的核对项</Checkbox>
          </div>
          <div className="grid content-start gap-3">
            <Label>滑杆</Label>
            <div className={line}><span id="kit-colors">颜色数</span><output className="font-semibold text-ink tabular-nums">{colors}</output></div>
            <Slider aria-label="颜色数" min={2} max={40} value={colors} onValueChange={(value) => setColors(Array.isArray(value) ? value[0] : value)} />
            <Note>旁边实时显示数值</Note>
          </div>
        </div>
      </Panel>
    </KitSection>
  );
}

function TooltipSection() {
  return (
    <KitSection id="tooltip" title="气泡提示" rule="悬停 300ms 后出现，深墨底白字；触屏不显示，必要的说明改成文字或放进帮助页。">
      <Panel>
        <Row>
          <Spec caption="悬停（下方，默认）"><IconButton variant="filled" label="放大"><ZoomIn aria-hidden="true" strokeWidth={1.75} /></IconButton></Spec>
          <Spec caption="右侧（侧栏图标）"><IconButton variant="filled" label="作品管理" tooltipSide="right"><Grid3x3 aria-hidden="true" strokeWidth={1.75} /></IconButton></Spec>
          <Spec caption="上方（底部工具条）"><IconButton variant="filled" label="适配屏幕" tooltipSide="top"><Scan aria-hidden="true" strokeWidth={1.75} /></IconButton></Spec>
          <Spec caption="样张">
            <span className="relative inline-grid justify-items-center gap-2">
              <IconButton variant="filled" label="撤销" tooltip={false}><Undo2 aria-hidden="true" strokeWidth={1.75} /></IconButton>
              <span role="tooltip" className="rounded-sm bg-ink px-2.5 py-1.5 text-caption leading-tight font-medium whitespace-nowrap text-on-ink">撤销 ⌘Z</span>
            </span>
          </Spec>
        </Row>
      </Panel>
    </KitSection>
  );
}

function CardsSection() {
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const works = useMemo(() => [
    { id: 'w-cat', title: '橘猫团子', pattern: motifPattern('cat', 32), author: AUTHORS.cheng.name, badge: <Badge tone="featured"><Star aria-hidden="true" className="fill-current" />精选</Badge> },
    { id: 'w-panda', title: '熊猫滚滚', pattern: motifPattern('panda', 32), author: AUTHORS.official.name, badge: <Badge tone="on-image">官方</Badge> },
  ], []);
  const designs = useMemo(() => [
    { id: 'd-rainbow', title: '彩虹挂件', pattern: motifPattern('rainbow', 58), meta: '58×58 · 8 色 · 2 小时前', badge: <Badge tone="on-image"><CircleDot aria-hidden="true" />跟拼 32%</Badge> },
    { id: 'd-heart', title: '小黄鸡钥匙扣', pattern: motifPattern('chick', 24), meta: '24×24 · 6 色 · 昨天', badge: <Badge tone="on-image"><CloudOff aria-hidden="true" />仅本机</Badge> },
  ], []);
  return (
    <KitSection id="cards" title="作品卡与设计卡" rule="图纸即卡片：正方形豆粒渲染、圆角 16、静置无阴影；右上点赞；标题单行省略；元信息「作者 · 尺寸 · 颜色 + 用色小圆豆」。">
      <Panel>
        <div className="grid grid-cols-4 gap-5 max-xl:grid-cols-2 max-md:gap-3">
          {works.map((work) => {
            const usage = colorUsage(work.pattern);
            return (
              <WorkCard
                key={work.id}
                href="#kit-cards"
                linkLabel={`查看「${work.title}」`}
                title={work.title}
                media={<BeadImage lazy={false} pattern={work.pattern} alt={`${work.title}，${work.pattern.width}×${work.pattern.height} 拼豆图纸`} />}
                badges={work.badge}
                action={<LikeButton title={work.title} pressed={!!liked[work.id]} onPressedChange={(next) => setLiked((prev) => ({ ...prev, [work.id]: next }))} />}
                meta={<><MetaItem grow>{work.author}</MetaItem><MetaSep wide /><MetaItem wide>{work.pattern.width}×{work.pattern.height}</MetaItem><MetaSep /><MetaItem>{usage.length} 色</MetaItem><BeadDots colors={usage.map((item) => item.hex)} /></>}
              />
            );
          })}
          {designs.map((design) => (
            <WorkCard
              key={design.id}
              href="#kit-cards"
              linkLabel={`打开「${design.title}」`}
              title={design.title}
              media={<BeadImage lazy={false} pattern={design.pattern} alt="" />}
              badges={design.badge}
              actionHoverOnly
              action={<IconButton variant="on-image" label={`「${design.title}」的更多操作`} tooltip={false}><Ellipsis aria-hidden="true" strokeWidth={1.75} /></IconButton>}
              meta={<MetaItem>{design.meta}</MetaItem>}
            />
          ))}
        </div>
        <Note className="-mt-1">前两张是作品卡（发现页），后两张是设计卡（我的设计）：角标只在需要时出现，悬停出现「…」。橘猫团子 · 大号 这类普通草稿不带角标。</Note>
      </Panel>
    </KitSection>
  );
}

function BeadsSection() {
  const keys: Key[] = ['K', 'W', 'S', 'R', 'P', 'O', 'Y', 'G', 'C', 'B', 'V', 'T'];
  const usage = useMemo(() => colorUsage(motifPattern('cat', 32)), []);
  const bead = (hex: string) => (
    <i aria-hidden="true" className="relative size-6 shrink-0 rounded-full inset-ring-1 inset-ring-ink/8 after:absolute after:inset-2 after:rounded-full after:bg-bg/70 after:content-['']" style={{ backgroundColor: hex }} />
  );
  return (
    <KitSection id="beads" title="色号色块" rule="色号与 HEX 用等宽字体；豆粒色块只出现在和色号有关的位置，颜色值只来自色板数据。">
      <Panel>
        <Label>色号色块</Label>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-4 gap-y-3">
          {keys.map((key) => (
            <div key={key} className="flex min-w-0 items-center gap-2.5">
              {bead(BEADS[key].hex)}
              <span className="grid min-w-0">
                <b className="font-mono text-caption font-semibold text-ink">{BEADS[key].code}</b>
                <small className="text-caption font-normal text-ink-3">{BEADS[key].name}</small>
              </span>
              <code className="ml-auto font-mono text-caption font-normal text-ink-3">{BEADS[key].hex}</code>
            </div>
          ))}
        </div>
        <Label>色号清单行（详情页、编辑器）</Label>
        <ul className="grid max-w-105">
          {usage.slice(0, 5).map((color, index) => (
            <li key={color.hex} className={cn('grid grid-cols-[24px_44px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-body-sm text-ink-2', index > 0 && 'border-t border-line')}>
              {bead(color.hex)}
              <b className="font-mono text-caption font-semibold text-ink">{color.code}</b>
              <span>{beadName(color.code)}</span>
              <span className="tabular-nums">{color.count} 颗</span>
            </li>
          ))}
        </ul>
        <Label>作品卡上的用色小圆豆</Label>
        <div className="flex"><BeadDots colors={usage.map((item) => item.hex)} className="ml-0" /></div>
      </Panel>
    </KitSection>
  );
}
