'use client';

import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { Maximize2, Circle, Edit3, FileText, Settings, Key, Loader2 } from 'lucide-react';
import { fetchDashboardStats } from '@/lib/api';

const sqlActivityData = [
  { day: 'Day 1', value: 10 },
  { day: 'Day 2', value: 35 },
  { day: 'Day 3', value: 25 },
  { day: 'Day 4', value: 40 },
  { day: 'Day 5', value: 20 },
  { day: 'Day 6', value: 80 },
  { day: 'Day 7', value: 70 },
  { day: 'Day 8', value: 100 },
];

const moduleData = [
  { name: 'ERP', value: 900 },
  { name: 'SCM', value: 500 },
  { name: 'HCM', value: 450 },
  { name: 'Financials', value: 300 },
  { name: 'RCA', value: 250 },
  { name: 'Other', value: 200 },
];

const pieData = [
  { name: 'Direct Text', value: 400, color: '#3b82f6' },
  { name: 'PDF Uploads', value: 300, color: '#60a5fa' },
  { name: 'Word Docs', value: 150, color: '#93c5fd' },
];

const activities = [
  { id: 1, title: 'Employee/Manager query generated (ERP)', time: '17 minutes ago', icon: Edit3 },
  { id: 2, title: "Apache Tika parsed 'Supplier_Req.pdf'", time: '17 minutes ago', icon: FileText },
  { id: 3, title: 'Employee/Manager query generated (ERP)', time: '17 minutes ago', icon: Edit3 },
  { id: 4, title: "Apache Tika parsed 'Supplier_Req.pdf'", time: '17 minutes ago', icon: FileText },
];

