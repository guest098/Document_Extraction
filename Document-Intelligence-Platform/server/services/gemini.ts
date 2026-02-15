import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { localEmbed } from "./localEmbedding.js";

const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// Model IDs for Gemini API. Override with GEMINI_MODEL in .env.
const GENERATION_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const FALLBACK_MODELS = [
  "gemini-1.5-pro",
  "gemini-2.0-flash",
];
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
const FALLBACK_EMBEDDING_MODELS = [
  "embedding-001",
];

function getGenerationModel(): GenerativeModel | null {
  if (!genAI) return null;
  return genAI.getGenerativeModel({ model: GENERATION_MODEL });
}

export function getModel(name?: string): GenerativeModel | null {
  if (!genAI) return null;
  const modelId = name || GENERATION_MODEL;
  return genAI.getGenerativeModel({ model: modelId });
}

export async function embedText(text: string): Promise<number[]> {
  console.log("Using local embedding (Gemini v1beta doesn't support newer embedding models)");
  return localEmbed(text);
}

// ============================================================================
// ENHANCED LAYOUT-AWARE EXTRACTION
// ============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutElement {
  id: string;
  type: "header" | "paragraph" | "table" | "list" | "signature" | "footnote" | "page_number" | "image" | "border" | "line";
  content?: string;
  boundingBox?: BoundingBox;
  level?: number;
  pageNumber: number;
}

export interface ExtractedClause {
  id: string;
  title: string;
  content: string;
  pageNumber: number;
  boundingBox?: BoundingBox;
  confidenceScore: number;
  clauseType?: "definition" | "obligation" | "restriction" | "right" | "termination" | "payment" | "liability" | "confidentiality" | "dispute" | "general";
  linkedClauses?: string[];
  crossReferences?: { ref: string; target: string }[];
}

export interface Relationship {
  id: string;
  type: "references" | "modifies" | "supersedes" | "annex" | "appendix" | "exhibit" | "related";
  source: { clauseId: string; text: string };
  target: { clauseId?: string; text?: string; document?: string };
  pageNumber: number;
}

export interface SignatureBlock {
  id: string;
  role: "signatory" | "witness" | "notary" | "authorized_representative";
  name?: string;
  title?: string;
  company?: string;
  date?: string;
  pageNumber: number;
  boundingBox?: BoundingBox;
  confidenceScore: number;
}

export interface CrossReference {
  id: string;
  refType: "section" | "article" | "clause" | "appendix" | "exhibit" | "schedule" | "annex";
  refNumber: string;
  targetPageNumber?: number;
  targetSection?: string;
  context: string;
  pageNumber: number;
}

export interface ExtractedStructure {
  // Enhanced layout elements
  layoutElements: LayoutElement[];
  
  // Traditional sections (enhanced with clause detection)
  sections: { title: string; content: string; pageNumber: number; boundingBox?: BoundingBox; level?: number }[];
  clauses: ExtractedClause[];
  
  // Relationships between document parts
  relationships: Relationship[];
  
  // Signatures
  signatures: SignatureBlock[];
  
  // Cross-references
  crossReferences: CrossReference[];
  
  // Traditional extracted data
  extractedFields: { fieldName: string; value: unknown; pageNumber: number; confidenceScore: number; boundingBox?: BoundingBox }[];
  tables: { pageNumber: number; headers: string[]; rows: { cells: string[] }[] }[];
  summary: string;
  insights?: string;
  
  // Metadata
  documentType?: string;
  language?: string;
  pageCount?: number;
}

/**
 * Advanced layout-aware structure extraction using Gemini
 * Detects sections, tables, signatures, cross-references, and clause relationships
 */
