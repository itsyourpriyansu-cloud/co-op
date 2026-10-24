import { useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const KEY = 'tgs.console.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function StaffShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(KEY, prev ? '0' : '1');
      } catch {
        /* non-fatal */
      }
      return !prev;
    });
  };

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
