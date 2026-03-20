'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Download, Copy, AlertTriangle, Loader2, CheckCircle, XCircle, Search, Table, Filter, Terminal, Database, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { generateSql } from '@/lib/api';

interface TableVerification {
  tableName: string;
  sourceUrl: string;
  status: 'VERIFIED' | 'UNVERIFIED';
}

interface ColumnVerification {
  columnUsed: string;
  table: string;
  verifiedOnPage: 'YES' | 'NO';
}

interface Parameter {
  name: string;
  dataType: string;
  displayType: string;
  defaultValue: string;
}

// Defined outside the component so the array reference is stable across renders.
// If this were inside the component, every render would create a new array instance,
// which would cause an infinite loop if the array were ever added to a useEffect
// dependency array (a common ESLint suggestion).
const LOADING_STAGES = [
  'Checking requirements',
  'Selecting tables and columns',
  'Writing query',
  'Optimizing query',
];

export default function QueryStudio() {
  const [requirement, setRequirement] = useState('');
  const [sql, setSql] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New State for Advanced Features
  const [tableReport, setTableReport] = useState<TableVerification[]>([]);
  const [columnReport, setColumnReport] = useState<ColumnVerification[]>([]);
  const [params, setParams] = useState<Parameter[]>([]);
  const [buLookup, setBuLookup] = useState<string | null>(null);
  const [statusLookup, setStatusLookup] = useState<string | null>(null);
  const [testSeq, setTestSeq] = useState<string | null>(null);
  const [dbSelection, setDbSelection] = useState<string | null>(null);
  const [sqlType, setSqlType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sql' | 'verification' | 'params'>('sql');
  const [loadingStage, setLoadingStage] = useState(0);
  const [dotCount, setDotCount] = useState(0);
  const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Optimization Modal State
  const [isOptimizeModalOpen, setIsOptimizeModalOpen] = useState(false);
  const [optimizeInstructions, setOptimizeInstructions] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  // Toast State
  const [toast, setToast] = useState<{ message: string; detail: string } | null>(null);

  const showToast = (message: string, detail: string) => {
    setToast({ message, detail });
    setTimeout(() => setToast(null), 6000);
  };

  useEffect(() => {
    const stored = localStorage.getItem('osca_current_generation');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setRequirement(data.requirement || '');
        setSql(data.sql || null);
        setExplanation(data.explanation || null);
        setConfidenceScore(data.confidenceScore || 0);
        setTableReport(data.tableVerificationReport || []);
        setColumnReport(data.columnVerificationReport || []);
        setParams(data.parameters || []);
        setBuLookup(data.buLookupQuery || null);
        setStatusLookup(data.statusLookupQuery || null);
        setTestSeq(data.testSequence || null);
        setDbSelection(data.databaseSelection || null);
        setSqlType(data.sqlType || null);
        localStorage.removeItem('osca_current_generation');
      } catch (e) {
        console.error("Error loading stored generation", e);
      }
    }
  }, []);

  // Start / stop loading animation
  useEffect(() => {
    if (isLoading) {
      setLoadingStage(0);
      setDotCount(0);
      loadingIntervalRef.current = setInterval(() => {
        setLoadingStage(prev => (prev + 1) % LOADING_STAGES.length);
      }, 1500);
      dotIntervalRef.current = setInterval(() => {
        setDotCount(prev => (prev + 1) % 4);
      }, 400);
    } else {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      if (dotIntervalRef.current)   clearInterval(dotIntervalRef.current);
    }
    return () => {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      if (dotIntervalRef.current)   clearInterval(dotIntervalRef.current);
    };
  }, [isLoading]);

  const handleGenerate = async () => {
    if (!requirement.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await generateSql(requirement);
      setSql(data.sql);
      setExplanation(data.explanation);
      setConfidenceScore(data.confidenceScore);
      setTableReport(data.tableVerificationReport || []);
      setColumnReport(data.columnVerificationReport || []);
      setParams(data.parameters || []);
      setBuLookup(data.buLookupQuery || null);
      setStatusLookup(data.statusLookupQuery || null);
      setTestSeq(data.testSequence || null);
      setDbSelection(data.databaseSelection || null);
      setSqlType(data.sqlType || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!sql) return;
    setIsOptimizing(true);
    setOptimizeError(null);
    try {
      const res = await fetch('http://localhost:3000/api/optimize-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalSql: sql, userInstructions: optimizeInstructions }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Optimization request failed.');
      }
      const data = await res.json();
      setSql(data.optimizedSql);
      setIsOptimizeModalOpen(false);
      setOptimizeInstructions('');
      showToast('SQL Optimized Successfully', data.explanation || 'AI applied performance improvements.');
    } catch (err: any) {
      setOptimizeError(err.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full text-sm">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-white tracking-wide">Query Generator Studio</h1>
          {dbSelection && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full">
              <Database size={12} className="text-blue-400" />
              <span className="text-blue-400 text-[10px] uppercase font-bold tracking-wider">{dbSelection}</span>
            </div>
          )}
          {sqlType && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded-full">
              <Terminal size={12} className="text-purple-400" />
              <span className="text-purple-400 text-[10px] uppercase font-bold tracking-wider">{sqlType}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
            <span className="text-muted text-xs">Confidence Score</span>
            <span className="text-green-500 text-xs font-semibold ml-1">{confidenceScore || '-'}%</span>
            <div className="h-1.5 w-24 bg-[#1E2532] rounded-full ml-1 overflow-hidden border border-[#2F3A4A]/50">
              <div 
                className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-green-500 rounded-full transition-all duration-1000" 
                style={{ width: `${confidenceScore || 0}%` }}></div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 pb-6 h-full min-h-[700px]">
        {/* Left Column - Requirements & Context */}
        <div className="col-span-4 flex flex-col gap-6 h-full">
           <div className="bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A] flex flex-col">
              <h2 className="text-white text-base font-semibold mb-3 flex items-center gap-2">
                <Search size={18} className="text-blue-400" /> Requirement
              </h2>
              
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-2 rounded-lg mb-4 text-xs">
                  {error}
                </div>
              )}

              <textarea 
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                className="w-full bg-[#1A202C]/60 text-white border border-[#475569] rounded-lg p-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none mb-4 custom-scrollbar"
                rows={4}
                placeholder="e.g. Generate a list of all active employees whose manager is inactive."
              ></textarea>
              
              <button 
                onClick={handleGenerate} 
                disabled={isLoading}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2 mb-6 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                {isLoading ? 'Generating SQL...' : 'Generate AI Query'}
              </button>

              <div className="flex justify-between items-end gap-3">
                <div className="flex-1">
                  <span className="text-muted text-xs block mb-2">Metadata Alignment Score (Gemini)</span>
                  <div className="h-2 w-full bg-[#1E2532] rounded-full overflow-hidden mb-1 border border-[#2F3A4A]/50">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-green-500 rounded-full transition-all duration-1000"
                      style={{ width: `${confidenceScore || 0}%` }}
                    />
                  </div>
                </div>
                <div className={`flex flex-col items-center justify-center w-20 h-12 rounded-lg border font-bold text-lg shrink-0 shadow-inner transition-all duration-700 ${
                  confidenceScore >= 80 ? 'bg-green-500/10 border-green-500/40 text-green-400' :
                  confidenceScore >= 50 ? 'bg-orange-500/10 border-orange-500/40 text-orange-400' :
                  confidenceScore > 0   ? 'bg-red-500/10 border-red-500/40 text-red-400' :
                                          'bg-[#1E2532] border-[#2F3A4A] text-muted'
                }`}>
                  <span className="text-xs font-medium leading-none mb-0.5 opacity-70">Score</span>
                  <span>{confidenceScore > 0 ? `${confidenceScore}%` : '--'}</span>
                </div>
              </div>
           </div>

           <div className="bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A] flex-1 overflow-hidden flex flex-col">
              <h2 className="text-white text-base font-semibold mb-4 shrink-0 flex items-center gap-2">
                <Table size={18} className="text-blue-400" /> Query Insights
              </h2>
              <div className="overflow-y-auto pr-2 flex flex-col gap-5 pb-4 custom-scrollbar flex-1">
                 <div>
                    <h3 className="text-white font-medium mb-1">AI Logic & Explanation</h3>
                    <p className="text-muted text-xs leading-relaxed whitespace-pre-wrap italic">
                       {explanation ? explanation : 'Explanation will appear here...'}
                    </p>
                 </div>
                 
                 {sql && (
                   <>
                    <div className="border-t border-[#475569]/30 pt-4">
                       <h3 className="text-white font-medium mb-2">Test Sequence</h3>
                       <div className="bg-[#1A202C]/60 p-3 rounded-lg border border-[#475569]/50 font-mono text-[11px] text-blue-300">
                         {testSeq || 'No test sequence provided.'}
                       </div>
                    </div>

                    <div className="border-t border-[#475569]/30 pt-4">
                       <h3 className="text-white font-medium mb-2">Companion Lookups</h3>
                       <div className="flex flex-col gap-3">
                         {buLookup && (
                           <div className="flex flex-col gap-1">
                             <span className="text-muted text-[10px] uppercase font-bold tracking-tighter">Business Unit Name Lookup</span>
                             <div className="bg-[#1A202C]/40 p-2 rounded text-[10px] font-mono text-muted line-clamp-2">{buLookup}</div>
                           </div>
                         )}
                         {statusLookup && (
                           <div className="flex flex-col gap-1">
                             <span className="text-muted text-[10px] uppercase font-bold tracking-tighter">Distinct Status Lookup</span>
                             <div className="bg-[#1A202C]/40 p-2 rounded text-[10px] font-mono text-muted line-clamp-2">{statusLookup}</div>
                           </div>
                         )}
                       </div>
                    </div>
                   </>
                 )}
              </div>
           </div>
        </div>

        {/* Right Column - Tabs & Output */}
        <div className="col-span-8 flex flex-col gap-4 h-full">
           <div className="bg-[#2A3441] p-0 rounded-xl border border-[#2F3A4A] flex-1 flex flex-col relative overflow-hidden">
              {/* Tab Header */}
              <div className="flex bg-[#1E2532] border-b border-[#2F3A4A] p-1">
                <button 
                  onClick={() => setActiveTab('sql')}
                  className={`px-6 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === 'sql' ? 'bg-[#2A3441] text-blue-400 shadow-md border border-[#2F3A4A]' : 'text-muted hover:text-white'}`}
                >
                  SQL Output
                </button>
                <button 
                  onClick={() => setActiveTab('verification')}
                  className={`px-6 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'verification' ? 'bg-[#2A3441] text-blue-400 shadow-md border border-[#2F3A4A]' : 'text-muted hover:text-white'}`}
                >
                  Verification Reports
                  {activeTab !== 'verification' && sql && (
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  )}
                </button>
                <button 
                  onClick={() => setActiveTab('params')}
                  className={`px-6 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'params' ? 'bg-[#2A3441] text-blue-400 shadow-md border border-[#2F3A4A]' : 'text-muted hover:text-white'}`}
                >
                  BIP Parameters
                  {params.length > 0 && (
                    <span className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 rounded-full">{params.length}</span>
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto p-6 relative flex flex-col">
                {activeTab === 'sql' && (
                  <>
                    <div className="flex justify-between items-center mb-4 shrink-0">
                       <h2 className="text-white text-lg font-semibold">Oracle Cloud BIP SQL</h2>
                       <div className="flex gap-3">
                          <button className="flex items-center gap-2 text-muted border border-[#475569] bg-[#1E2532] px-3 py-1.5 rounded-lg hover:text-white transition-colors text-xs">
                             <Download size={14} /> Download (.sql)
                          </button>
                          <button 
                            onClick={() => sql && navigator.clipboard.writeText(sql)}
                            className="flex items-center gap-2 text-muted border border-[#475569] bg-[#1E2532] px-3 py-1.5 rounded-lg hover:text-white transition-colors text-xs">
                             <Copy size={14} /> Copy Code
                          </button>
                       </div>
                    </div>

                    <div className="bg-[#1A202C] rounded-xl flex-1 border border-[#2F3A4A] overflow-hidden flex flex-col font-mono text-xs relative">
                       {isLoading && (
                         <div className="absolute inset-0 bg-[#1A202C]/85 z-10 flex flex-col items-center justify-center gap-4">
                           <div className="relative">
                             <Loader2 size={36} className="animate-spin text-blue-500" />
                             <div className="absolute inset-0 rounded-full blur-xl bg-blue-500/20 animate-pulse" />
                           </div>
                           <div className="flex flex-col items-center gap-1">
                             <span className="text-blue-300 font-sans font-semibold text-sm tracking-wide">
                               {LOADING_STAGES[loadingStage]}
                               <span className="inline-block w-6 text-left">{'.'.repeat(dotCount)}</span>
                             </span>
                             <div className="flex gap-1 mt-2">
                               {LOADING_STAGES.map((_, i) => (
                                 <div
                                   key={i}
                                   className={`h-1 rounded-full transition-all duration-500 ${
                                     i === loadingStage ? 'w-6 bg-blue-400' : 'w-2 bg-[#2F3A4A]'
                                   }`}
                                 />
                               ))}
                             </div>
                           </div>
                         </div>
                       )}
                       <div className="flex flex-1 overflow-auto">
                          <div className="py-4 px-3 text-[#475569] text-right bg-[#1A202C]/50 select-none shrink-0 border-r border-[#2F3A4A]/50">
                             {Array.from({length: Math.max(16, (sql ? sql.split('\n').length : 16))}).map((_, i) => (
                               <div key={i} className="mb-1">{i + 1}</div>
                             ))}
                          </div>
                          <div className="py-4 pl-4 pr-10 text-[#e2e8f0] overflow-auto whitespace-pre custom-scrollbar w-full relative">
                              {sql ? (
                                <div dangerouslySetInnerHTML={{ __html: sql.replace(/SELECT|FROM|WHERE|JOIN|ON|AND|OR|GROUP BY|ORDER BY|LEFT|RIGHT|INNER|OUTER|CAST|AS|TRUNC|DATE|NUMBER|VARCHAR2|IS|NULL|IN/g, match => `<span class="text-blue-400 font-bold">${match}</span>`).replace(/'.*?'/g, match => `<span class="text-green-300 font-semibold">${match}</span>`).replace(/:P_\w+/g, match => `<span class="text-orange-400 font-bold underline decoration-dotted">${match}</span>`) }} />
                              ) : (
                                <div className="opacity-30">
                                  Waiting for AI generation...
                                </div>
                              )}
                          </div>
                       </div>
                    </div>
                  </>
                )}

                {activeTab === 'verification' && (
                  <div className="flex flex-col gap-8">
                     <div>
                        <h3 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                           <Table size={20} className="text-green-500" /> SECTION 1: Table Verification Report
                        </h3>
                        {tableReport.length > 0 ? (
                          <div className="border border-[#2F3A4A] rounded-xl overflow-hidden shadow-xl bg-[#1A202C]/40">
                             <table className="w-full text-left">
                                <thead className="bg-[#1E2532] text-muted text-xs uppercase tracking-widest">
                                   <tr>
                                      <th className="px-4 py-3 border-b border-[#2F3A4A]">Table Name</th>
                                      <th className="px-4 py-3 border-b border-[#2F3A4A]">Oracle Source URL</th>
                                      <th className="px-4 py-3 border-b border-[#2F3A4A]">Status</th>
                                   </tr>
                                </thead>
                                <tbody>
                                   {tableReport.map((t, idx) => (
                                     <tr key={idx} className="border-b border-[#2F3A4A]/50 hover:bg-[#2A3441]/30 transition-colors">
                                        <td className="px-4 py-3 font-mono text-blue-300">{t.tableName}</td>
                                        <td className="px-4 py-3">
                                          <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs line-clamp-1">{t.sourceUrl}</a>
                                        </td>
                                        <td className="px-4 py-3">
                                           {t.status === 'VERIFIED' ? (
                                             <span className="bg-green-500/10 text-green-500 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit border border-green-500/30">
                                                <CheckCircle size={10} /> {t.status}
                                             </span>
                                           ) : (
                                             <span className="bg-red-500/10 text-red-500 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit border border-red-500/30">
                                                <XCircle size={10} /> {t.status}
                                             </span>
                                           )}
                                        </td>
                                     </tr>
                                   ))}
                                </tbody>
                             </table>
                          </div>
                        ) : (
                          <div className="bg-[#1A202C]/40 border border-[#2F3A4A] rounded-xl p-10 text-center text-muted">
                             No table data to report yet.
                          </div>
                        )}
                     </div>

                     <div>
                        <h3 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                           <Filter size={20} className="text-blue-500" /> SECTION 2: Column Verification Detail
                        </h3>
                        {columnReport.length > 0 ? (
                          <div className="grid grid-cols-2 gap-4">
                             {columnReport.map((c, idx) => (
                               <div key={idx} className="bg-[#1A202C]/60 border border-[#475569]/30 rounded-lg p-3 flex justify-between items-center">
                                  <div className="flex flex-col">
                                     <span className="text-blue-300 font-mono text-xs">{c.columnUsed}</span>
                                     <span className="text-muted text-[10px] uppercase font-bold tracking-tight">{c.table}</span>
                                  </div>
                                  <div className={`px-2 py-1 rounded text-[10px] font-bold border ${c.verifiedOnPage === 'YES' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                     {c.verifiedOnPage === 'YES' ? 'CONFIRMED' : 'UNVERIFIED'}
                                  </div>
                               </div>
                             ))}
                          </div>
                        ) : (
                          <div className="bg-[#1A202C]/40 border border-[#2F3A4A] rounded-xl p-10 text-center text-muted">
                             Generate a query to see column fact-checks.
                          </div>
                        )}
                     </div>
                  </div>
                )}

                {activeTab === 'params' && (
                  <div>
                    <h2 className="text-white text-lg font-semibold mb-6 flex items-center gap-2">
                      <Table size={20} className="text-orange-500" /> SECTION 4: Parameter Definition (BIP Data Model)
                    </h2>
                    {params.length > 0 ? (
                      <div className="border border-[#2F3A4A] rounded-xl overflow-hidden bg-[#1A202C]/40 shadow-2xl">
                         <table className="w-full text-left">
                            <thead className="bg-[#1E2532] text-muted text-xs uppercase tracking-widest">
                               <tr>
                                  <th className="px-6 py-4 border-b border-[#2F3A4A]">Parameter Name</th>
                                  <th className="px-6 py-4 border-b border-[#2F3A4A]">BIP Bind Name</th>
                                  <th className="px-6 py-4 border-b border-[#2F3A4A]">Data Type</th>
                                  <th className="px-6 py-4 border-b border-[#2F3A4A]">Display Type</th>
                                  <th className="px-6 py-4 border-b border-[#2F3A4A]">Default</th>
                               </tr>
                            </thead>
                            <tbody>
                               {params.map((p, idx) => (
                                 <tr key={idx} className="border-b border-[#2F3A4A]/50 hover:bg-[#2A3441]/30 transition-colors">
                                    <td className="px-6 py-4 font-semibold text-white">{p.name}</td>
                                    <td className="px-6 py-4 font-mono text-orange-400">:{p.name.toUpperCase().replace(/\s+/g, '_')}</td>
                                    <td className="px-6 py-4">
                                      <span className="bg-[#1E2532] border border-[#475569]/50 px-2 py-1 rounded text-xs text-muted">{p.dataType}</span>
                                    </td>
                                    <td className="px-6 py-4 text-muted text-xs">{p.displayType}</td>
                                    <td className="px-6 py-4 text-muted text-xs italic">{p.defaultValue || 'None'}</td>
                                 </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                    ) : (
                      <div className="text-center py-20 text-muted border border-dashed border-[#2F3A4A] rounded-xl">
                        No parameters detected in the generated query logic.
                      </div>
                    )}
                    
                    <div className="mt-8 p-6 bg-blue-500/5 rounded-xl border border-blue-500/20">
                      <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                        <AlertTriangle size={16} /> Data Model Tip
                      </h4>
                      <p className="text-muted text-sm leading-relaxed">
                        These parameters should be added to your Oracle BI Publisher Data Model's <strong>Parameters</strong> section. Ensure the "BIP Bind Name" matches exactly what is used in the SQL query's outer WHERE clause.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Actions area */}
              <div className="p-4 border-t border-[#2F3A4A] bg-[#1E2532]/50 flex justify-between items-center shrink-0">
                  <div className="flex gap-4">
                     <span className="text-muted text-xs italic">* This SQL is optimized for Oracle Cloud Fusion 25D</span>
                  </div>
                  
                  <div className="flex gap-4">
                     <button 
                       onClick={() => { if (sql) { setIsOptimizeModalOpen(true); setOptimizeError(null); } }}
                       disabled={!sql}
                       className="text-white border border-[#475569] bg-[#1E2532] px-6 py-2 rounded-lg hover:bg-[#2A3441] transition-colors text-xs font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                       <Sparkles size={14} className="text-yellow-400" /> Request Optimization
                     </button>
                     <button className="text-white bg-blue-500 px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-semibold text-xs flex gap-2 items-center shadow-lg active:scale-95 duration-75">
                        Execute (Dev Env)
                        <AlertTriangle size={14} className="text-yellow-200" />
                     </button>
                  </div>
              </div>
           </div>
        </div>
      </div>

      {/* ── Optimization Modal ── */}
      {isOptimizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setIsOptimizeModalOpen(false); setOptimizeError(null); }}
          />
          <div className="relative bg-[#1A202C] border border-[#2F3A4A] rounded-2xl shadow-2xl w-[560px] max-w-[95vw] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2F3A4A] bg-[#1E2532]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <Sparkles size={20} className="text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-base">Request Optimization</h2>
                  <p className="text-muted text-xs">Powered by Gemini — Oracle BIP Performance Tuning</p>
                </div>
              </div>
              <button
                onClick={() => { setIsOptimizeModalOpen(false); setOptimizeError(null); }}
                className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-[#2A3441]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-yellow-200/80 text-xs leading-relaxed">
                  Leave the field below <span className="font-semibold text-yellow-300">empty</span> for fully automatic
                  optimization, or describe specific changes you want applied.
                </p>
              </div>

              <div>
                <label className="text-muted text-xs uppercase font-bold tracking-wider block mb-2">Optimization Instructions (optional)</label>
                <textarea
                  value={optimizeInstructions}
                  onChange={(e) => setOptimizeInstructions(e.target.value)}
                  rows={5}
                  placeholder={`Examples:\n\u2022 "Remove the nested subquery and flatten the joins"\n\u2022 "Add TRUNC() with CAST on CREATION_DATE comparisons"\n\u2022 "Replace OR conditions with IN() clauses"`}
                  className="w-full bg-[#111827] text-white border border-[#475569] rounded-xl p-4 text-sm font-mono focus:ring-1 focus:ring-yellow-500/50 outline-none resize-none placeholder:text-[#475569] leading-relaxed"
                />
              </div>

              {optimizeError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
                  <XCircle size={14} />
                  {optimizeError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#2F3A4A] bg-[#1E2532] flex justify-end gap-3">
              <button
                onClick={() => { setIsOptimizeModalOpen(false); setOptimizeError(null); }}
                className="px-5 py-2 text-muted border border-[#475569] rounded-lg hover:text-white hover:bg-[#2A3441] transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleOptimize}
                disabled={isOptimizing}
                className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isOptimizing ? (
                  <><Loader2 size={15} className="animate-spin" /> Optimizing...</>
                ) : (
                  <><Sparkles size={15} /> {optimizeInstructions.trim() ? 'Apply Instructions' : 'Auto-Optimize'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 bg-[#1A202C] border border-green-500/30 shadow-2xl rounded-2xl p-4 w-[380px]">
          <div className="p-2 bg-green-500/10 rounded-lg shrink-0 mt-0.5">
            <CheckCircle2 size={18} className="text-green-400" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-white font-semibold text-sm">{toast.message}</span>
            <p className="text-muted text-xs leading-relaxed mt-1 line-clamp-4">{toast.detail}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-muted hover:text-white transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}


