import { useState } from "react";
import { useDocuments, useUploadDocument, useDeleteDocument } from "@/hooks/use-documents";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Search, Plus, Trash2, FileText, MoreHorizontal } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { RiskBadge } from "@/components/RiskBadge";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsPage() {
  const { data: documents, isLoading } = useDocuments();
  const { mutateAsync: uploadSingle, isPending: isSingleUploading } = useUploadDocument();
  const { mutate: deleteDoc } = useDeleteDocument();
  const [search, setSearch] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const filteredDocs = documents?.filter((doc: any) => 
    (doc.documentName ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const buildFormData = (file: File, metadata?: { documentType?: string; category?: string; version?: string }) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentName", file.name);
    formData.append("documentType", metadata?.documentType || "contract");
    if (metadata?.category) formData.append("category", metadata.category);
    if (metadata?.version) formData.append("version", metadata.version);
    return formData;
  };

  const handleUpload = (file: File, metadata?: { documentType?: string; category?: string; version?: string }) => {
    uploadSingle(buildFormData(file, metadata)).then(() => setIsUploadOpen(false)).catch(() => {});
  };

  const handleUploadMultiple = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadProgress({ current: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      await uploadSingle(buildFormData(files[i]));
    }
    setUploadProgress(null);
    setIsUploadOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-slate-900">Documents</h1>
          <p className="text-slate-500 mt-1">Manage and analyze your uploaded files.</p>
        </div>
        
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Upload New Document</DialogTitle>
            </DialogHeader>
            <div className="py-6">
              <UploadZone
                onUpload={handleUpload}
                onUploadMultiple={handleUploadMultiple}
                isUploading={!!uploadProgress || isSingleUploading}
              />
              {uploadProgress && (
                <p className="text-center text-sm text-slate-500 mt-3">
                  Uploading {uploadProgress.current} of {uploadProgress.total}...
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search documents..." 
            className="pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Can add filters here later */}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc) => (
            <div 
              key={doc._id}
              className="group relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-red-600 focus:text-red-700"
                        onClick={() => deleteDoc(doc._id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Link href={`/documents/${doc._id}`}>
                  <div className="cursor-pointer space-y-2">
                    <h3 className="font-bold text-lg text-slate-900 line-clamp-1 group-hover:text-primary transition-colors">
                      {doc.documentName}
                    </h3>
                    <p className="text-sm text-slate-500 line-clamp-2">
                      {doc.summary || "No summary available yet. Click to view analysis."}
                    </p>
                  </div>
                </Link>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex items-center justify-between">
                <RiskBadge score={doc.riskScore || 0} size="sm" />
                <span className="text-xs font-medium text-slate-400">
                  {doc.uploadDate && format(new Date(doc.uploadDate), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          ))}
          
          {filteredDocs.length === 0 && !isLoading && (
            <div className="col-span-full py-20 text-center">
              <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <FileText className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No documents found</h3>
              <p className="text-slate-500 mt-1">Try adjusting your search or upload a new one.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
