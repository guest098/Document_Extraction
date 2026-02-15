import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { authFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export function useDocuments() {
  return useQuery({
    queryKey: [api.documents.list.path],
    queryFn: async () => {
      const res = await authFetch(api.documents.list.path);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: [api.documents.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.documents.get.path, { id });
      const res = await authFetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch document");
      return res.json();
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes to prevent re-fetching
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useDocumentFileUrl(id: string | undefined): string | null {
  if (!id) return null;
  const token = typeof window !== "undefined" ? localStorage.getItem("doc_intel_token") : null;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return token ? `${base}/api/documents/${id}/file?token=${encodeURIComponent(token)}` : null;
}

export function useDocumentStructure(id: string | undefined) {
  return useQuery({
    queryKey: ["/api/documents/", id, "structure"],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl("/api/documents/:id/structure", { id });
      const res = await authFetch(url);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const token = localStorage.getItem("doc_intel_token");
      const res = await fetch(api.documents.upload.path, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        if (res.status === 400) throw new Error("Invalid file format");
        throw new Error("Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
      toast({ title: "Upload Successful", description: "Document is being processed." });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const url = buildUrl(api.documents.delete.path, { id });
      const res = await authFetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete document");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
      toast({ title: "Document Deleted", description: "The document has been removed." });
    },
  });
}
