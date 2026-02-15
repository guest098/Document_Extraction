import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useDocument } from "@/hooks/use-documents";
import { useChatHistory, useSendMessage } from "@/hooks/use-chat";
import { useRiskAnalysis, useReviewClause } from "@/hooks/use-analysis";
import { useDocumentStructure } from "@/hooks/use-documents";
import { useState, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskGauge } from "@/components/RiskGauge";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  Send,
  Bot,
  User,
  AlertTriangle,
  CheckCircle,
  ZoomIn,
  ZoomOut,
  FileText,
  Download,
  BoxSelect,
  Gavel,
  FileSignature,
  Link2,
  Check,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { getToken, authFetch } from "@/lib/api";
import { buildUrl } from "@shared/routes";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ============================================================================
// TYPES
// ============================================================================

type BboxRole = "field" | "section" | "entity" | "header";

type BboxItem = {
  label: string;
  sublabel?: string;
  role: BboxRole;
  boundingBox: { x: number; y: number; width: number; height: number };
  pageNumber: number;
};

type ExtractedClause = {
  id: string;
  title: string;
  content: string;
  pageNumber: number;
  clauseType?: string;
  confidenceScore: number;
  reviewed?: boolean;
};

type Signature = {
  id: string;
  role: string;
  name?: string;
  title?: string;
  company?: string;
  date?: string;
  pageNumber: number;
  confidenceScore: number;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function buildBboxItems(structure: { extractedFields?: any[]; sections?: any[]; entities?: any[] } | null): BboxItem[] {
  if (!structure) return [];
  const items: BboxItem[] = [];
  for (const f of structure.extractedFields ?? []) {
    if (f.boundingBox) items.push({ label: f.fieldName, sublabel: String(f.value ?? ""), role: "field", boundingBox: f.boundingBox, pageNumber: f.pageNumber ?? 1 });
  }
  for (const s of structure.sections ?? []) {
    if (s.boundingBox) {
      const title = (s.title ?? "").toLowerCase();
      const role: BboxRole = /header|title|licen[sc]e|identification/.test(title) ? "header" : "section";
      items.push({ label: s.title, sublabel: (s.content ?? "").slice(0, 80), role, boundingBox: s.boundingBox, pageNumber: s.pageNumber ?? 1 });
    }
  }
  for (const e of structure.entities ?? []) {
    if (e.boundingBox) items.push({ label: e.type, sublabel: e.value, role: "entity", boundingBox: e.boundingBox, pageNumber: e.pageNumber ?? 1 });
  }
  return items;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DocumentView() {
  const params = useParams();
  const id = params.id || "";
  const [activeTab, setActiveTab] = useState("analysis");
  const { data: document, isLoading: isDocLoading } = useDocument(id);
  const { data: structure, isLoading: isStructureLoading } = useDocumentStructure(id);

  // Memoize token to prevent unnecessary re-renders
  const token = useMemo(() => getToken(), []);

  // Memoize fileUrl to prevent unnecessary re-renders
  const fileUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/documents/${id}/file`;
  }, [id]);

  if (isDocLoading) return <ViewSkeleton />;
  if (!document) return <div className="p-10 text-center">Document not found</div>;

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 mb-4 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/documents">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="h-5 w-5 text-slate-500" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">{document.documentName}</h1>
            <p className="text-sm text-slate-500">Version {document.version} • {document.status}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <a href={token ? `${fileUrl}?token=${encodeURIComponent(token)}` : "#"} download={document.originalName}>
            <Button variant="outline" size="sm" disabled={!token}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </a>
          <ExportButtons documentId={id} documentName={document.documentName} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 min-h-0 px-6 pb-6 overflow-hidden">
        <div className="w-1/2 bg-slate-200/50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col flex-shrink-0">
          {isStructureLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Skeleton className="w-full h-full rounded-2xl" />
            </div>
          ) : (
            <DocumentPreview documentId={id} document={document} structure={structure} fileUrl={fileUrl} token={token ?? ""} />
          )}
        </div>

        {/* Right Panel */}
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-shrink-0 border-b border-slate-100 px-6 py-1">
              <TabsList className="bg-slate-100/50 p-0 rounded-xl w-full justify-start overflow-x-auto gap-1">
                <TabsTrigger value="analysis" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex-shrink-0 px-3 py-1.5">Analysis</TabsTrigger>
                <TabsTrigger value="clauses" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex-shrink-0 px-3 py-1.5">Clauses</TabsTrigger>
                <TabsTrigger value="chat" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex-shrink-0 px-3 py-1.5">AI Chat</TabsTrigger>
                <TabsTrigger value="tables" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex-shrink-0 px-3 py-1.5">Tables</TabsTrigger>
                <TabsTrigger value="signatures" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex-shrink-0 px-3 py-1.5">Signatures</TabsTrigger>
                <TabsTrigger value="review" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex-shrink-0 px-3 py-1.5">Review</TabsTrigger>
                <TabsTrigger value="json" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex-shrink-0 px-3 py-1.5">JSON</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="analysis" className="flex-1 min-h-0 overflow-hidden p-0 m-0 pt-0 flex flex-col data-[state=inactive]:hidden">
              <AnalysisPanel documentId={id} summary={document.summary} riskScore={document.riskScore} />
            </TabsContent>

            <TabsContent value="clauses" className="flex-1 min-h-0 overflow-hidden p-0 m-0 pt-0 flex flex-col data-[state=inactive]:hidden">
              <ClausesPanel documentId={id} />
            </TabsContent>

            <TabsContent value="chat" className="flex-1 min-h-0 overflow-hidden p-0 m-0 pt-0 flex flex-col data-[state=inactive]:hidden">
              <ChatPanel documentId={id} />
            </TabsContent>

            <TabsContent value="tables" className="flex-1 min-h-0 overflow-hidden p-0 m-0 pt-0 flex flex-col data-[state=inactive]:hidden">
              <TablesPanel documentId={id} />
            </TabsContent>

            <TabsContent value="signatures" className="flex-1 min-h-0 overflow-hidden p-0 m-0 pt-0 flex flex-col data-[state=inactive]:hidden">
              <SignaturesPanel documentId={id} />
            </TabsContent>

            <TabsContent value="review" className="flex-1 min-h-0 overflow-hidden p-0 m-0 pt-0 flex flex-col data-[state=inactive]:hidden">
              <ReviewPanel documentId={id} />
            </TabsContent>

            <TabsContent value="json" className="flex-1 min-h-0 overflow-hidden p-0 m-0 pt-0 flex flex-col data-[state=inactive]:hidden">
              <StructurePanel documentId={id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const ROLE_STYLES: Record<BboxRole, { border: string; bg: string; badge: string }> = {
  field: { border: "border-primary", bg: "bg-primary/10", badge: "bg-primary/20 text-primary" },
  section: { border: "border-emerald-500", bg: "bg-emerald-500/10", badge: "bg-emerald-500/20 text-emerald-700" },
  header: { border: "border-amber-500", bg: "bg-amber-500/10", badge: "bg-amber-500/20 text-amber-700" },
  entity: { border: "border-violet-500", bg: "bg-violet-500/10", badge: "bg-violet-500/20 text-violet-700" },
};

function BoundingBoxOverlay({ items, pageNumber, className, pageWidth, pageHeight }: { items: BboxItem[]; pageNumber: number; className?: string; pageWidth?: number; pageHeight?: number }) {
  const onPage = items.filter((i) => i.pageNumber === pageNumber);
  if (onPage.length === 0) return null;
  
  // Default PDF page dimensions (will be updated by PDF viewer)
  const width = pageWidth || 600;
  const height = pageHeight || 800;
  
  return (
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      {onPage.map((item, i) => {
        const style = ROLE_STYLES[item.role] ?? ROLE_STYLES.field;
        const roleLabel = item.role.charAt(0).toUpperCase() + item.role.slice(1);
        // Convert normalized 0-1 coordinates to actual pixel positions
        // Note: PDF coordinates have origin at bottom-left, we need top-left
        const left = item.boundingBox.x * 100;
        const top = (1 - item.boundingBox.y - item.boundingBox.height) * 100;
        const boxWidth = item.boundingBox.width * 100;
        const boxHeight = item.boundingBox.height * 100;
        
        return (
          <div
            key={i}
            className={cn("absolute border-2 rounded pointer-events-auto hover:z-10 transition-colors", style.border, style.bg)}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${boxWidth}%`,
              height: `${boxHeight}%`,
            }}
            title={`${roleLabel}: ${[item.label, item.sublabel].filter(Boolean).join(" — ")}`}
          >
            <span className="absolute -top-6 left-0 flex items-center gap-1.5 text-[10px] bg-white/95 rounded shadow px-1.5 py-0.5 max-w-[220px] truncate whitespace-nowrap">
              <span className={cn("uppercase tracking-wide font-semibold flex-shrink-0", style.badge, "px-1 rounded")}>{roleLabel}</span>
              <span className="font-medium text-slate-800 truncate">
                {item.label}
                {item.sublabel ? `: ${item.sublabel}` : ""}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DocumentPreview({ documentId, document, structure, fileUrl, token }: { documentId: string; document: any; structure: any; fileUrl: string; token: string }) {
  const [showBoxes, setShowBoxes] = useState(true);
  const isImage = document.mimeType?.startsWith("image/");
  const bboxItems = buildBboxItems(structure);
  const hasBoxes = bboxItems.length > 0;

  if (isImage) {
    return (
      <ImageViewer
        documentId={documentId}
        fileUrl={fileUrl}
        token={token}
        bboxItems={bboxItems}
        showBoxes={showBoxes}
        onToggleBoxes={() => setShowBoxes((b) => !b)}
        hasBoxes={hasBoxes}
      />
    );
  }
  return (
    <PdfViewer
      documentId={documentId}
      bboxItems={bboxItems}
      showBoxes={showBoxes}
      onToggleBoxes={() => setShowBoxes((b) => !b)}
      hasBoxes={hasBoxes}
      token={token}
    />
  );
}

function ImageViewer({ fileUrl, token, bboxItems, showBoxes, onToggleBoxes, hasBoxes }: any) {
  // Memoize the image source to prevent unnecessary re-renders
  const src = useMemo(() => {
    return token ? `${fileUrl}?token=${encodeURIComponent(token)}` : "";
  }, [fileUrl, token]);
  
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between z-10">
        <span className="text-xs font-medium text-slate-500">Image</span>
        {hasBoxes && (
          <Button variant="ghost" size="sm" className="gap-1" onClick={onToggleBoxes}>
            <BoxSelect className="h-4 w-4" />
            {showBoxes ? "Hide" : "Show"} explanations
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center min-h-0">
        <div className="relative inline-block max-w-full">
          <img src={src} alt="Document" className="max-w-full h-auto block rounded-lg shadow" />
          {showBoxes && hasBoxes && (
            <BoundingBoxOverlay items={bboxItems} pageNumber={1} className="rounded-lg" />
          )}
        </div>
      </div>
    </div>
  );
}

function PdfViewer({ documentId, bboxItems, showBoxes, onToggleBoxes, hasBoxes, token }: any) {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState(1.0);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Memoize the file source to prevent unnecessary re-renders
  const fileSrc = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = window.location.origin;
    return token ? `${base}/api/documents/${documentId}/file?token=${encodeURIComponent(token)}` : `${base}/api/documents/${documentId}/file`;
  }, [documentId, token]);

  const handlePageLoad = (page: { getViewport: (options: { scale: number }) => { width: number; height: number } }, pageNumber: number) => {
    const viewport = page.getViewport({ scale: 1 });
    setPageDimensions(prev => ({ ...prev, [pageNumber]: { width: viewport.width, height: viewport.height } }));
  };

  const handleLoadSuccess = ({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setIsLoading(false);
    setPdfError(null);
  };

  const handleLoadError = (error: Error) => {
    console.error("PDF load error:", error);
    setPdfError(error.message || "Failed to load PDF");
    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between z-10">
        <span className="text-xs font-medium text-slate-500">{numPages} Pages</span>
        <div className="flex items-center gap-2">
          {hasBoxes && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={onToggleBoxes}>
              <BoxSelect className="h-4 w-4" />
              {showBoxes ? "Hide" : "Show"} explanations
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.min(2, s + 0.1))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center">
        {pdfError ? (
          <div className="flex flex-col items-center justify-center text-slate-500 p-8">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">Failed to load PDF</p>
            <p className="text-xs text-slate-400 mt-1">{pdfError}</p>
          </div>
        ) : (
          <Document
            file={fileSrc}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
            loading={null}
            className="max-w-full"
          >
            {isLoading ? (
              <Skeleton className="w-[600px] h-[800px] rounded-lg" />
            ) : (
              Array.from(new Array(numPages), (_, index) => (
                <div key={`page_${index + 1}`} className="relative inline-block mb-4" style={{ position: 'relative' }}>
                  <Page
                    pageNumber={index + 1}
                    scale={scale}
                    onLoadSuccess={(page) => handlePageLoad(page, index + 1)}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={<Skeleton className="w-[600px] h-[800px] rounded-lg mb-4" />}
                  />
                  {showBoxes && hasBoxes && pageDimensions[index + 1] && (
                    <BoundingBoxOverlay 
                      items={bboxItems} 
                      pageNumber={index + 1} 
                      pageWidth={pageDimensions[index + 1].width}
                      pageHeight={pageDimensions[index + 1].height}
                    />
                  )}
                </div>
              ))
            )}
          </Document>
        )}
      </div>
    </div>
  );
}

function AnalysisPanel({ documentId, summary, riskScore }: { documentId: string; summary?: string; riskScore?: number }) {
  const { data: riskData, isLoading } = useRiskAnalysis(documentId);

  if (isLoading) return <div className="px-6 pt-4 pb-6"><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 pt-4 pb-6 space-y-6">
        <div className="text-center">
          <RiskGauge score={riskScore ?? riskData?.riskScore ?? 0} />
          <p className="text-sm text-slate-500 mt-[-1rem]">Overall Risk Assessment</p>
        </div>
        <Separator />
        <div>
          <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Executive Summary
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
            {summary || "Processing..."}
          </p>
        </div>
        <Separator />
        <div>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Detected Risks
          </h3>
          <div className="space-y-3">
            {riskData?.riskFactors?.map((factor: any, i: number) => (
              <div key={i} className="flex gap-3 items-start p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className={cn("h-2 w-2 mt-2 rounded-full flex-shrink-0", factor.severity === "high" ? "bg-red-500" : factor.severity === "medium" ? "bg-orange-500" : "bg-green-500")} />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-slate-900">{factor.category}</span>
                    <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border", factor.severity === "high" ? "bg-red-50 text-red-600 border-red-100" : factor.severity === "medium" ? "bg-orange-50 text-orange-600 border-orange-100" : "bg-green-50 text-green-600 border-green-100")}>
                      {factor.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{factor.description}</p>
                </div>
              </div>
            ))}
            {(!riskData?.riskFactors || riskData.riskFactors.length === 0) && (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <CheckCircle className="h-8 w-8 mb-2 text-green-500/50" />
                <p className="text-sm">No significant risks detected.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CLAUSES PANEL (NEW)
// ============================================================================

function ClausesPanel({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const { data: structure, isLoading } = useDocumentStructure(documentId);
  const { mutate: reviewClause, isPending } = useReviewClause(documentId);

  const clauses = structure?.clauses || [];
  const [expandedClause, setExpandedClause] = useState<string | null>(null);

  const handleReview = async (clauseId: string, approved: boolean) => {
    reviewClause({ clauseId, approved }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/documents/", documentId, "structure"] });
      }
    });
  };

  if (isLoading) return <div className="px-6 pt-4 pb-6"><Skeleton className="h-40 w-full" /></div>;

  const clauseTypeColors: Record<string, string> = {
    definition: "bg-blue-100 text-blue-700",
    obligation: "bg-purple-100 text-purple-700",
    restriction: "bg-red-100 text-red-700",
    right: "bg-green-100 text-green-700",
    termination: "bg-orange-100 text-orange-700",
    payment: "bg-emerald-100 text-emerald-700",
    liability: "bg-red-100 text-red-700",
    confidentiality: "bg-indigo-100 text-indigo-700",
    dispute: "bg-yellow-100 text-yellow-700",
    general: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 pt-4 pb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Gavel className="h-4 w-4" />
              Detected Clauses
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {clauses.length} clause(s) identified with semantic classification
            </p>
          </div>
        </div>

        {clauses.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            No clauses detected yet. The document may not be a contract or agreement.
          </p>
        ) : (
          <div className="space-y-3">
            {clauses.map((clause: ExtractedClause) => (
              <div key={clause.id} className="rounded-xl border border-slate-200 overflow-hidden">
                <div 
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedClause(expandedClause === clause.id ? null : clause.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{clause.title || "Untitled Clause"}</span>
                        {clause.clauseType && (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full", clauseTypeColors[clause.clauseType] || clauseTypeColors.general)}>
                            {clause.clauseType}
                          </span>
                        )}
                        {clause.reviewed && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="h-3 w-3" /> Approved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>Page {clause.pageNumber}</span>
                        <span>Confidence: {Math.round(clause.confidenceScore * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {expandedClause === clause.id && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{clause.content}</p>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        size="sm" 
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleReview(clause.id, true)}
                      >
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleReview(clause.id, false)}
                      >
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SIGNATURES PANEL (NEW)
// ============================================================================

function SignaturesPanel({ documentId }: { documentId: string }) {
  const { data: structure, isLoading } = useDocumentStructure(documentId);
  const signatures = structure?.signatures || [];

  if (isLoading) return <div className="px-6 pt-4 pb-6"><Skeleton className="h-40 w-full" /></div>;

  const roleLabels: Record<string, string> = {
    signatory: "Signatory",
    witness: "Witness",
    notary: "Notary",
    authorized_representative: "Authorized Representative",
  };

  const roleColors: Record<string, string> = {
    signatory: "bg-blue-100 text-blue-700",
    witness: "bg-purple-100 text-purple-700",
    notary: "bg-amber-100 text-amber-700",
    authorized_representative: "bg-green-100 text-green-700",
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 pt-4 pb-6 space-y-4">
        <div>
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Signature Blocks
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {signatures.length} signature block(s) detected
          </p>
        </div>

        {signatures.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            No signature blocks detected. This document may not require signatures.
          </p>
        ) : (
          <div className="space-y-3">
            {signatures.map((sig: Signature) => (
              <div key={sig.id} className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{sig.name || "Unknown"}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", roleColors[sig.role] || "bg-slate-100")}>
                        {roleLabels[sig.role] || sig.role}
                      </span>
                    </div>
                    {sig.title && <p className="text-sm text-slate-600 mt-1">{sig.title}</p>}
                    {sig.company && <p className="text-xs text-slate-500 mt-0.5">{sig.company}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span>Page {sig.pageNumber}</span>
                      <span>Confidence: {Math.round(sig.confidenceScore * 100)}%</span>
                      {sig.date && <span>Date: {sig.date}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TABLES PANEL
// ============================================================================

function TablesPanel({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const { data: structure, isLoading } = useDocumentStructure(documentId);
  const [reprocessing, setReprocessing] = useState(false);
  const reprocess = async () => {
    setReprocessing(true);
    try {
      const res = await authFetch(buildUrl("/api/documents/:id/reprocess", { id: documentId }), { method: "POST" });
      if (res.ok) {
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/documents/", documentId, "structure"] }), 2000);
      }
    } finally {
      setReprocessing(false);
    }
  };
  if (isLoading) return <div className="px-6 pt-4 pb-6"><Skeleton className="h-40 w-full" /></div>;
  const tables = structure?.tables ?? [];
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 pt-4 pb-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Detected Tables</h3>
          {(tables.length === 0 || !structure) && (
            <Button variant="outline" size="sm" disabled={reprocessing} onClick={reprocess}>
              {reprocessing ? "Processing…" : "Re-extract tables"}
            </Button>
          )}
        </div>
        {tables.length === 0 ? (
          <p className="text-sm text-slate-500">No tables detected.</p>
        ) : (
          tables.map((t: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 overflow-hidden">
              <p className="text-xs text-slate-500 px-4 py-2 bg-slate-50 border-b">Page {t.pageNumber ?? i + 1}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      {(t.headers ?? []).map((h: string, j: number) => (
                        <th key={j} className="px-4 py-2 text-left font-medium text-slate-700">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(t.rows ?? []).map((row: any, ri: number) => (
                      <tr key={ri} className="hover:bg-slate-50">
                        {(row.cells ?? []).map((cell: string, ci: number) => (
                          <td key={ci} className="px-4 py-2 text-slate-600">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// REVIEW PANEL
// ============================================================================

function ReviewPanel({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const { data: structure, isLoading } = useDocumentStructure(documentId);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [reprocessing, setReprocessing] = useState(false);
  const reprocess = async () => {
    setReprocessing(true);
    try {
      const res = await authFetch(buildUrl("/api/documents/:id/reprocess", { id: documentId }), { method: "POST" });
      if (res.ok) {
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/documents/", documentId, "structure"] }), 2000);
      }
    } finally {
      setReprocessing(false);
    }
  };

  const saveField = async (fieldName: string, overrideValue: string, approved: boolean) => {
    const res = await authFetch(buildUrl("/api/documents/:id/review/field", { id: documentId }), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldName, overrideValue: overrideValue || undefined, approved }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["/api/documents/", documentId, "structure"] });
      setOverrides((o) => ({ ...o, [fieldName]: "" }));
    }
  };

  if (isLoading) return <div className="px-6 py-2"><Skeleton className="h-40 w-full" /></div>;
  const fields = structure?.extractedFields || [];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 pt-4 pb-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-slate-600">Review and override extracted fields.</p>
          {fields.length === 0 && (
            <Button variant="outline" size="sm" disabled={reprocessing} onClick={reprocess}>
              {reprocessing ? "Processing…" : "Re-extract fields"}
            </Button>
          )}
        </div>
        {fields.map((f: any) => (
          <div key={f.fieldName} className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="font-medium text-slate-900">{f.fieldName}</span>
                <span className="text-xs text-slate-400 ml-2">Page {f.pageNumber} • {(f.confidenceScore * 100).toFixed(0)}% confidence</span>
              </div>
              {f.reviewed && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Approved</span>}
            </div>
            <p className="text-sm text-slate-600 mt-1">Current: {String(f.value)}</p>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Override value"
                className="flex-1"
                value={overrides[f.fieldName] ?? ""}
                onChange={(e) => setOverrides((o) => ({ ...o, [f.fieldName]: e.target.value }))}
              />
              <Button size="sm" onClick={() => saveField(f.fieldName, overrides[f.fieldName] ?? String(f.value), true)}>
                Save & Approve
              </Button>
            </div>
          </div>
        ))}
        {fields.length === 0 && <p className="text-slate-500 text-center py-8">No extracted fields yet.</p>}
      </div>
    </div>
  );
}

// ============================================================================
// CHAT PANEL
// ============================================================================

interface ChatMessage {
  _id: string;
  question: string;
  answer: string;
  citations?: { pageNumber: number; text: string }[];
  confidence?: number;
}

function ChatPanel({ documentId }: { documentId: string }) {
  const { data: history } = useChatHistory(documentId);
  const { mutate: send, isPending } = useSendMessage(documentId);
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    send(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/30">
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 pb-4 p-4">
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-slate-700 max-w-[85%]">
              <p>Ask anything about this document. Answers are grounded in the document with page references.</p>
            </div>
          </div>

          {(history as ChatMessage[] | undefined)?.map((msg) => (
            <div key={msg._id}>
              <div className={cn("flex gap-3 flex-row-reverse")}>
                <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="rounded-2xl p-3 shadow-sm text-sm max-w-[85%] bg-primary text-primary-foreground rounded-tr-none">
                  <p>{msg.question}</p>
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-slate-700 max-w-[85%]">
                  <p>{msg.answer}</p>
                  {msg.citations?.length ? (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                      Sources: {msg.citations.map((c) => `Page ${c.pageNumber}`).join(", ")}
                    </div>
                  ) : null}
                  {msg.confidence != null && (
                    <div className="text-xs text-slate-400 mt-1">Confidence: {Math.round((msg.confidence ?? 0) * 100)}%</div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3 shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex-shrink-0 p-4 bg-white border-t border-slate-200">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this document..."
            className="flex-1"
          />
          <Button type="submit" disabled={isPending || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// STRUCTURE/JSON PANEL
// ============================================================================

function StructurePanel({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const { data: structure, isLoading } = useDocumentStructure(documentId);
  const [reprocessing, setReprocessing] = useState(false);
  const reprocess = async () => {
    setReprocessing(true);
    try {
      const res = await authFetch(buildUrl("/api/documents/:id/reprocess", { id: documentId }), { method: "POST" });
      if (res.ok) {
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/documents/", documentId, "structure"] }), 2000);
      }
    } finally {
      setReprocessing(false);
    }
  };
  if (isLoading) return <div className="px-6 pt-4 pb-6"><Skeleton className="h-40 w-full" /></div>;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 pt-4 pb-6">
        {!structure && (
          <div className="mb-4 flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={reprocessing} onClick={reprocess}>
              {reprocessing ? "Processing…" : "Re-extract structure"}
            </Button>
          </div>
        )}
        <pre className="text-xs bg-slate-50 overflow-auto whitespace-pre-wrap font-mono p-4 rounded-lg">
          {structure ? JSON.stringify(structure, null, 2) : "No structure yet."}
        </pre>
      </div>
    </div>
  );
}

// ============================================================================
// EXPORT BUTTONS
// ============================================================================

function ExportButtons({ documentId, documentName }: { documentId: string; documentName: string }) {
  const handleExport = async (format: "json" | "csv") => {
    const url = buildUrl(format === "json" ? "/api/documents/:id/export/json" : "/api/documents/:id/export/csv", { id: documentId });
    const res = await authFetch(url);
    if (!res.ok) return;
    const data = format === "json"
      ? JSON.stringify(await res.json(), null, 2)
      : await res.text();
    const href = URL.createObjectURL(new Blob([data], { type: format === "json" ? "application/json" : "text/csv" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = `${documentName}_export.${format}`;
    a.click();
    URL.revokeObjectURL(href);
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleExport("json")}>Export JSON</Button>
      <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>Export CSV</Button>
    </>
  );
}

// ============================================================================
// SKELETON
// ============================================================================

function ViewSkeleton() {
  return (
    <div className="h-[calc(100vh-6rem)] grid grid-cols-2 gap-6 p-6">
      <Skeleton className="rounded-2xl h-full" />
      <Skeleton className="rounded-2xl h-full" />
    </div>
  );
}
