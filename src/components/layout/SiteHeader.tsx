"use client";
import { zhCN } from "@/messages/zh-CN";

import Link from "next/link";
import { type MouseEvent, type ReactNode } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import ActionOverflow from "@/components/layout/ActionOverflow";
import { useAuthStatus } from "@/components/account/useAuthStatus";
import { ConsentSlot } from "@/components/analytics/ConsentPlacement";

interface SiteHeaderProps {
  title: string;
  hideHeading?: boolean;
  currentPath: string;
  subtitle?: string;
  primaryActions?: ReactNode;
  overflowActions?: ReactNode;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}
const navigation: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: zhCN.beadhue.discover, icon: "grid" },
  { href: "/app", label: zhCN.beadhue.create, icon: "plus" },
  { href: "/designs", label: zhCN.beadhue.mine, icon: "folder" },
];
function active(path: string, href: string) {
  if (href === "/")
    return (
      path === "/" ||
      (path.startsWith("/community") && path !== "/community/mine")
    );
  if (href === "/designs")
    return ["/designs", "/account", "/community/mine"].some((p) =>
      path.startsWith(p),
    );
  return path.startsWith(href);
}

export default function SiteHeader({
  hideHeading = false,
  title,
  currentPath,
  subtitle,
  primaryActions,
  overflowActions,
  onNavigate,
}: SiteHeaderProps) {
  const auth = useAuthStatus();
  const avatar =
    auth.kind === "user"
      ? (auth.username || auth.email).trim().charAt(0).toUpperCase()
      : zhCN.beadhue.me;
  const link = (href: string) => (event: MouseEvent<HTMLAnchorElement>) =>
    onNavigate?.(event, href);
  const links = navigation.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={link(item.href)}
      className={active(currentPath, item.href) ? "active" : undefined}
      aria-current={active(currentPath, item.href) ? "page" : undefined}
    >
      <Icon name={item.icon} size={20} />
      <span>{item.label}</span>
    </Link>
  ));
  return (
    <>
      <header className="site-header">
        <Link
          href="/"
          onClick={link("/")}
          className="brand"
          aria-label={zhCN.beadhue.brandHome}
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-word">
            {zhCN.beadhue.brandChinese}
            <small>BeadHue</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label={zhCN.beadhue.mainNavigation}>
          {links}
        </nav>
        <div className="header-extras">
          <Link href="/palettes" onClick={link("/palettes")}>
            {zhCN.beadhue.palettes}
          </Link>
          <Link href="/help" onClick={link("/help")}>
            {zhCN.beadhue.help}
          </Link>
          <Link
            href="/account"
            onClick={link("/account")}
            className="avatar"
            aria-label={zhCN.beadhue.account}
          >
            {avatar}
          </Link>
        </div>
      </header>
      <ConsentSlot />
      {!hideHeading && currentPath !== "/" && currentPath !== "/community" && (
        <div className="beadhue-page-heading">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="row wrap">
            {primaryActions}
            {overflowActions && (
              <ActionOverflow
                label={zhCN.beadhue.moreActions}
                actions={overflowActions}
              />
            )}
          </div>
        </div>
      )}
      <nav
        className="mobile-nav"
        aria-label={zhCN.beadhue.mainNavigation}
        data-testid="workspace-mobile-nav"
      >
        {links}
      </nav>
    </>
  );
}
