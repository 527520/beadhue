import { zhCN } from "@/messages/zh-CN";
import Link from "next/link";
import { SOURCE_REPO_URL } from "@/lib/appInfo";
export default function SiteFooter() {
  return (
    <footer className="footer">
      <span>{zhCN.beadhue.footerBrand}</span>
      <div>
        <Link href="/help">{zhCN.beadhue.usageHelp}</Link>
        <Link href="/privacy">{zhCN.beadhue.privacy}</Link>
        <Link href="/about">{zhCN.beadhue.about}</Link>
        <a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer">
          {zhCN.beadhue.source}
        </a>
      </div>
    </footer>
  );
}