export async function extractStructureFromPdf(
  _pdfBase64: string,
  _mimeType: string,
  rawText: string,
  pageCount: number = 1
): Promise<ExtractedStructure> {
  const modelsToTry = [GENERATION_MODEL, ...FALLBACK_MODELS];
  const defaultResult: ExtractedStructure = {
    layoutElements: [],
    sections: [],
    clauses: [],
    relationships: [],
    signatures: [],
    crossReferences: [],
    extractedFields: [],
    tables: [],
    summary: "",
  };
  
  if (!genAI) {
    console.warn("Gemini API not initialized (no API key)");
    return { ...defaultResult, summary: "API key not set." };
  }

  // Enhanced prompt for layout-aware understanding
  const prompt = `Analyze this document text (from a PDF with ${pageCount} pages). Return a single JSON object (no markdown) with comprehensive layout-aware analysis:

1. "sections": array of { "title": string, "content": string, "pageNumber": number, "level": number (1-3), "boundingBox": { "x": number, "y": number, "width": number, "height": number } } for each logical section. Use estimated normalized 0-1 coordinates.

2. "clauses": array of { "id": string, "title": string, "content": string, "pageNumber": number, "clauseType": "definition"|"obligation"|"restriction"|"right"|"termination"|"payment"|"liability"|"confidentiality"|"dispute"|"general", "confidenceScore": number 0-1, "boundingBox": {...}, "crossReferences": [{ "ref": string, "target": string }] } - detect legal/contract clauses with type classification.

3. "signatures": array of { "id": string, "role": "signatory"|"witness"|"notary"|"authorized_representative", "name": string, "title": string, "company": string, "date": string, "pageNumber": number, "confidenceScore": number } - detect signature blocks.

4. "crossReferences": array of { "id": string, "refType": "section"|"article"|"clause"|"appendix"|"exhibit"|"schedule"|"annex", "refNumber": string, "targetPageNumber": number, "targetSection": string, "context": string, "pageNumber": number } - detect cross-references to other sections.

5. "relationships": array of { "id": string, "type": "references"|"modifies"|"supersedes"|"annex"|"appendix"|"exhibit"|"related", "source": { "clauseId": string, "text": string }, "target": { "clauseId": string, "text": string }, "pageNumber": number } - detect relationships between clauses.

6. "extractedFields": array of { "fieldName": string, "value": string or number, "pageNumber": number, "confidenceScore": number 0-1, "boundingBox": {...} } for key data: dates, parties, amounts, invoice number, due date, total, etc.

7. "tables": array of { "pageNumber": number, "headers": string[], "rows": [ { "cells": string[] } ] } - detect any tabular data.

8. "summary": string (brief executive summary, 2-4 sentences).

9. "documentType": string - detected document type (contract, invoice, agreement, NDA, SLA, etc.)

10. "language": string - detected language (en, es, fr, etc.)

All boundingBox values must be in normalized 0-1 coordinates (x=left, y=top, width, height). Provide best-effort estimates.

Document text:
${rawText.slice(0, 32000)}`;

  let lastError: Error | null = null;
  for (const modelId of modelsToTry) {
    try {
      console.log(`Attempting layout-aware structure extraction with model: ${modelId}`);
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      console.log(`Layout-aware extraction succeeded with model: ${modelId}`);
      
      return {
        layoutElements: Array.isArray(parsed.layoutElements) ? parsed.layoutElements : defaultResult.layoutElements,
        sections: Array.isArray(parsed.sections) ? parsed.sections.map((s: { title?: string; content?: string; pageNumber?: number; boundingBox?: { x: number; y: number; width: number; height: number }; level?: number }) => ({ 
          title: s.title || "", 
          content: s.content || "", 
          pageNumber: s.pageNumber || 1,
          boundingBox: s.boundingBox,
          level: s.level || 1
        })) : defaultResult.sections,
        clauses: Array.isArray(parsed.clauses) ? parsed.clauses.map((c: { id?: string; title?: string; content?: string; pageNumber?: number; clauseType?: string; confidenceScore?: number; boundingBox?: { x: number; y: number; width: number; height: number }; crossReferences?: { ref: string; target: string }[] }) => ({
          id: c.id || `clause_${Math.random().toString(36).substr(2, 9)}`,
          title: c.title || "",
          content: c.content || "",
          pageNumber: c.pageNumber || 1,
          clauseType: c.clauseType as ExtractedClause['clauseType'],
          confidenceScore: c.confidenceScore ?? 0.7,
          boundingBox: c.boundingBox,
          crossReferences: c.crossReferences
        })) : defaultResult.clauses,
        relationships: Array.isArray(parsed.relationships) ? parsed.relationships : defaultResult.relationships,
        signatures: Array.isArray(parsed.signatures) ? parsed.signatures.map((s: { id?: string; role?: string; name?: string; title?: string; company?: string; date?: string; pageNumber?: number; confidenceScore?: number; boundingBox?: { x: number; y: number; width: number; height: number } }) => ({
          id: s.id || `sig_${Math.random().toString(36).substr(2, 9)}`,
          role: s.role as SignatureBlock['role'],
          name: s.name,
          title: s.title,
          company: s.company,
          date: s.date,
          pageNumber: s.pageNumber || 1,
          confidenceScore: s.confidenceScore ?? 0.7,
          boundingBox: s.boundingBox
        })) : defaultResult.signatures,
        crossReferences: Array.isArray(parsed.crossReferences) ? parsed.crossReferences : defaultResult.crossReferences,
        extractedFields: Array.isArray(parsed.extractedFields) ? parsed.extractedFields.map((f: { fieldName?: string; value?: unknown; pageNumber?: number; confidenceScore?: number; boundingBox?: { x: number; y: number; width: number; height: number } }) => ({ 
          fieldName: f.fieldName || "", 
          value: f.value, 
          pageNumber: f.pageNumber || 1, 
          confidenceScore: f.confidenceScore ?? 0.5, 
          boundingBox: f.boundingBox 
        })) : defaultResult.extractedFields,
        tables: Array.isArray(parsed.tables) ? parsed.tables : defaultResult.tables,
        summary: typeof parsed.summary === "string" ? parsed.summary : defaultResult.summary,
        documentType: parsed.documentType,
        language: parsed.language,
        pageCount: pageCount
      };
    } catch (err) {
      lastError = err as Error;
      console.warn(`Layout-aware extraction with ${modelId} failed:`, lastError.message);
    }
  }
  console.error(`All layout-aware extraction models failed. Last error: ${lastError?.message || "unknown"}`);
  return defaultResult;
}

