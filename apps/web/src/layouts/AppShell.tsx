import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/layouts/Sidebar';
import { Topbar } from '@/layouts/Topbar';

/** 带侧栏 + 顶栏的后台壳层；子路由通过 Outlet 渲染。 */
export default function AppShell() {
  return (
    <div className="app-shell flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
