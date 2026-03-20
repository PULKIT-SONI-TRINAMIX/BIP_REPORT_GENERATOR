'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, ChevronDown, ChevronRight, Folder, File,
  ExternalLink, Copy, Loader2, X, Database, Table2
} from 'lucide-react';
import { fetchMetadataTables, searchMetadataTables, fetchTableColumns } from '@/lib/api';

// ── Module tag colour map ──────────────────────────────────────────────────
const MODULE_COLOURS: Record<string, string> = {
  HCM:  'bg-purple-500/15 text-purple-300 border-purple-500/30',
  SCM:  'bg-blue-500/15   text-blue-300   border-blue-500/30',
  FIN:  'bg-green-500/15  text-green-300  border-green-500/30',
  TCA:  'bg-cyan-500/15   text-cyan-300   border-cyan-500/30',
  FND:  'bg-orange-500/15 text-orange-300 border-orange-500/30',
  PRC:  'bg-pink-500/15   text-pink-300   border-pink-500/30',
  ERP:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
};
const tagClass = (tag: string) =>
  MODULE_COLOURS[tag] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30';

// ── Data-type colour helper ────────────────────────────────────────────────
const dataTypeClass = (type: string) => {
  if (!type) return 'text-muted';
  const t = type.toUpperCase();
  if (t.includes('NUMBER') || t.includes('INT')) return 'text-blue-300';
  if (t.includes('VARCHAR') || t.includes('CHAR') || t.includes('CLOB')) return 'text-green-300';
  if (t.includes('DATE') || t.includes('TIMESTAMP')) return 'text-orange-300';
  return 'text-slate-300';
};