/**
 * Extract structure from image with enhanced layout awareness
 */
export async function extractStructureFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ExtractedStructure & { rawText: string }> {
  const defaultResult: ExtractedStructure & { rawText: string } = {
    layoutElements: [],
    sections: [],
    clauses: [],
    relationships: [],
    signatures: [],
    crossReferences: [],
    extractedFields: [],
    tables: [],
    summary: "",
    rawText: "",
  };
  
  if (!genAI) {
    console.warn("Gemini API not initialized (no API key)");
    return { ...defaultResult, summary: "API key not set." };
  }
  
  const base64 = imageBuffer.toString("base64");
  const prompt = `You are analyzing a document image. Perform deep layout-aware analysis and return a single JSON object (no markdown, no code fence) with:

1. "rawText": string - all text you can read from the image, in reading order.

2. "layoutElements": array of { "id": string, "type": "header"|"paragraph"|"table"|"list"|"signature"|"footnote"|"page_number"|"image", "content": string, "pageNumber": 1, "level": number, "boundingBox": {...} } - all layout elements with normalized 0-1 coordinates.

3. "sections": array of { "title": string, "content": string, "pageNumber": 1, "level": number 1-3, "boundingBox": {...} } - logical sections with hierarchy.

4. "clauses": array of { "id": string, "title": string, "content": string, "pageNumber": 1, "clauseType": "definition"|"obligation"|"restriction"|"right"|"termination"|"payment"|"liability"|"confidentiality"|"dispute"|"general", "confidenceScore": number, "boundingBox": {...}, "crossReferences": [...] } - legal/contract clauses.

5. "signatures": array of { "id": string, "role": "signatory"|"witness"|"notary"|"authorized_representative", "name": string, "title": string, "company": string, "date": string, "pageNumber": 1, "confidenceScore": number, "boundingBox": {...} } - signature blocks.

6. "crossReferences": array of { "id": string, "refType": "section"|"article"|"clause"|"appendix"|"exhibit", "refNumber": string, "targetPageNumber": number, "targetSection": string, "context": string, "pageNumber": 1 } - cross-references.

7. "relationships": array of { "id": string, "type": "references"|"modifies"|"supersedes"|"annex"|"exhibit", "source": { "clauseId": string, "text": string }, "target": { "clauseId": string, "text": string }, "pageNumber": 1 } - clause relationships.

8. "extractedFields": array of { "fieldName": string, "value": string or number, "pageNumber": 1, "confidenceScore": number 0-1, "boundingBox": {...} } - key fields.

9. "tables": array of { "pageNumber": 1, "headers": string[], "rows": [ { "cells": string[] } ] } - any tabular data.

10. "summary": string - brief executive summary (2-4 sentences).

11. "insights": string - deeper insights: layout description, key visual elements, document type, quality/readability notes.

12. "documentType": string - detected document type.

13. "language": string - detected language.

All boundingBox values must be in normalized 0-1 coordinates. Return only valid JSON.`;

  const modelsToTry = [GENERATION_MODEL, ...FALLBACK_MODELS];
  for (const modelId of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType || "image/png",
            data: base64,
          },
        },
        { text: prompt },
      ]);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      const rawText = typeof parsed.rawText === "string" ? parsed.rawText : "";
      
      return {
        layoutElements: Array.isArray(parsed.layoutElements) ? parsed.layoutElements : defaultResult.layoutElements,
        sections: Array.isArray(parsed.sections) ? parsed.sections : defaultResult.sections,
        clauses: Array.isArray(parsed.clauses) ? parsed.clauses : defaultResult.clauses,
        relationships: Array.isArray(parsed.relationships) ? parsed.relationships : defaultResult.relationships,
        signatures: Array.isArray(parsed.signatures) ? parsed.signatures : defaultResult.signatures,
        crossReferences: Array.isArray(parsed.crossReferences) ? parsed.crossReferences : defaultResult.crossReferences,
        extractedFields: Array.isArray(parsed.extractedFields) ? parsed.extractedFields : defaultResult.extractedFields,
        tables: Array.isArray(parsed.tables) ? parsed.tables : defaultResult.tables,
        summary: typeof parsed.summary === "string" ? parsed.summary : defaultResult.summary,
        insights: typeof parsed.insights === "string" ? parsed.insights : undefined,
        documentType: parsed.documentType,
        language: parsed.language,
        rawText,
      };
    } catch (err) {
      console.warn(`Image layout extraction with ${modelId} failed:`, (err as Error).message);
    }
  }
  return defaultResult;
}

