import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onUpload: (file: File) => void;
  onUploadMultiple?: (files: File[]) => void;
  isUploading: boolean;
}

export function UploadZone({ onUpload, onUploadMultiple, isUploading }: UploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      if (acceptedFiles.length === 1 || !onUploadMultiple) {
        onUpload(acceptedFiles[0]);
      } else {
        onUploadMultiple(acceptedFiles);
      }
    },
    [onUpload, onUploadMultiple]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/gif": [".gif"],
    },
    maxFiles: 10,
    disabled: isUploading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative group cursor-pointer flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed transition-all duration-300 ease-out",
        isDragActive
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border hover:border-primary/50 hover:bg-slate-50",
        isUploading && "opacity-50 cursor-not-allowed"
      )}
    >
      <input {...getInputProps()} />
      
      <div className="flex flex-col items-center gap-4 text-center p-6">
        <div className={cn(
          "h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300",
          isDragActive ? "bg-primary/20 text-primary" : "bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"
        )}>
          {isUploading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <UploadCloud className="h-8 w-8" />
          )}
        </div>
        
        <div className="space-y-1">
          <p className="text-lg font-semibold font-display text-foreground">
            {isUploading ? "Processing Document..." : "Upload Document"}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {isDragActive
              ? "Drop PDFs or images here"
              : "Drag & drop PDFs or images (JPEG, PNG, WebP, GIF), or click to browse"}
          </p>
        </div>
      </div>

      {/* Decorative dots grid pattern background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
        style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '16px 16px' }} 
      />
    </div>
  );
}