export default function KnowledgeBase() {
  // ── Module tree state ────────────────────────────────────────────────────
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({ oracle: true });
  const [modules, setModules]             = useState<any[]>([]);
  const [treeLoading, setTreeLoading]     = useState(true);
  const [treeError, setTreeError]         = useState<string | null>(null);

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching,   setIsSearching]   = useState(false);
  const [searchError,   setSearchError]   = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Column panel state ───────────────────────────────────────────────────
  const [selectedTable,  setSelectedTable]  = useState<string | null>(null);
  const [columns,        setColumns]        = useState<any[]>([]);
  const [colLoading,     setColLoading]     = useState(false);
  const [colError,       setColError]       = useState<string | null>(null);

  // ── Load module tree on mount ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMetadataTables();
        setModules(data);
        const expansions: Record<string, boolean> = { oracle: true };
        data.forEach((mod: any) => { expansions[mod.module] = true; });
        setExpandedNodes(expansions);
      } catch (err: any) {
        setTreeError(err.message);
      } finally {
        setTreeLoading(false);
      }
    })();
  }, []);

  // ── Debounced search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        setSearchError(null);
        const results = await searchMetadataTables(searchQuery);
        setSearchResults(results);
      } catch (err: any) {
        setSearchError(err.message);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // ── Fetch columns for selected table ───────────────────────────────────
  const fetchColumns = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setColLoading(true);
    setColError(null);
    setColumns([]);
    try {
      const cols = await fetchTableColumns(tableName);
      setColumns(cols);
    } catch (err: any) {
      setColError(err.message);
    } finally {
      setColLoading(false);
    }
  }, []);

  const toggleNode = (node: string) =>
    setExpandedNodes(prev => ({ ...prev, [node]: !prev[node] }));

  const isSearchMode = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col gap-6 h-full text-sm">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-semibold text-white tracking-wide">Metadata Knowledge Base</h1>
        <div className="flex items-center gap-2">
          <span className="text-muted text-xs">Total Tables</span>
          <span className="text-blue-400 text-xs font-semibold ml-1">7,500+</span>
          <div className="h-1.5 w-24 bg-[#1E2532] rounded-full ml-1 overflow-hidden border border-[#2F3A4A]/50">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 w-full rounded-full"/>
          </div>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-160px)] min-h-[600px] pb-6">

        {/* ── Left Sidebar — Search + Tree ─────────────────────────────── */}
        <div className="w-[280px] bg-[#2A3441] rounded-xl border border-[#2F3A4A] flex flex-col shrink-0 overflow-hidden">
          {/* Search input */}
          <div className="p-4 border-b border-[#475569]/30">
            <div className="relative">
              {isSearching
                ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" size={14} />
                : <Search  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={14} />
              }
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search 7,500+ tables..."
                className="w-full bg-[#1A202C]/60 text-xs text-foreground outline-none placeholder-[#64748b] rounded-lg pl-9 pr-8 py-2 focus:ring-1 focus:ring-blue-500 border border-[#2F3A4A]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-white transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {isSearchMode && !isSearching && (
              <p className="text-[#94a3b8] text-[10px] mt-2 px-1">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
              </p>
            )}
          </div>

          {/* Content: search results OR module tree */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {/* ── Search Results ── */}
            {isSearchMode ? (
              <div className="flex flex-col gap-0.5">
                {searchError && (
                  <p className="text-red-400 text-xs p-2">{searchError}</p>
                )}
                {!isSearching && searchResults.length === 0 && !searchError && (
                  <div className="flex flex-col items-center gap-2 py-10 text-muted">
                    <Database size={24} className="opacity-30" />
                    <p className="text-xs">No tables found</p>
                  </div>
                )}
                {searchResults.map((row, i) => (
                  <button
                    key={i}
                    onClick={() => fetchColumns(row.table_name)}
                    className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors group
                      ${selectedTable === row.table_name
                        ? 'bg-blue-500/20 border border-blue-500/30'
                        : 'hover:bg-[#1A202C]/60 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <File size={13} className="text-slate-400 shrink-0" />
                      <span className="text-white text-xs font-mono truncate">{row.table_name}</span>
                    </div>
                    {row.module_tag && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${tagClass(row.module_tag)}`}>
                        {row.module_tag}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              /* ── Module Tree ── */
              <div className="flex flex-col text-sm text-muted">
                {treeError && <div className="text-red-500 text-xs p-2">{treeError}</div>}
                {treeLoading && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-blue-500" /></div>}

                {!treeLoading && !treeError && (
                  <>
                    <div
                      className="flex items-center gap-2 py-1.5 px-2 hover:bg-[#1A202C]/50 rounded cursor-pointer"
                      onClick={() => toggleNode('oracle')}
                    >
                      {expandedNodes['oracle'] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                      <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                      <span className="text-white">Oracle Modules</span>
                    </div>

                    {expandedNodes['oracle'] && modules.map((mod) => (
                      <div key={mod.module} className="flex flex-col">
                        <div
                          className="flex items-center gap-2 py-1.5 px-2 pl-6 hover:bg-[#1A202C]/50 rounded cursor-pointer"
                          onClick={() => toggleNode(mod.module)}
                        >
                          {expandedNodes[mod.module] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                          <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                          <span>{mod.module}</span>
                        </div>

                        {expandedNodes[mod.module] && (
                          <div className="flex flex-col">
                            <div
                              className="flex items-center gap-2 py-1.5 px-2 pl-10 hover:bg-[#1A202C]/50 rounded cursor-pointer"
                              onClick={() => toggleNode(`${mod.module}-tables`)}
                            >
                              {expandedNodes[`${mod.module}-tables`] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                              <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                              <span className={expandedNodes[`${mod.module}-tables`] ? 'text-white' : ''}>Tables</span>
                            </div>

                            {expandedNodes[`${mod.module}-tables`] && (
                              <div className="flex flex-col pl-14 mt-1 border-l border-[#475569]/30 ml-[46px]">
                                {mod.tables.map((table: string) => (
                                  <button
                                    key={table}
                                    onClick={() => fetchColumns(table)}
                                    className={`flex items-center gap-2 py-1.5 px-2 hover:bg-[#1A202C]/50 rounded cursor-pointer relative text-left w-full
                                      ${selectedTable === table ? 'bg-blue-500/10 text-blue-300' : ''}`}
                                  >
                                    <div className="absolute left-[-1px] top-1/2 w-2 border-b border-[#475569]/30"></div>
                                    <File size={14} className="text-slate-400 shrink-0" />
                                    <span className="text-xs font-mono truncate">{table}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Center — Column Metadata Panel ───────────────────────────── */}
        <div className="flex-1 bg-[#2A3441] rounded-xl border border-[#2F3A4A] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#475569]/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Table2 size={18} className="text-blue-400" />
              <h2 className="text-white text-base font-semibold">
                {selectedTable ? (
                  <span className="font-mono">{selectedTable}</span>
                ) : (
                  'Column Metadata'
                )}
              </h2>
              {selectedTable && columns.length > 0 && (
                <span className="text-muted text-xs">({columns.length} columns)</span>
              )}
            </div>
            {selectedTable && (
              <button
                onClick={() => navigator.clipboard.writeText(selectedTable)}
                className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-xs border border-[#475569] bg-[#1E2532] px-2.5 py-1.5 rounded-lg"
              >
                <Copy size={12} /> Copy Name
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            {/* Empty state */}
            {!selectedTable && !colLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted">
                <div className="p-5 rounded-full bg-[#1E2532] border border-[#2F3A4A]">
                  <Search size={28} className="opacity-40" />
                </div>
                <p className="text-sm">Search a table or select one from the tree to view its columns</p>
              </div>
            )}

            {/* Loading */}
            {colLoading && (
              <div className="flex items-center justify-center h-full gap-3">
                <Loader2 size={22} className="animate-spin text-blue-500" />
                <span className="text-muted text-sm">Loading columns for <span className="text-blue-300 font-mono">{selectedTable}</span>…</span>
              </div>
            )}

            {/* Error */}
            {colError && !colLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted">
                <p className="text-red-400 text-xs">{colError}</p>
                <p className="text-xs">The table may not have columns loaded in the database yet.</p>
              </div>
            )}

            {/* Empty result */}
            {!colLoading && !colError && selectedTable && columns.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted">
                <Database size={24} className="opacity-30" />
                <p className="text-xs">No columns found for <span className="font-mono text-white">{selectedTable}</span></p>
                <p className="text-[10px]">Columns may not have been loaded yet.</p>
              </div>
            )}

            {/* Column table */}
            {!colLoading && !colError && columns.length > 0 && (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#2A3441] z-10 shadow-sm">
                  <tr className="border-b border-[#475569]/50 text-muted">
                    <th className="font-medium p-4 py-3 w-[40%]">Column Name</th>
                    <th className="font-medium p-4 py-3 w-[20%]">Data Type</th>
                    <th className="font-medium p-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="text-[#e2e8f0]">
                  {columns.map((col, i) => (
                    <tr key={i} className="border-b border-[#475569]/20 hover:bg-[#1A202C]/40 transition-colors group">
                      <td className="p-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigator.clipboard.writeText(col.column_name)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy column name"
                          >
                            <Copy size={11} className="text-muted hover:text-white" />
                          </button>
                          <span className="font-mono text-xs text-blue-200">{col.column_name}</span>
                        </div>
                      </td>
                      <td className="p-4 py-3">
                        <span className={`font-mono text-xs ${dataTypeClass(col.data_type)}`}>
                          {col.data_type || '—'}
                        </span>
                      </td>
                      <td className="p-4 py-3 text-muted text-xs leading-relaxed">
                        {col.description || <span className="italic opacity-40">No description</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Right Sidebar — Relationships (static visual) ─────────────── */}
        <div className="w-[300px] bg-[#2A3441] rounded-xl border border-[#2F3A4A] flex flex-col shrink-0 overflow-hidden">
          <div className="p-4 border-b border-[#475569]/30 flex items-center justify-between">
            <h2 className="text-white text-base font-semibold">Relationships</h2>
            <button className="flex items-center gap-1.5 bg-[#1E2532] border border-[#475569] px-3 py-1.5 rounded-md text-xs text-muted hover:text-white transition-colors">
              <ExternalLink size={12} /> Foreign Keys
            </button>
          </div>

          <div className="flex-1 overflow-hidden relative bg-[#1E2532]/50 p-4">
            <div className="w-full h-full relative flex flex-col items-center pt-8">
              <div className="border border-blue-400 bg-[#2A3441] text-xs text-blue-300 px-3 py-1.5 rounded z-10 w-40 text-center shadow-lg">
                {selectedTable ?? 'PER_ALL_PEOPLE_F'}
                <div className="text-[9px] text-muted mt-0.5 font-mono">Primary Key</div>
              </div>
              <div className="w-px h-10 bg-blue-500/50 mt-1"/>
              <div className="text-[9px] text-[#94a3b8] -mt-1 mb-1">Foreign Key</div>
              <div className="flex justify-center items-center w-full gap-6 mt-2 relative z-10">
                <div className="border border-[#475569] bg-[#2A3441] text-xs text-white px-3 py-1.5 rounded w-24 text-center">
                  HZ_PARTIES
                  <div className="text-[9px] text-muted mt-0.5">PARTY_ID</div>
                </div>
                <div className="border-2 border-blue-400 bg-[#2f3b4d] text-xs text-white px-3 py-1.5 rounded w-28 text-center shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                  {selectedTable ?? 'PER_JOBS_F'}
                  <div className="text-[9px] text-blue-300 mt-0.5 font-mono">Selected</div>
                </div>
                <div className="border border-[#475569] bg-[#2A3441] text-xs text-white px-3 py-1.5 rounded w-24 text-center">
                  FND_LOOKUP
                  <div className="text-[9px] text-muted mt-0.5">LOOKUP_CODE</div>
                </div>
              </div>
              <div className="w-px h-8 bg-blue-500/50 mt-4"/>
              <div className="text-[9px] text-[#94a3b8]">Foreign Key</div>
              <div className="border border-[#475569] bg-[#2A3441] text-xs text-white px-3 py-1.5 rounded mt-1 z-10 w-40 text-center">
                PER_ASSIGNMENTS_M
                <div className="text-[9px] text-muted mt-0.5 font-mono">PERSON_ID</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
