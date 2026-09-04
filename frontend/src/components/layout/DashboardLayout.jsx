import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { JudgeDemoGuide } from '../demo/JudgeDemoGuide';

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-defense-950 flex flex-col">
      <Navbar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
      <JudgeDemoGuide />
      <Footer />
    </div>
  );
}

