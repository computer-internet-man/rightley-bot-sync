import React from 'react';
import { AppContext } from '@/worker';
import Navigation from './Navigation';

interface LayoutProps {
  ctx: AppContext;
  children: React.ReactNode;
  currentPath?: string;
}

export default function Layout({ ctx, children, currentPath }: LayoutProps) {
  const { user } = ctx;

  // If no user, show minimal layout
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation ctx={ctx} currentPath={currentPath} />
      <main>{children}</main>
    </div>
  );
}
