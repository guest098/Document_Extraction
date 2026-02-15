import { z } from "zod";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
};

export const api = {
  auth: {
    signup: { method: "POST" as const, path: "/api/auth/signup" as const },
    login: { method: "POST" as const, path: "/api/auth/login" as const },
    user: { method: "GET" as const, path: "/api/auth/user" as const },
  },
  documents: {
    upload: { method: "POST" as const, path: "/api/documents" as const },
    list: { method: "GET" as const, path: "/api/documents" as const },
    get: { method: "GET" as const, path: "/api/documents/:id" as const },
    file: { method: "GET" as const, path: "/api/documents/:id/file" as const },
    structure: { method: "GET" as const, path: "/api/documents/:id/structure" as const },
    delete: { method: "DELETE" as const, path: "/api/documents/:id" as const },
    reprocess: { method: "POST" as const, path: "/api/documents/:id/reprocess" as const },
    
    // NEW: Multi-document analysis
    analyze: { method: "POST" as const, path: "/api/documents/analyze" as const },
    
    // NEW: Schema mapping
    schema: { method: "POST" as const, path: "/api/documents/:id/schema" as const },
    
    // NEW: Clause review
    reviewClause: { method: "PATCH" as const, path: "/api/documents/:id/review/clause" as const },
  },
  chat: {
    create: {
      method: "POST" as const,
      path: "/api/documents/:id/chat" as const,
      input: z.object({ 
        message: z.string(), 
        documentIds: z.array(z.string()).optional(),
        riskMode: z.boolean().optional()
      }),
      responses: {
        200: z.object({
          message: z.string(),
          citations: z.array(z.object({ pageNumber: z.number(), text: z.string() })),
          confidence: z.number(),
          usedFields: z.array(z.string()).optional(),
        }),
      },
    },
    history: { method: "GET" as const, path: "/api/documents/:id/chat" as const },
  },
  risk: {
    list: { method: "GET" as const, path: "/api/documents/:id/risk" as const },
    flags: { method: "GET" as const, path: "/api/risk/flags" as const },
  },
  compare: {
    run: {
      method: "POST" as const,
      path: "/api/documents/compare" as const,
      input: z.object({ baseDocumentId: z.string(), comparisonDocumentId: z.string() }),
    },
  },
  review: {
    updateField: {
      method: "PATCH" as const,
      path: "/api/documents/:id/review/field" as const,
      input: z.object({
        fieldName: z.string(),
        overrideValue: z.union([z.string(), z.number(), z.boolean()]),
        approved: z.boolean().optional(),
      }),
    },
  },
  export: {
    json: { method: "GET" as const, path: "/api/documents/:id/export/json" as const },
    csv: { method: "GET" as const, path: "/api/documents/:id/export/csv" as const },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`:${key}`, String(value));
    }
  }
  return url;
}