// ============================================================================
// SEMANTIC RISK DETECTION
// ============================================================================

export interface SemanticRisk {
  riskType: string;
  severity: "low" | "medium" | "high" | "critical";
  explanation: string;
  clauseId?: string;
  clauseTitle?: string;
  suggestedClause?: string;
  regulatoryReferences?: string[];
  confidenceScore: number;
}

/**
 * Detect legal/compliance risks in clauses with semantic understanding
 */
export async function detectRisksSemantic(clauseText: string, clauseType?: string): Promise<SemanticRisk | null> {
  if (!genAI) return null;
  
  const prompt = `Identify legal/compliance risk in this clause. Return JSON only: { 
  "riskType": string, 
  "severity": "low"|"medium"|"high"|"critical", 
  "explanation": string, 
  "suggestedClause": string (optional),
  "regulatoryReferences": string[] (optional),
  "confidenceScore": number 0-1
}

Clause text:
${clauseText.slice(0, 4000)}

Clause type (if known): ${clauseType || "unknown"}`;
  
  for (const modelId of [GENERATION_MODEL, ...FALLBACK_MODELS]) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      return {
        riskType: parsed.riskType,
        severity: parsed.severity,
        explanation: parsed.explanation,
        suggestedClause: parsed.suggestedClause,
        regulatoryReferences: parsed.regulatoryReferences,
        confidenceScore: parsed.confidenceScore ?? 0.7
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ============================================================================
// SEMANTIC COMPARISON & VERSION DIFF
// ============================================================================

export type VersionDifference = {
  id: string;
  type: "addition" | "deletion" | "modification" | "moved";
  clauseId?: string;
  clauseTitle?: string;
  description: string;
  originalText?: string;
  newText?: string;
  riskImpact: "none" | "increased" | "decreased" | "changed";
  severity?: "low" | "medium" | "high";
  pageNumber?: number;
  movedToPage?: number;
  clauseDriftScore?: number;
};

/**
 * Compare two document versions with semantic understanding
 * Returns clause-level differences with risk impact analysis
 */
export async function compareVersions(
  text1: string,
  text2: string,
  clauses1?: ExtractedClause[],
  clauses2?: ExtractedClause[]
): Promise<VersionDifference[]> {
  if (!genAI) return simpleTextDiff(text1, text2);
  
  // Build clause context if available
  let clauseContext = "";
  if (clauses1 && clauses1.length > 0) {
    clauseContext += "\nVersion 1 Clauses:\n" + clauses1.map(c => `[${c.id}] ${c.title}: ${c.content.slice(0, 200)}`).join("\n");
  }
  if (clauses2 && clauses2.length > 0) {
    clauseContext += "\nVersion 2 Clauses:\n" + clauses2.map(c => `[${c.id}] ${c.title}: ${c.content.slice(0, 200)}`).join("\n");
  }
  
  const prompt = `Compare two document versions. Perform semantic comparison to identify:
1. Clause-level changes (additions, deletions, modifications)
2. Risk impact analysis for each change
3. Clause drift detection (significant changes in meaning)
4. Cross-reference updates

Return a JSON array of differences. Each item: { 
  "id": string,
  "type": "addition"|"deletion"|"modification"|"moved", 
  "clauseId": string (if applicable),
  "clauseTitle": string,
  "description": string, 
  "originalText": string (if deletion/modification), 
  "newText": string (if addition/modification), 
  "riskImpact": "none"|"increased"|"decreased"|"changed",
  "severity": "low"|"medium"|"high" (if risk changed),
  "pageNumber": number,
  "movedToPage": number (if moved),
  "clauseDriftScore": number 0-1 (if semantically different)
}
${clauseContext}

Version 1:
${text1.slice(0, 12000)}

Version 2:
${text2.slice(0, 12000)}`;
  
  for (const modelId of [GENERATION_MODEL, ...FALLBACK_MODELS]) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      const arr = JSON.parse(jsonStr);
      if (Array.isArray(arr) && arr.length > 0) {
        // Add IDs if missing
        return arr.map((item: Partial<VersionDifference>, index: number) => ({
          ...item,
          id: item.id || `diff_${index}`,
          riskImpact: item.riskImpact || "none",
          clauseDriftScore: item.clauseDriftScore ?? 0
        })) as VersionDifference[];
      }
    } catch {
      continue;
    }
  }
  return simpleTextDiff(text1, text2);
}

