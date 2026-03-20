import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import SidebarNavigation from '@/components/layout/SidebarNavigation';
import TopNavbar from '@/components/layout/TopNavbar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'AI Powered Oracle SQL Generator',
  description: 'AI-Powered Oracle SQL Generator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased font-sans bg-background text-foreground h-screen overflow-hidden`}>
        <div className="flex bg-[#1E2532] h-full">
          <SidebarNavigation />
          <div className="flex-1 flex flex-col pl-[68px]">
            <TopNavbar />
            <main className="flex-1 mt-[68px] overflow-auto p-4 md:p-6 pb-20 max-w-[1920px] mx-auto w-full relative">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
