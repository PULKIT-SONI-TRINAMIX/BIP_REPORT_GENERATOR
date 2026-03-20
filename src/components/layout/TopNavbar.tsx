import React from 'react';
import { Search } from 'lucide-react';

export default function TopNavbar() {
  return (
    <header className="h-[68px] bg-[#1E2532] border-b border-[#2A3441] flex items-center justify-between px-6 shrink-0 fixed top-0 w-full z-10 pl-[84px] shadow-sm">
      {/* Trinamix Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8 2 6 7 6 7C6 7 4 10 2 12C4 14 6 17 6 17C6 17 8 22 12 22C16 22 18 17 18 17C18 17 20 14 22 12C20 10 18 7 18 7C18 7 16 2 12 2Z" fill="url(#trinamix-grad-main)" opacity="0.9" />
            <circle cx="12" cy="12" r="4" fill="#1E2532" />
            <path d="M12 9C13.6569 9 15 10.3431 15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9Z" fill="url(#trinamix-grad-center)" />
            <defs>
              <linearGradient id="trinamix-grad-main" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ff4d4d"/>
                <stop offset="0.5" stopColor="#0072FF"/>
                <stop offset="1" stopColor="#00C6FF"/>
              </linearGradient>
              <linearGradient id="trinamix-grad-center" x1="9" y1="9" x2="15" y2="15" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ff4d4d"/>
                <stop offset="1" stopColor="#00C6FF"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="font-medium text-xl ml-2 tracking-wide text-white">Trinamix</span>
        </div>
      </div>

      {/* Global Search */}
      <div className="flex items-center justify-center flex-1 max-w-sm mr-auto ml-[15%]">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={15} />
          <input
            type="text"
            placeholder="Search"
            className="w-full bg-[#1A202C]/60 text-sm text-foreground outline-none placeholder-[#64748b] rounded-full pl-10 pr-4 py-2 focus:ring-1 focus:ring-primary border border-[#2F3A4A]"
          />
        </div>
      </div>
    </header>
  );
}