// ============================================================================
// MULTI-DOCUMENT REASONING
// ============================================================================

export interface MultiDocAnalysis {
  sharedEntities: { type: string; value: string; documentIds: string[] }[];
  conflicts: { entity: string; values: { docId: string; value: string }[]; severity: string }[];
  crossReferences: { sourceDoc: string; targetDoc: string; refType: string; context: string }[];
  consolidatedSummary: string;
  combinedRiskScore: number;
  recommendations: string[];
}

/**
 * Analyze multiple documents together for cross-document relationships,
 * entity resolution, and conflict detection
 */
export async function analyzeMultiDocument(
  documents: { id: string; name: string; text: string; extractedFields: Record<string, unknown> }[]
): Promise<MultiDocAnalysis> {
  if (!genAI) {
    return {
      sharedEntities: [],
      conflicts: [],
      crossReferences: [],
      consolidatedSummary: "Multi-document analysis requires API key",
      combinedRiskScore: 0,
      recommendations: []
    };
  }
  
  const docSummaries = documents.map(d => 
    `Document: ${d.name} (ID: ${d.id})\nText: ${d.text.slice(0, 3000)}\nFields: ${JSON.stringify(d.extractedFields)}`
  ).join("\n\n---\n\n");
  
  const prompt = `Analyze these ${documents.length} documents together. Identify:
1. Shared entities across documents (parties, dates, amounts, etc.)
2. Conflicts or inconsistencies between documents
3. Cross-references between documents
4. Consolidated summary
5. Combined risk assessment
6. Recommendations

Return JSON: {
  "sharedEntities": [{ "type": string, "value": string, "documentIds": string[] }],
  "conflicts": [{ "entity": string, "values": [{ "docId": string, "value": string }], "severity": "low"|"medium"|"high" }],
  "crossReferences": [{ "sourceDoc": string, "targetDoc": string, "refType": string, "context": string }],
  "consolidatedSummary": string,
  "combinedRiskScore": number 0-100,
  "recommendations": string[]
}

Documents:
${docSummaries}`;
  
  for (const modelId of [GENERATION_MODEL, ...FALLBACK_MODELS]) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      return {
        sharedEntities: parsed.sharedEntities || [],
        conflicts: parsed.conflicts || [],
        crossReferences: parsed.crossReferences || [],
        consolidatedSummary: parsed.consolidatedSummary || "",
        combinedRiskScore: parsed.combinedRiskScore || 0,
        recommendations: parsed.recommendations || []
      };
    } catch {
      continue;
    }
  }
  
  return {
    sharedEntities: [],
    conflicts: [],
    crossReferences: [],
    consolidatedSummary: "Analysis failed",
    combinedRiskScore: 0,
    recommendations: []
  };
}

