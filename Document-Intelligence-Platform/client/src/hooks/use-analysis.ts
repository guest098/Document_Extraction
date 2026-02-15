import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { authFetch } from "@/lib/api";

// ============================================================================
// RISK ANALYSIS
// ============================================================================

export function useRiskAnalysis(documentId: string | undefined) {
  return useQuery({
    queryKey: [api.risk.list.path, documentId],
    queryFn: async () => {
      if (!documentId) return null;
      const url = buildUrl(api.risk.list.path, { id: documentId });
      const res = await authFetch(url);
      if (!res.ok) throw new Error("Failed to fetch risk analysis");
      return res.json();
    },
    enabled: !!documentId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useRiskFlags() {
  return useQuery({
    queryKey: [api.risk.flags.path],
    queryFn: async () => {
      const res = await authFetch(api.risk.flags.path);
      if (!res.ok) throw new Error("Failed to fetch risk flags");
      return res.json();
    },
  });
}

// ============================================================================
// DOCUMENT COMPARISON
// ============================================================================

export function useCompareDocuments() {
  return useMutation({
    mutationFn: async ({ baseId, compareId }: { baseId: string; compareId: string }) => {
      const res = await authFetch(api.compare.run.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseDocumentId: baseId, comparisonDocumentId: compareId }),
      });
      if (!res.ok) throw new Error("Failed to compare documents");
      return res.json();
    },
  });
}

// ============================================================================
// MULTI-DOCUMENT ANALYSIS
// ============================================================================

export function useMultiDocumentAnalysis() {
  return useMutation({
    mutationFn: async ({ documentIds }: { documentIds: string[] }) => {
      const res = await authFetch(api.documents.analyze.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds }),
      });
      if (!res.ok) throw new Error("Failed to analyze documents");
      return res.json();
    },
  });
}

// ============================================================================
// SCHEMA MAPPING
// ============================================================================

export function useSchemaMapping(documentId: string | undefined) {
  return useMutation({
    mutationFn: async ({ schema }: { schema: "invoice" | "contract" | "purchase_order" | "nda" | "sla" | "custom" }) => {
      if (!documentId) throw new Error("Document ID required");
      const url = buildUrl(api.documents.schema.path, { id: documentId });
      const res = await authFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema }),
      });
      if (!res.ok) throw new Error("Failed to map schema");
      return res.json();
    },
  });
}

// ============================================================================
// CLAUSE REVIEW
// ============================================================================

export function useReviewClause(documentId: string | undefined) {
  return useMutation({
    mutationFn: async ({ clauseId, overrideContent, approved }: { clauseId: string; overrideContent?: string; approved?: boolean }) => {
      if (!documentId) throw new Error("Document ID required");
      const url = buildUrl(api.documents.reviewClause.path, { id: documentId });
      const res = await authFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clauseId, overrideContent, approved }),
      });
      if (!res.ok) throw new Error("Failed to review clause");
      return res.json();
    },
  });
}
