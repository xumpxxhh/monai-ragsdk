import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';

interface FullscreenLayoutProps {
  backTo: string;
  backLabel?: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** 全屏编辑 / 调试页顶栏布局。 */
export default function FullscreenLayout({
  backTo,
  backLabel = '返回',
  title,
  actions,
  children,
}: FullscreenLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link to={backTo}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          </Link>
          <h1 className="text-sm font-medium">{title}</h1>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