// ============================================================================
// DOCUMENT SCHEMA MAPPING
// ============================================================================

export interface SchemaMapping {
  schemaName: string;
  schemaVersion: string;
  mappedFields: { sourceField: string; targetField: string; transformation?: string; confidence: number }[];
  unmappedFields: string[];
  validationErrors: { field: string; error: string }[];
}

/**
 * Map extracted document fields to standard schemas for downstream workflows
 */
export async function mapToSchema(
  extractedFields: { fieldName: string; value: unknown }[],
  targetSchema: "invoice" | "contract" | "purchase_order" | "nda" | "sla" | "custom"
): Promise<SchemaMapping> {
  if (!genAI) {
    return {
      schemaName: targetSchema,
      schemaVersion: "1.0",
      mappedFields: [],
      unmappedFields: extractedFields.map(f => f.fieldName),
      validationErrors: []
    };
  }
  
  const schemaDefs: Record<string, string> = {
    invoice: "Invoice: invoice_number, invoice_date, due_date, vendor_name, vendor_address, bill_to, line_items[{description, quantity, unit_price, total}], subtotal, tax, total, payment_terms, currency",
    contract: "Contract: parties[], effective_date, termination_date, term, governing_law, dispute_resolution, confidentiality, indemnification, limitation_of_liability, force_majeure, amendments",
    purchase_order: "PO: po_number, po_date, vendor, ship_to, line_items[{item, quantity, unit_price, total}], subtotal, tax, shipping, total, payment_terms, delivery_date",
    nda: "NDA: parties[], effective_date, term, confidential_information_scope, permitted_disclosure, obligations, remedies, governing_law",
    sla: "SLA: service_provider, customer, effective_date, term, service_description, service_levels[{metric, target, measurement}], remedies, escalation, termination"
  };
  
  const prompt = `Map these extracted fields to the "${targetSchema}" schema.
  
Extracted fields:
${extractedFields.map(f => `${f.fieldName}: ${f.value}`).join("\n")}

Schema definition:
${schemaDefs[targetSchema] || "custom"}

Return JSON: {
  "schemaName": string,
  "schemaVersion": string,
  "mappedFields": [{ "sourceField": string, "targetField": string, "transformation": string (optional), "confidence": number 0-1 }],
  "unmappedFields": string[],
  "validationErrors": [{ "field": string, "error": string }]
}`;
  
  for (const modelId of [GENERATION_MODEL, ...FALLBACK_MODELS]) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonStr);
    } catch {
      continue;
    }
  }
  
  return {
    schemaName: targetSchema,
    schemaVersion: "1.0",
    mappedFields: [],
    unmappedFields: extractedFields.map(f => f.fieldName),
    validationErrors: []
  };
}

