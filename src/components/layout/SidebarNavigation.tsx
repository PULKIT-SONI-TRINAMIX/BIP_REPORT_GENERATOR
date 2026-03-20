import React from 'react';
import Link from 'next/link';
import { LayoutDashboard, Users, FileText, Settings, LogOut, ArrowRightFromLine } from 'lucide-react';

export default function SidebarNavigation() {
  return (
    <aside className="w-[68px] h-screen bg-[#1c2331] flex flex-col items-center py-6 justify-between shrink-0 fixed left-0 top-0 z-20 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-6 w-full items-center mt-16">
        {/* Top items */}
        <Link href="/" className="p-3 text-muted hover:text-white hover:bg-panel rounded-xl transition-colors cursor-pointer w-[44px] h-[44px] flex justify-center items-center">
          <LayoutDashboard size={22} />
        </Link>
        <Link href="/intake" className="p-3 text-muted hover:text-white hover:bg-panel rounded-xl transition-colors cursor-pointer w-[44px] h-[44px] flex justify-center items-center">
          <Users size={22} />
        </Link>
        <Link href="/studio" className="p-3 text-muted hover:text-white hover:bg-panel rounded-xl transition-colors cursor-pointer w-[44px] h-[44px] flex justify-center items-center">
          <FileText size={22} />
        </Link>
        <Link href="/knowledge" className="p-3 text-muted hover:text-white hover:bg-panel rounded-xl transition-colors cursor-pointer w-[44px] h-[44px] flex justify-center items-center">
          <Settings size={22} />
        </Link>
      </div>
      
      {/* Bottom items */}
      <div className="flex flex-col gap-6 w-full items-center mb-4">
        <button className="p-3 text-muted hover:text-white hover:bg-panel rounded-xl transition-colors cursor-pointer w-[44px] h-[44px] flex justify-center items-center">
          <ArrowRightFromLine size={20} className="rotate-180" />
        </button>
      </div>
    </aside>
  );
}
