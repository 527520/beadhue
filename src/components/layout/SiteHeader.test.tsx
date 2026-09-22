// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { MouseEvent } from 'react';
import SiteHeader from './SiteHeader';
vi.mock('@/components/account/useAuthStatus',()=>({useAuthStatus:()=>({kind:'guest'})}));
it('B primary and secondary navigation all respect the editor leave guard',()=>{
 const guard=vi.fn((event:MouseEvent<HTMLAnchorElement>,_href:string)=>event.preventDefault());
 const {container}=render(<SiteHeader title="工作台" currentPath="/app" onNavigate={guard}/>);
 const links=Array.from(container.querySelectorAll<HTMLAnchorElement>('a'));
 for(const link of links)fireEvent.click(link);
 expect(guard.mock.calls.map(call=>call[1])).toEqual(links.map(link=>link.getAttribute('href')));
 const nav=within(container.querySelector('.main-nav') as HTMLElement);
 expect(nav.getByRole('link',{name:'创作'})).toHaveAttribute('aria-current','page');
 expect(screen.getByRole('link',{name:'色板'})).toHaveAttribute('href','/palettes');
 expect(screen.getByRole('link',{name:'帮助'})).toHaveAttribute('href','/help');
});
it('retains a single heading and exposes secondary actions through the B overflow',()=>{
 render(<SiteHeader title="我的设计" currentPath="/designs" primaryActions={<button>新建设计</button>} overflowActions={<button>退出登录</button>}/>);
 expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
 expect(screen.getByRole('button',{name:'新建设计'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'更多操作'}));
 expect(screen.getByRole('button',{name:'退出登录'})).toBeVisible();
});
