import { z } from "zod";

export const userIdSchema = z.string();
export const documentIdSchema = z.string();

export type UserRole = "admin" | "reviewer" | "user";

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["admin", "reviewer", "user"]),
  createdAt: z.string().or(z.date()),
});

export const documentSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  documentName: z.string(),
  version: z.string(),
  documentType: z.string(),
  category: z.string().optional(),
  uploadDate: z.string().or(z.date()),
  riskScore: z.number(),
  status: z.enum(["pending", "processing", "completed", "failed", "under_review"]),
  filePath: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  summary: z.string().optional(),
  createdAt: z.string().or(z.date()),
});

export const extractedFieldSchema = z.object({
  fieldName: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown())]),
  pageNumber: z.number(),
  boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  confidenceScore: z.number(),
  reviewed: z.boolean().optional(),
  overrideValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const documentStructureSchema = z.object({
  _id: z.string(),
  documentId: z.string(),
  pages: z.array(z.any()),
  sections: z.array(z.object({ title: z.string(), content: z.string(), pageNumber: z.number() })),
  tables: z.array(z.any()),
  entities: z.array(z.any()),
  extractedFields: z.array(extractedFieldSchema),
});

export const chatMessageSchema = z.object({
  _id: z.string(),
  question: z.string(),
  answer: z.string(),
  citations: z.array(z.object({ pageNumber: z.number(), text: z.string() })),
  confidence: z.number(),
  timestamp: z.string().or(z.date()),
});

export const riskFlagSchema = z.object({
  _id: z.string(),
  documentId: z.string(),
  clauseReference: z.string(),
  riskType: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  explanation: z.string(),
  suggestedClause: z.string().optional(),
  regulatoryMapping: z.array(z.string()).optional(),
  pageNumber: z.number().optional(),
});

export type User = z.infer<typeof userSchema>;
export type Document = z.infer<typeof documentSchema>;
export type DocumentStructure = z.infer<typeof documentStructureSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type RiskFlag = z.infer<typeof riskFlagSchema>;
export type ExtractedField = z.infer<typeof extractedFieldSchema>;