export default function SentinelDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await fetchDashboardStats();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  return (
    <div className="flex flex-col gap-6 h-full text-sm">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-semibold text-white tracking-wide">AI Powered Oracle SQL Generator</h1>
        <button className="flex items-center gap-2 bg-[#2a3441] border border-[#2F3A4A] px-4 py-2 rounded-lg text-muted hover:text-white transition-colors">
          <Maximize2 size={16} />
          <span>Full-screen</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg">
          Failed to load dashboard data: {error}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#2A3441] p-5 rounded-xl border border-[#2F3A4A] flex flex-col justify-center relative">
          <span className="text-muted mb-1 text-sm font-medium">Total Queries Generated</span>
          {loading ? <Loader2 size={24} className="animate-spin text-blue-500 mt-1" /> : <span className="text-3xl font-bold text-white">{stats?.totalQueries}</span>}
        </div>
        <div className="bg-[#2A3441] p-5 rounded-xl border border-[#2F3A4A] flex flex-col justify-center">
          <span className="text-muted mb-1 text-sm font-medium">Requirements Analyzed</span>
          {loading ? <Loader2 size={24} className="animate-spin text-blue-500 mt-1" /> : <span className="text-3xl font-bold text-white">{stats?.requirementsAnalyzed}</span>}
        </div>
        <div className="bg-[#2A3441] p-5 rounded-xl border border-[#2F3A4A] flex flex-col justify-center">
          <span className="text-muted mb-1 text-sm font-medium">Documents Processed</span>
          {loading ? <Loader2 size={24} className="animate-spin text-blue-500 mt-1" /> : <span className="text-3xl font-bold text-white">{stats?.documentsProcessed}</span>}
        </div>
        <div className="bg-[#2A3441] p-5 rounded-xl border border-[#2F3A4A] flex flex-col justify-center">
          <span className="text-muted mb-1 text-sm font-medium">Average Confidence</span>
          {loading ? <Loader2 size={24} className="animate-spin text-blue-500 mt-1" /> : <span className="text-3xl font-bold text-white">{stats?.avgConfidence}%</span>}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 pb-6">
        {/* Left Column (Status & Projects) */}
        <div className="col-span-3 flex flex-col gap-6">
          <div className="bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A]">
            <h2 className="text-muted text-sm font-medium mb-4">System Status</h2>
            <div className="flex items-center gap-3 mb-8">
              <Circle className="text-green-500 fill-green-500 w-5 h-5 absolute animate-ping opacity-20" />
              <Circle className="text-green-500 fill-green-500 w-5 h-5 z-10" />
              <span className="text-2xl font-semibold text-white">{loading ? 'Loading...' : (stats?.status || 'Running')}</span>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center bg-[#1E2532]/50 p-3 rounded-lg border border-[#2F3A4A]/50">
                <div className="flex items-center gap-2">
                  <Settings size={16} className="text-blue-400" />
                  <span className="text-muted text-sm">Gemini API</span>
                </div>
                <span className="text-green-500 text-sm font-medium">Active (Free Tier)</span>
              </div>
              <div className="flex justify-between items-center bg-[#1E2532]/50 p-3 rounded-lg border border-[#2F3A4A]/50">
                <div className="flex items-center gap-2">
                  <Key size={16} className="text-slate-400" />
                  <span className="text-muted text-sm">DB</span>
                </div>
                <span className="text-green-500 text-sm font-medium">Connected (PostgreSQL)</span>
              </div>
            </div>
          </div>

          <div className="bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A] flex-1">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-white text-base font-semibold">Active Projects</h2>
              <button className="text-xs bg-[#1E2532] border border-[#2F3A4A] text-muted px-3 py-1.5 rounded-full hover:text-white">Progress</button>
            </div>
            
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white font-medium">MVP Backend Setup</span>
                </div>
                <div className="text-muted text-xs mb-2">Task 1 - 14 hours progress</div>
                <div className="h-1.5 w-full bg-[#1E2532] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-[65%] rounded-full"></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white font-medium">Metadata DB Creation</span>
                </div>
                <div className="text-muted text-xs mb-2">Task 2 - 14 hours progress</div>
                <div className="h-1.5 w-full bg-[#1E2532] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-[45%] rounded-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white font-medium">Document Parsing Integration</span>
                </div>
                <div className="h-1.5 w-full bg-[#1E2532] rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-blue-500 w-[30%] rounded-full"></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white font-medium">Design & Integration Process</span>
                </div>
                <div className="h-1.5 w-full bg-[#1E2532] rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-blue-500 w-[75%] rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column (Charts) */}
        <div className="col-span-6 flex flex-col gap-6">
          <div className="bg-[#2A3441] p-5 rounded-xl border border-[#2F3A4A] h-[340px]">
             <div className="flex justify-between items-center mb-2">
                <h2 className="text-white text-base font-semibold">SQL Generation Activity</h2>
                <div className="flex bg-[#1E2532] rounded-lg p-1 border border-[#2F3A4A]">
                  <button className="px-3 py-1 bg-[#2A3441] text-white text-xs rounded shadow-sm">Day</button>
                  <button className="px-3 py-1 text-muted text-xs hover:text-white">Week</button>
                </div>
             </div>
             <p className="text-muted text-xs mb-4">Successful generations activity</p>
             <div className="h-[230px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sqlActivityData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2F3A4A" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dx={-10} />
                    <Tooltip 
                      contentStyle={{backgroundColor: '#1E2532', borderColor: '#2F3A4A', borderRadius: '8px'}}
                      itemStyle={{color: '#fff'}}
                    />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-6 h-[260px]">
            <div className="bg-[#2A3441] p-5 rounded-xl border border-[#2F3A4A]">
               <h2 className="text-white text-base font-semibold mb-4">Queries by Oracle Module</h2>
               <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={moduleData} margin={{top: 0, right: 20, left: 0, bottom: 0}}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} width={70} />
                      <Tooltip cursor={{fill: '#1E2532'}} contentStyle={{backgroundColor: '#1E2532', borderColor: '#2F3A4A', borderRadius: '8px', color: '#fff'}} />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-[#2A3441] p-5 rounded-xl border border-[#2F3A4A]">
               <h2 className="text-white text-base font-semibold mb-4">Requirement Source</h2>
               <div className="h-[150px] w-full flex justify-center items-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{backgroundColor: '#1E2532', borderColor: '#2F3A4A', borderRadius: '8px', color: '#fff'}} />
                    </PieChart>
                  </ResponsiveContainer>
               </div>
               <div className="flex justify-center gap-4 mt-2">
                 {pieData.map((entry, index) => (
                   <div key={index} className="flex items-center gap-1.5">
                     <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: entry.color}}></span>
                     <span className="text-xs text-muted">{entry.name}</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>

        {/* Right Column (Activity & Metrics) */}
        <div className="col-span-3 flex flex-col gap-6">
          <div className="bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A] h-[340px] overflow-hidden">
            <h2 className="text-white text-base font-semibold mb-6">Recent Activity Feed</h2>
            <div className="flex flex-col gap-6">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-4">
                  <div className="bg-[#1E2532] p-2.5 rounded-full h-10 w-10 flex items-center justify-center border border-[#2F3A4A] shrink-0 text-blue-400">
                    <activity.icon size={18} />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-sm font-medium text-white/90 leading-tight mb-1 line-clamp-2">{activity.title}</p>
                    <p className="text-xs text-muted">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1E2532] p-6 rounded-xl border border-[#2F3A4A] flex-1">
            <h2 className="text-white text-base font-semibold mb-6">Key Metadata Metrics</h2>
            
            <div className="flex flex-col gap-8">
              <div>
                <div className="text-4xl font-bold text-white mb-1">1461</div>
                <div className="text-muted text-sm">Total tables</div>
              </div>
              
              <div>
                <div className="text-4xl font-bold text-white mb-1">377</div>
                <div className="text-muted text-sm">Total columns</div>
              </div>
              
              <div>
                <div className="text-4xl font-bold text-white mb-1">1021</div>
                <div className="text-muted text-sm leading-tight">Relationships stored in local knowledge base</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
