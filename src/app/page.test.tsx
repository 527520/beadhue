// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Home from './page';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
vi.mock('./community/page',()=>({default:()=> <h1>发现作品</h1>}));
vi.mock('@/components/account/useAuthStatus',()=>({useAuthStatus:()=>({kind:'guest'})}));
it('home opens discovery and B navigation preserves creation, designs and secondary entrances',()=>{
 render(<><Home/><SiteHeader title="发现" currentPath="/"/><SiteFooter/></>);
 expect(screen.getByRole('heading',{name:'发现作品'})).toBeVisible();
 const nav=within(document.querySelector('.main-nav') as HTMLElement);
 expect(nav.getByRole('link',{name:'发现'})).toHaveAttribute('aria-current','page');
 expect(nav.getByRole('link',{name:'创作'})).toHaveAttribute('href','/app');
 expect(nav.getByRole('link',{name:'我的'})).toHaveAttribute('href','/designs');
 expect(screen.getByRole('link',{name:'账号'})).toHaveAttribute('href','/account');
 expect(screen.getByRole('link',{name:'源码'})).toHaveAttribute('href','https://github.com/527520/beadhue');
 expect(screen.getByRole('link',{name:'隐私说明'})).toHaveAttribute('href','/privacy');
});