// ============================================================================
// GENERATE WITH GROUNDED CITATIONS
// ============================================================================

export interface GroundedAnswer {
  answer: string;
  citations: { pageNumber: number; text: string; boundingBox?: BoundingBox }[];
  confidence: number;
  usedFields: string[];
}

/**
 * Generate answer with explicit grounding in document citations
 */
export async function generateWithGroundedCitations(
  prompt: string,
  context: { text: string; pageNumber: number; boundingBox?: BoundingBox }[]
): Promise<GroundedAnswer> {
  if (!genAI) {
    return {
      answer: "API key not configured",
      citations: [],
      confidence: 0,
      usedFields: []
    };
  }
  
  const contextStr = context.map(c => `[Page ${c.pageNumber}] ${c.text}`).join("\n\n---\n\n");
  
  const instruction = `Answer the question based ONLY on the provided context. 
For each factual claim in your answer, cite the source using [Page X] format.
Include the specific text that supports your answer.
If the answer cannot be determined from the context, say "No evidence found."

Respond with JSON:
{
  "answer": string,
  "usedFields": string[] (field names used from context),
  "confidence": number 0-1 (based on how well the context supports the answer)
}`;
  
  const fullPrompt = `${instruction}\n\nContext:\n${contextStr}\n\nQuestion: ${prompt}`;
  
  for (const modelId of [GENERATION_MODEL, ...FALLBACK_MODELS]) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(fullPrompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      
      // Extract citations from the answer
      const citationMatches: { pageNumber: number; text: string }[] = [];
      const pageRefRegex = /\[Page\s+(\d+)\]/g;
      let match;
      while ((match = pageRefRegex.exec(text)) !== null) {
        const pageNum = parseInt(match[1], 10);
        // Find surrounding context for this citation
        const pageContext = context.find(c => c.pageNumber === pageNum);
        if (pageContext) {
          citationMatches.push({
            pageNumber: pageNum,
            text: pageContext.text.slice(0, 200)
          });
        }
      }
      
      return {
        answer: parsed.answer || text,
        citations: citationMatches.length > 0 ? citationMatches : context.slice(0, 3).map(c => ({ pageNumber: c.pageNumber, text: c.text.slice(0, 200) })),
        confidence: parsed.confidence ?? 0.7,
        usedFields: parsed.usedFields || []
      };
    } catch {
      continue;
    }
  }
  
  return {
    answer: "Failed to generate answer",
    citations: [],
    confidence: 0,
    usedFields: []
  };
}

// ============================================================================
// LEGACY SUPPORT FUNCTIONS
// ============================================================================

/** Legacy function for backward compatibility */
export async function generateWithContext(
  prompt: string,
  context: string,
  systemInstruction?: string
): Promise<string> {
  const modelsToTry = [GENERATION_MODEL, ...FALLBACK_MODELS];
  let lastError: Error | null = null;
  
  for (const modelId of modelsToTry) {
    const model = genAI ? genAI.getGenerativeModel({ model: modelId }) : null;
    if (!model) {
      console.log(`Model ${modelId} not available (genAI is null)`);
      continue;
    }
    try {
      const fullPrompt = systemInstruction
        ? `${systemInstruction}\n\nContext from document(s):\n${context}\n\nUser request: ${prompt}`
        : `Use ONLY the following context to answer. Do not use general knowledge.\n\nContext:\n${context}\n\nQuestion/Request: ${prompt}`;
      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();
      if (text && text.trim()) {
        console.log(`generateWithContext succeeded with model: ${modelId}`);
        return text;
      }
    } catch (err) {
      lastError = err as Error;
      console.warn(`Generate with ${modelId} failed:`, lastError.message);
    }
  }
  
  const errorMsg = lastError ? lastError.message : "All models failed";
  console.error(`All generation models failed. Last error: ${errorMsg}`);
  
  if (!genAI) {
    return "Gemini API key not configured or no working model available.";
  }
  return "Gemini API key not configured or no working model available.";
}

