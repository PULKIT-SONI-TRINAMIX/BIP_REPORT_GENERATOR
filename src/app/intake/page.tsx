'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, FileText, Minimize2, ZoomIn, ZoomOut, X, Loader2, AlertCircle, FileCheck2 } from 'lucide-react';

import { useRouter } from 'next/navigation';

export default function IntakePortal() {
  const router = useRouter();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [generationResult, setGenerationResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) await processFile(droppedFile);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) await processFile(selectedFile);
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const processFile = async (file: File) => {
    // Reset state for a fresh upload
    setIsUploading(true);
    setUploadError(null);
    setExtractedText('');
    setGenerationResult(null);
    setUploadedFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);   // key MUST be 'file' — matches multer field name

    try {
      const response = await fetch('http://localhost:3000/api/upload-requirement', {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type header — browser sets it automatically with the correct boundary
      });

      // ── Layer 1: Read backend error message if response is not OK ──────────
      if (!response.ok) {
        let backendMsg = `Server error ${response.status}`;
        try {
          const errJson = await response.json();
          backendMsg = errJson?.error || backendMsg;
        } catch {
          // response wasn't JSON — use status text
          backendMsg = `${response.status} ${response.statusText}`;
        }
        throw new Error(backendMsg);
      }

      // ── Layer 2: Parse successful response ─────────────────────────────────
      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new Error('Backend returned a non-JSON response. Check the server logs.');
      }

      // ── Layer 3: Map all fields to state ───────────────────────────────────
      setExtractedText(data.extractedText || '');
      setGenerationResult(data);
      setIsPreviewOpen(true);

      // Store the full context so the Query Studio can pick up ALL fields
      localStorage.setItem('osca_current_generation', JSON.stringify({
        requirement:              data.extractedText || '',
        sql:                      data.sql,
        explanation:              data.explanation,
        confidenceScore:          data.confidenceScore,
        tableVerificationReport:  data.tableVerificationReport  || [],
        columnVerificationReport: data.columnVerificationReport || [],
        parameters:               data.parameters               || [],
        buLookupQuery:            data.buLookupQuery            || null,
        statusLookupQuery:        data.statusLookupQuery        || null,
        testSequence:             data.testSequence             || null,
        databaseSelection:        data.databaseSelection        || null,
        sqlType:                  data.sqlType                  || null,
      }));

    } catch (error: any) {
      // ── Layer 4: Surface error in-UI (no more generic alert()) ─────────────
      const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
      const msg = isNetworkError
        ? 'Cannot reach the backend. Make sure the Node.js server is running on port 3000.'
        : error.message || 'Unknown error occurred.';
      console.error('[IntakePortal] Upload failed:', error);
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full text-sm">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-semibold text-white tracking-wide">Intake Portal</h1>
        <div className="flex items-center gap-2">
            <span className="text-muted text-xs">Confidence Score</span>
            <span className="text-green-500 text-xs font-semibold ml-1">{generationResult?.confidenceScore || 0}%</span>
            <div className="h-1.5 w-24 bg-[#1E2532] rounded-full ml-1 overflow-hidden border border-[#2F3A4A]/50">
              <div 
                className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-green-500 rounded-full transition-all duration-1000"
                style={{ width: `${generationResult?.confidenceScore || 0}%` }}
              ></div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 pb-6 relative">
        {/* Drag & Drop Zone */}
        <div 
          className="col-span-4 bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A] h-[500px] flex flex-col justify-center items-center relative overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
            accept=".pdf,.doc,.docx,.txt" 
          />
          <div 
            onClick={triggerFileInput}
            className="absolute inset-4 border-2 border-dashed border-[#475569] rounded-xl flex flex-col items-center justify-center p-8 text-center bg-[#1E2532]/20 hover:bg-[#1E2532]/40 transition-colors cursor-pointer"
          >
            {uploadedFileName && !isUploading ? (
              <div className="flex flex-col items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                  <FileCheck2 size={24} className="text-blue-400" />
                </div>
                <p className="text-white font-medium text-sm break-all px-2 text-center">{uploadedFileName}</p>
                <p className="text-muted text-xs">Drop a new file to replace</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-20 border-2 border-muted rounded flex items-center justify-center mb-6 relative">
                   <div className="absolute top-0 right-0 w-4 h-4 border-b-2 border-l-2 border-muted bg-[#2A3441]"></div>
                   <span className="text-muted font-bold text-lg">PDF</span>
                </div>
                <p className="text-muted mb-6 text-base px-4">
                  Drop files here for Parsing<br/>(PDF, Word, or text)
                </p>
                <p className="text-[#64748b] text-sm mb-12">or click to browse</p>
              </>
            )}

            
            <div className="w-full text-left mt-auto">
               <div className="mb-4">
                 <div className="flex justify-between text-xs mb-1">
                   <span className="text-white font-medium">DB Creation</span>
                 </div>
                 <div className="text-muted text-[10px] mb-1">ready</div>
                 <div className="h-1 w-full bg-[#1E2532] rounded-full overflow-hidden">
                   <div className="h-full bg-blue-500 w-[100%] rounded-full"></div>
                 </div>
               </div>
               
               <div>
                 <div className="flex justify-between text-xs mb-2">
                   <span className="text-white font-medium">Parsing Integration</span>
                 </div>
                 <div className="h-1 w-full bg-[#1E2532] rounded-full overflow-hidden">
                   <div className="h-full bg-blue-500 w-[100%] rounded-full"></div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Status & Insights Area */}
        <div className="col-span-8 flex flex-col gap-6">
          {/* Progress Section */}
          <div className="bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A]">
            <div className="flex flex-col gap-6 mb-4">
            {/* Error Banner */}
            {uploadError && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-2">
                <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-red-300 font-semibold text-sm">Upload Failed</span>
                  <p className="text-red-400/80 text-xs leading-relaxed">{uploadError}</p>
                </div>
                <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-white shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-4">

                <div className="bg-blue-500/20 p-2 rounded-full text-blue-400">
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white text-base">Document Parsing (Apache Tika / PDF-Parse)</span>
                    {generationResult && (
                      <div className="flex items-center gap-1.5 text-green-500 text-sm font-medium">
                        <CheckCircle2 size={16} /> Complete
                      </div>
                    )}
                  </div>
                  <div className="h-2 w-full bg-[#1E2532] rounded-full overflow-hidden border border-[#2F3A4A]/50">
                    <div className={`h-full bg-blue-500 ${isUploading ? 'w-[50%] animate-pulse' : generationResult ? 'w-full' : 'w-0'} rounded-full transition-all duration-1000 relative`}>
                       {isUploading && <div className="absolute top-0 right-0 h-full w-20 bg-gradient-to-r from-transparent to-white/30 animate-pulse"></div>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-blue-500/20 p-2 rounded-full text-blue-400">
                  {isUploading ? <Loader2 size={20} className="animate-spin" /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white text-base">AI Analysis (Gemini)</span>
                    {generationResult && (
                      <div className="flex items-center gap-1.5 text-green-500 text-sm font-medium">
                        <CheckCircle2 size={16} /> Complete
                      </div>
                    )}
                  </div>
                  <div className="h-2 w-full bg-[#1E2532] rounded-full overflow-hidden border border-[#2F3A4A]/50">
                    <div className={`h-full bg-blue-500 ${isUploading ? 'w-[70%] animate-pulse' : generationResult ? 'w-full' : 'w-0'} rounded-full transition-all duration-1000 relative`}>
                        {isUploading && <div className="absolute top-0 right-0 h-full w-20 bg-gradient-to-r from-transparent to-white/30 animate-pulse"></div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => router.push('/studio')}
              disabled={!generationResult}
              className={`${generationResult ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-[#1E2532] text-muted'} border border-[#2F3A4A] px-6 py-2 rounded-lg transition-colors`}
            >
              Go to Query Studio
            </button>
          </div>

          {/* Extracted Insights */}
          <div className="bg-[#2A3441] p-6 rounded-xl border border-[#2F3A4A] flex-1">
            <h2 className="text-white text-lg font-semibold mb-4">Extracted AI Context</h2>
            
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
               <div className="col-span-2">
                 <h3 className="text-muted mb-3">Model Analysis</h3>
                 <div className="flex items-center gap-3">
                    <div className="border border-[#475569] rounded-lg p-3 pt-2 bg-[#1E2532]/30 min-w-[120px]">
                       <span className="text-muted text-xs block mb-1">Status</span>
                       <span className="bg-[#2A3441] border border-[#475569] rounded px-3 py-1.5 text-white inline-block">
                         {generationResult ? 'Success' : 'Awaiting Input'}
                       </span>
                    </div>
                    <div className="border border-[#475569] rounded-lg p-3 pt-2 bg-[#1E2532]/30 flex-1 h-[80px] overflow-hidden">
                       <span className="text-muted text-xs block mb-1">Generated Explanation Preview</span>
                       <p className="text-sm text-white line-clamp-2">
                         {generationResult?.explanation || 'Upload a document to generate analysis.'}
                       </p>
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Modal Overlay / Floating Preview */}
        {isPreviewOpen && (
          <div className="absolute right-0 top-16 w-[450px] shadow-2xl z-30 mr-12 mt-10 rounded-xl overflow-hidden border border-[#475569]">
             {/* Header */}
             <div className="bg-[#2A3441] p-3 flex justify-between items-center border-b border-[#475569]">
                <h3 className="text-white font-medium">Preview Original</h3>
                <div className="flex gap-3 text-muted">
                   <Minimize2 size={16} className="cursor-pointer hover:text-white" />
                   <ZoomIn size={16} className="cursor-pointer hover:text-white" />
                   <ZoomOut size={16} className="cursor-pointer hover:text-white" />
                   <X size={18} className="cursor-pointer hover:text-white ml-2" onClick={() => setIsPreviewOpen(false)} />
                </div>
             </div>
             {/* Document Body */}
             <div className="bg-white p-6 h-[350px] overflow-y-auto">
                <p className="text-black text-sm leading-relaxed font-serif whitespace-pre-wrap">
                   {extractedText}
                </p>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
