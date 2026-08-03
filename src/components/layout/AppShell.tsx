import { ReactNode, useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

interface Props {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

export default function AppShell({ currentPage, onNavigate, children }: Props) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('sidebar-collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      sessionStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar — hover-to-expand when collapsed, pinned when expanded */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar
          currentPage={currentPage}
          onNavigate={onNavigate}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-50 flex w-64 flex-col">
            <Sidebar
              currentPage={currentPage}
              onNavigate={(page) => {
                onNavigate(page);
                setMobileSidebarOpen(false);
              }}
              collapsed={false}
              onToggleCollapse={() => {}}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 md:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-slate-700">CAM</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