/** Describe what changed between two similar strings */
function describeLineChange(oldLine: string, newLine: string): string {
  const a = oldLine.trim();
  const b = newLine.trim();
  if (a === b) return "No change";
  const maxLen = Math.max(a.length, b.length);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const oldPart = a.slice(start, endA).trim();
  const newPart = b.slice(start, endB).trim();
  if (!oldPart && newPart) return `Added: "${newPart.slice(0, 80)}${newPart.length > 80 ? "…" : ""}"`;
  if (oldPart && !newPart) return `Removed: "${oldPart.slice(0, 80)}${oldPart.length > 80 ? "…" : ""}"`;
  if (oldPart && newPart) {
    const o = oldPart.length > 60 ? oldPart.slice(0, 60) + "…" : oldPart;
    const n = newPart.length > 60 ? newPart.slice(0, 60) + "…" : newPart;
    return `"${o}" → "${n}"`;
  }
  return "Text changed";
}

/** Normalize to comparable lines */
function toLines(text: string): string[] {
  const byNewline = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (byNewline.length >= 3) return byNewline;
  const byClause = text.split(/(?=\d+\.\s+[A-Za-z])/).map((l) => l.trim()).filter((l) => l.length > 10);
  return byClause.length >= 2 ? byClause : byNewline.length ? byNewline : [text.trim()].filter(Boolean);
}

/** Find best matching line index */
function findMatchingLine(line: string, lines2: string[], used: Set<number>): number {
  const key = line.slice(0, 40);
  for (let i = 0; i < lines2.length; i++) {
    if (used.has(i)) continue;
    const o = lines2[i];
    if (o === line) return i;
    if (o.slice(0, 40) === key) return i;
    const numMatch = line.match(/^(\d+\.\s*\w+)/);
    if (numMatch && o.startsWith(numMatch[1])) return i;
    if (line.length > 15 && o.length > 15 && (o.includes(line.slice(0, 20)) || line.includes(o.slice(0, 20)))) return i;
  }
  return -1;
}

/** Line-level diff fallback */
export function simpleTextDiff(
  text1: string,
  text2: string
): VersionDifference[] {
  const lines1 = toLines(text1);
  const lines2 = toLines(text2);
  const used2 = new Set<number>();
  const out: VersionDifference[] = [];

  for (let i = 0; i < lines1.length; i++) {
    const line1 = lines1[i];
    const j = findMatchingLine(line1, lines2, used2);
    if (j === -1) {
      const clause = line1.match(/^(\d+\.\s*[A-Za-z\s]+)/)?.[1] || `Line ${i + 1}`;
      out.push({
        id: `diff_${i}`,
        type: "deletion",
        description: `${clause.trim()} — removed in new version`,
        originalText: line1.slice(0, 500),
        riskImpact: "none",
      });
    } else {
      used2.add(j);
      const line2 = lines2[j];
      if (line1 !== line2) {
        const clause = line1.match(/^(\d+\.\s*[A-Za-z\s]+)/)?.[1] || `Line ${i + 1}`;
        const changeDesc = describeLineChange(line1, line2);
        out.push({
          id: `diff_${i}`,
          type: "modification",
          description: `${clause.trim()} — ${changeDesc}`,
          originalText: line1.slice(0, 500),
          newText: line2.slice(0, 500),
          riskImpact: "none",
        });
      }
    }
  }

  for (let j = 0; j < lines2.length; j++) {
    if (used2.has(j)) continue;
    const line2 = lines2[j];
    const clause = line2.match(/^(\d+\.\s*[A-Za-z\s]+)/)?.[1] || `Line ${j + 1}`;
    out.push({
      id: `diff_added_${j}`,
      type: "addition",
      description: `${clause.trim()} — added in new version`,
      newText: line2.slice(0, 500),
      riskImpact: "none",
    });
  }

  if (out.length === 0 && text1.trim() !== text2.trim()) {
    out.push({
      id: `diff_general`,
      type: "modification",
      description: `Document length changed (${text1.trim().length} vs ${text2.trim().length} characters).`,
      riskImpact: "none",
    });
  }
  return out;
}
