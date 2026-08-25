interface TopbarProps {
  title?: string;
  children?: React.ReactNode;
}

/** 薄顶栏：页面标题由 feature 内 PageHeader 承担，此处不再放假头像 / 通知。 */
export function Topbar({ title, children }: TopbarProps) {
  if (!title && !children) {
    return <header className="h-14 shrink-0 border-b border-line bg-surface" aria-hidden />;
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:px-6">
      {title ? <h1 className="shrink-0 text-sm font-medium">{title}</h1> : null}
      {children}
    </header>
  );
}
