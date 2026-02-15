import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs/promises";
import multer from "multer";
import {
  DocumentModel,
  DocumentStructureModel,
  EmbeddingModel,
  ChatHistoryModel,
  RiskFlagModel,
} from "./models";
import { isAuthenticated } from "./auth/jwt";
import { registerAuthRoutes } from "./auth/routes";
import { runDocumentPipeline } from "./services/documentPipeline";
import { vectorSearch } from "./services/vectorSearch";
import { generateWithContext, compareVersions, analyzeMultiDocument, mapToSchema, generateWithGroundedCitations, type GroundedAnswer } from "./services/gemini";
import { deleteByDocumentId as chromaDeleteByDocumentId, isChromaEnabled } from "./services/chroma.js";
import type { Types } from "mongoose";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Map user question to extracted field name for grounded one-line answers. */
const QUESTION_TO_FIELD: { keywords: RegExp; fieldNames: string[] }[] = [
  { keywords: /\bgender\b|\bsex\b|male\?|female\?|what\s+is\s+(the\s+)?(person'?s\s+)?gender/i, fieldNames: ["Sex", "Gender"] },
  { keywords: /\bname\b|person'?s\s+name|customer\s+name/i, fieldNames: ["Name", "Customer Name"] },
  { keywords: /who\s+is\s+the\s+client|who\s+is\s+client|name\s+of\s+client/i, fieldNames: ["Client"] },
  { keywords: /who\s+is\s+the\s+service\s+provider|who\s+is\s+service\s+provider|name\s+of\s+service\s+provider/i, fieldNames: ["Service Provider"] },
  { keywords: /who\s+is\s+(?:the\s+)?(?:vendor|provider|seller)/i, fieldNames: ["Service Provider", "Vendor"] },
  { keywords: /who\s+is\s+(?:the\s+)?(?:buyer|recipient)/i, fieldNames: ["Client", "Bill To"] },
  { keywords: /what\s+are\s+the\s+parties|who\s+are\s+the\s+parties|list\s+(?:the\s+)?parties/i, fieldNames: ["Parties"] },
  { keywords: /\b(?:date\s+of\s+birth|dob|birth\s+date|born)\b/i, fieldNames: ["Date of Birth", "DOB"] },
  { keywords: /\bexpir(?:y|ation)|valid\s+until|expires\b/i, fieldNames: ["Expiry", "Date of Expiry", "Expiration"] },
  { keywords: /\blicen[sc]e\s*(?:number|no\.?)|customer\s*number|id\s*number/i, fieldNames: ["License Number", "Customer Number"] },
];

function answerFromExtractedFields(
  question: string,
  extractedFields: { fieldName: string; value?: unknown; pageNumber?: number }[]
): { answer: string; pageNumber: number } | null {
  for (const { keywords, fieldNames } of QUESTION_TO_FIELD) {
    if (!keywords.test(question)) continue;
    for (const f of extractedFields) {
      const name = (f.fieldName || "").trim();
      if (fieldNames.some((fn) => name.toLowerCase() === fn.toLowerCase()) && f.value != null && String(f.value).trim() !== "") {
        const value = String(f.value).trim();
        const page = f.pageNumber ?? 1;
        const displayValue = /^[MF]$/i.test(value) ? (value.toUpperCase() === "F" ? "Female" : "Male") : value;
        return { answer: `Based on the document: **${name}**: ${displayValue} (Page ${page}).`, pageNumber: page };
      }
    }
  }
  return null;
}

function answerFromContext(question: string, context: string): { answer: string; pageNumber: number } | null {
  if (!context || context.length < 20) return null;
  const pageMatch = context.match(/\[Page\s+(\d+)\]/);
  const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
  if (/what\s+are\s+the\s+parties|who\s+are\s+the\s+parties|list\s+(?:the\s+)?parties/i.test(question)) {
    const betweenMatch = context.match(/between\s+([^.]{10,200}?)(?:\.|$)/i) || context.match(/([^.]{10,200}?(?:Provider|Client)[^.]{0,80})/i);
    if (betweenMatch) {
      let parties = betweenMatch[1].trim().replace(/\s+/g, " ").replace(/^this\s+agreement\s+is\s+between\s+/i, "").trim();
      parties = parties.slice(0, 180);
      return { answer: `Based on the document: **Parties**: ${parties} (Page ${pageNum}).`, pageNumber: pageNum };
    }
  }
  if (/who\s+is\s+the\s+client|who\s+is\s+client|name\s+of\s+client/i.test(question)) {
    const m = context.match(/(?:between\s+)?([A-Za-z0-9\s.,&]+(?:Pvt\.?|Private|Limited|Ltd\.?|Inc\.?|LLC)?)\s*\(\s*["']?Client["']?\s*\)/i);
    if (m) {
      const name = m[1].trim().replace(/^\s*between\s+/i, "").trim();
      return { answer: `Based on the document: **Client**: ${name} (Page ${pageNum}).`, pageNumber: pageNum };
    }
  }
  if (/how\s+many\s+net\s+days|net\s+(\d+)\s+days|payment\s+terms\s*[:\s]*\d+/i.test(question)) {
    const m = context.match(/(?:within\s+)?Net\s*(\d+)\s*days/i) || context.match(/payment\s+terms[^.]*?(\d+)\s*days/i);
    if (m) {
      return { answer: `Based on the document: **Payment terms**: Net ${m[1]} days from invoice date (Page ${pageNum}).`, pageNumber: pageNum };
    }
  }
  return null;
}

// ============================================================================
// FILE UPLOAD SETUP
// ============================================================================

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Create upload directory synchronously (will be created on first request)
const initUploadDir = () => {
  fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
};

const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`),
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    const err = new Error(`File type not allowed.`) as Error & { statusCode?: number };
    err.statusCode = 400;
    cb(err);
  },
});

// ============================================================================
// ROUTES
// ============================================================================

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  registerAuthRoutes(app);

  // Get all documents
  app.get("/api/documents", isAuthenticated, async (req: any, res) => {
    try {
      const docs = await DocumentModel.find({ userId: req.user.userId })
        .sort({ uploadDate: -1 })
        .lean();
      const list = docs.map((d) => ({
        _id: d._id.toString(),
        userId: d.userId.toString(),
        documentName: d.documentName,
        version: d.version,
        documentType: d.documentType,
        category: d.category,
        uploadDate: d.uploadDate,
        riskScore: d.riskScore,
        status: d.status,
        originalName: d.originalName,
        summary: d.summary,
        createdAt: d.createdAt,
      }));
      res.json(list);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Upload document
  app.post(
    "/api/documents",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const documentName = req.body.documentName || req.body.title || req.file.originalname;
        const documentType = req.body.documentType || req.body.fileType || "contract";
        const category = req.body.category || "";
        const version = req.body.version || "1.0";

        const doc = await DocumentModel.create({
          userId: req.user.userId,
          documentName,
          version,
          documentType,
          category,
          filePath: req.file.path,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          status: "pending",
          riskScore: 0,
        });

        runDocumentPipeline(doc._id, req.file.path).catch((err) =>
          console.error("Pipeline error:", err)
        );

        res.status(201).json({
          _id: doc._id.toString(),
          userId: doc.userId.toString(),
          documentName: doc.documentName,
          version: doc.version,
          documentType: doc.documentType,
          category: doc.category,
          uploadDate: doc.uploadDate,
          riskScore: doc.riskScore,
          status: doc.status,
          filePath: doc.filePath,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          summary: doc.summary,
          createdAt: doc.createdAt,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // Get single document
  app.get("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      }).lean();
      if (!doc) return res.status(404).json({ message: "Document not found" });
      res.json({
        _id: doc._id.toString(),
        userId: doc.userId.toString(),
        documentName: doc.documentName,
        version: doc.version,
        documentType: doc.documentType,
        category: doc.category,
        uploadDate: doc.uploadDate,
        riskScore: doc.riskScore,
        status: doc.status,
        filePath: doc.filePath,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        summary: doc.summary,
        createdAt: doc.createdAt,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get document file
  app.get("/api/documents/:id/file", async (req: any, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "") || (typeof req.query.token === "string" ? req.query.token : undefined);
      if (!token) return res.status(401).json({ message: "Unauthorized" });
      const payload = (await import("./auth/jwt")).verifyToken(token as string);
      if (!payload) return res.status(401).json({ message: "Unauthorized" });
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: payload.userId,
      }).lean();
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const resolved = path.resolve(doc.filePath);
      if (doc.mimeType) res.setHeader("Content-Type", doc.mimeType);
      // Set caching headers to prevent infinite re-fetching
      res.setHeader("Cache-Control", "public, max-age=3600, immutable");
      res.setHeader("ETag", `"${doc._id.toString()}"`);
      res.sendFile(resolved, (err) => {
        if (err) res.status(404).json({ message: "File not found" });
      });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get document structure with enhanced data
  app.get("/api/documents/:id/structure", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const structure = await DocumentStructureModel.findOne({ documentId: doc._id }).lean();
      if (!structure) return res.json(null);
      res.json({
        _id: structure._id.toString(),
        documentId: structure.documentId.toString(),
        pages: structure.pages || [],
        sections: structure.sections || [],
        tables: structure.tables || [],
        entities: structure.entities || [],
        extractedFields: structure.extractedFields || [],
        // NEW: Enhanced fields
        clauses: structure.clauses || [],
        signatures: structure.signatures || [],
        relationships: structure.relationships || [],
        crossReferences: structure.crossReferences || [],
        documentType: structure.documentType,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reprocess document
  app.post("/api/documents/:id/reprocess", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!doc.filePath) return res.status(400).json({ message: "No file to reprocess" });
      runDocumentPipeline(doc._id, doc.filePath).catch((err) => console.error("Reprocess pipeline error:", err));
      res.json({ message: "Reprocessing started. Refresh in a few seconds." });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOneAndDelete({
        _id: req.params.id,
        userId: req.user.userId,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await DocumentStructureModel.deleteMany({ documentId: doc._id });
      await EmbeddingModel.deleteMany({ documentId: doc._id });
      if (isChromaEnabled()) {
        try {
          await chromaDeleteByDocumentId(doc._id.toString());
        } catch (_) {}
      }
      await RiskFlagModel.deleteMany({ documentId: doc._id });
      await ChatHistoryModel.deleteMany({ documentIds: doc._id });
      try {
        await fs.unlink(doc.filePath);
      } catch {}
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Chat with document(s) - Enhanced with grounded citations
  app.post("/api/documents/:id/chat", isAuthenticated, async (req: any, res) => {
    try {
      const documentIds = (req.body.documentIds || [req.params.id]) as string[];
      const message = req.body.message as string;
      if (!message?.trim()) return res.status(400).json({ message: "Message required" });

      const docs = await DocumentModel.find({
        _id: { $in: documentIds },
        userId: req.user.userId,
      });
      if (docs.length === 0) return res.status(404).json({ message: "Document not found" });
      const ids = docs.map((d) => d._id);

      const structures = await Promise.all(ids.map((id) => DocumentStructureModel.findOne({ documentId: id }).lean()));
      
      // First try to answer from extracted fields
      const allFields = structures.flatMap((st) => (st?.extractedFields || []) as { fieldName: string; value?: unknown; pageNumber?: number }[]);
      const fieldAnswer = answerFromExtractedFields(message, allFields);
      if (fieldAnswer) {
        await ChatHistoryModel.create({
          userId: req.user.userId,
          documentIds: ids,
          question: message,
          answer: fieldAnswer.answer,
          citations: [{ pageNumber: fieldAnswer.pageNumber, text: fieldAnswer.answer.replace(/\*\*/g, "").slice(0, 200) }],
          confidence: 0.95,
          riskMode: req.body.riskMode === true,
        });
        return res.json({
          message: fieldAnswer.answer,
          citations: [{ pageNumber: fieldAnswer.pageNumber, text: fieldAnswer.answer.replace(/\*\*/g, "").slice(0, 200) }],
          confidence: 0.95,
        });
      }

      // Vector search for relevant context
      let results = await vectorSearch(ids, message, 5);
      let context = results.map((r) => `[Page ${r.pageNumber}] ${r.text}`).join("\n\n");
      let citations = results.map((r) => ({ pageNumber: r.pageNumber, text: r.text.slice(0, 300) }));

      // Fallback to raw page text if vector search returns little
      if (context.length < 100) {
        const fallbackParts: { text: string; pageNumber: number }[] = [];
        for (const st of structures) {
          if (!st?.pages?.length) continue;
          for (const p of st.pages) {
            const text = (p as { rawText?: string }).rawText || "";
            if (text.trim()) {
              fallbackParts.push({ text: text.slice(0, 4000), pageNumber: p.pageNumber });
            }
          }
        }
        if (fallbackParts.length > 0) {
          context = fallbackParts.map(f => `[Page ${f.pageNumber}] ${f.text}`).join("\n\n");
          citations = fallbackParts.slice(0, 5).map(f => ({ pageNumber: f.pageNumber, text: f.text.slice(0, 300) }));
        }
      }

      // Try context-based answer
      const contextAnswer = context.length > 50 ? answerFromContext(message, context) : null;
      if (contextAnswer) {
        await ChatHistoryModel.create({
          userId: req.user.userId,
          documentIds: ids,
          question: message,
          answer: contextAnswer.answer,
          citations: [{ pageNumber: contextAnswer.pageNumber, text: contextAnswer.answer.replace(/\*\*/g, "").slice(0, 200) }],
          confidence: 0.92,
          riskMode: req.body.riskMode === true,
        });
        return res.json({
          message: contextAnswer.answer,
          citations: [{ pageNumber: contextAnswer.pageNumber, text: contextAnswer.answer.replace(/\*\*/g, "").slice(0, 200) }],
          confidence: 0.92,
        });
      }

      // Use AI with grounded citations
      const contextItems = citations.map(c => ({ text: c.text, pageNumber: c.pageNumber }));
      const groundedResponse: GroundedAnswer = await generateWithGroundedCitations(message, contextItems);
      
      if (groundedResponse.answer && !groundedResponse.answer.includes("not configured") && !groundedResponse.answer.includes("no working model")) {
        await ChatHistoryModel.create({
          userId: req.user.userId,
          documentIds: ids,
          question: message,
          answer: groundedResponse.answer,
          citations: groundedResponse.citations,
          confidence: groundedResponse.confidence,
          riskMode: req.body.riskMode === true,
        });
        return res.json({
          message: groundedResponse.answer,
          citations: groundedResponse.citations,
          confidence: groundedResponse.confidence,
          usedFields: groundedResponse.usedFields,
        });
      }

      // Fallback to basic generation
      const systemInstruction =
        "Answer in ONE short sentence or a single value. Use ONLY the provided document context. Cite the exact field or phrase. Do NOT repeat the full page text.";
      let answer = await generateWithContext(message, context || "No content extracted yet.", systemInstruction);
      
      const confidence = results.length > 0 ? Math.min(0.95, 0.5 + results[0].score * 0.5) : (context.length > 100 ? 0.6 : 0.3);

      await ChatHistoryModel.create({
        userId: req.user.userId,
        documentIds: ids,
        question: message,
        answer,
        citations,
        confidence,
        riskMode: req.body.riskMode === true,
      });

      res.json({ message: answer, citations, confidence });
    } catch (err) {
      console.error("Chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get chat history
  app.get("/api/documents/:id/chat", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const history = await ChatHistoryModel.find({
        documentIds: doc._id,
        userId: req.user.userId,
      })
        .sort({ timestamp: 1 })
        .lean();
      const list = history.map((h) => ({
        _id: h._id.toString(),
        question: h.question,
        answer: h.answer,
        citations: h.citations,
        confidence: h.confidence,
        timestamp: h.timestamp,
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get risk analysis
  app.get("/api/documents/:id/risk", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      }).lean();
    if (!doc) return res.status(404).json({ message: "Document not found" });
      const flags = await RiskFlagModel.find({ documentId: doc._id }).lean();
      const riskFactors = flags.map((f) => ({
        category: f.riskType,
        severity: f.severity,
        description: f.explanation,
        location: f.pageNumber ? { page: f.pageNumber } : undefined,
        suggestedClause: f.suggestedClause,
        regulatoryMapping: f.regulatoryMapping,
      }));
      res.json({
        documentId: doc._id.toString(),
        riskScore: doc.riskScore,
        riskFactors,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all risk flags
  app.get("/api/risk/flags", isAuthenticated, async (req: any, res) => {
    try {
      const docs = await DocumentModel.find({ userId: req.user.userId })
        .select("_id documentName riskScore")
        .lean();
      const docIds = docs.map((d) => d._id);
      const flags = await RiskFlagModel.find({ documentId: { $in: docIds } })
        .sort({ severity: -1, createdAt: -1 })
        .lean();
      const docMap = new Map(docs.map((d) => [d._id.toString(), d]));
      res.json(
        flags.map((f) => {
          const docId = typeof f.documentId === "object" && f.documentId !== null
            ? (f.documentId as any)._id?.toString()
            : (f.documentId as Types.ObjectId).toString();
          const doc = docMap.get(docId);
          return {
            _id: f._id.toString(),
            documentId: docId,
            documentName: doc?.documentName,
            riskScore: doc?.riskScore,
            clauseReference: f.clauseReference,
            riskType: f.riskType,
            severity: f.severity,
            explanation: f.explanation,
            suggestedClause: f.suggestedClause,
            pageNumber: f.pageNumber,
          };
        })
      );
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Compare documents - Enhanced with semantic comparison
  app.post("/api/documents/compare", isAuthenticated, async (req: any, res) => {
    try {
      const { baseDocumentId, comparisonDocumentId } = req.body;
      const [base, comp] = await Promise.all([
        DocumentModel.findOne({ _id: baseDocumentId, userId: req.user.userId }),
        DocumentModel.findOne({ _id: comparisonDocumentId, userId: req.user.userId }),
      ]);
      if (!base || !comp) return res.status(404).json({ message: "Document not found" });
      
      const [struct1, struct2] = await Promise.all([
        DocumentStructureModel.findOne({ documentId: base._id }).lean(),
        DocumentStructureModel.findOne({ documentId: comp._id }).lean(),
      ]);
      
      const text1 = struct1?.pages?.map((p: any) => p.rawText).join("\n") || "";
      const text2 = struct2?.pages?.map((p: any) => p.rawText).join("\n") || "";
      
      // Use enhanced comparison with clause data
      const differences = await compareVersions(text1, text2, struct1?.clauses, struct2?.clauses);
      
      res.json({ 
        differences,
        baseDocument: { id: base._id.toString(), name: base.documentName, version: base.version },
        comparisonDocument: { id: comp._id.toString(), name: comp.documentName, version: comp.version }
      });
    } catch (err) {
      console.error("Compare error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Multi-document analysis - NEW ENDPOINT
  app.post("/api/documents/analyze", isAuthenticated, async (req: any, res) => {
    try {
      const { documentIds } = req.body;
      if (!documentIds || !Array.isArray(documentIds) || documentIds.length < 2) {
        return res.status(400).json({ message: "At least 2 document IDs required" });
      }
      
      const docs = await DocumentModel.find({
        _id: { $in: documentIds },
        userId: req.user.userId,
      });
      
      if (docs.length < 2) return res.status(404).json({ message: "Documents not found" });
      
      const structures = await Promise.all(
        docs.map(d => DocumentStructureModel.findOne({ documentId: d._id }).lean())
      );
      
      const docData = docs.map((doc, i) => {
        const struct = structures[i];
        const text = struct?.pages?.map((p: any) => p.rawText).join("\n") || "";
        const fields: Record<string, unknown> = {};
        struct?.extractedFields?.forEach((f: any) => {
          fields[f.fieldName] = f.value;
        });
        return {
          id: doc._id.toString(),
          name: doc.documentName,
          text,
          extractedFields: fields
        };
      });
      
      const analysis = await analyzeMultiDocument(docData);
      
      res.json(analysis);
    } catch (err) {
      console.error("Multi-doc analysis error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Schema mapping - NEW ENDPOINT
  app.post("/api/documents/:id/schema", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      
      const { schema } = req.body as { schema: "invoice" | "contract" | "purchase_order" | "nda" | "sla" | "custom" };
      if (!schema) return res.status(400).json({ message: "Schema type required" });
      
      const structure = await DocumentStructureModel.findOne({ documentId: doc._id }).lean();
      if (!structure) return res.status(404).json({ message: "Structure not found" });
      
      const extractedFields = (structure.extractedFields || []).map((f: any) => ({
        fieldName: f.fieldName,
        value: f.overrideValue ?? f.value
      }));
      
      const mapping = await mapToSchema(extractedFields, schema);
      
      res.json(mapping);
    } catch (err) {
      console.error("Schema mapping error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Review field
  app.patch("/api/documents/:id/review/field", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const structure = await DocumentStructureModel.findOne({ documentId: doc._id });
      if (!structure) return res.status(404).json({ message: "Structure not found" });
      const { fieldName, overrideValue, approved } = req.body;
      
      // Find field with case-insensitive match
      const fieldIndex = structure.extractedFields.findIndex((f: any) => 
        f.fieldName === fieldName || 
        f.fieldName?.toLowerCase() === fieldName?.toLowerCase()
      );
      
      if (fieldIndex === -1) {
        // Try to find by partial match
        const partialMatch = structure.extractedFields.findIndex((f: any) => 
          f.fieldName?.toLowerCase().includes(fieldName?.toLowerCase())
        );
        if (partialMatch === -1) {
          return res.status(404).json({ message: "Field not found", fieldName, availableFields: structure.extractedFields.map((f: any) => f.fieldName) });
        }
        structure.extractedFields[partialMatch].overrideValue = overrideValue;
        structure.extractedFields[partialMatch].reviewed = approved !== false;
      } else {
        structure.extractedFields[fieldIndex].overrideValue = overrideValue;
        structure.extractedFields[fieldIndex].reviewed = approved !== false;
      }
      
      await structure.save();
      res.json(structure.extractedFields);
    } catch (err) {
      console.error("Review field error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Review clause - NEW ENDPOINT
  app.patch("/api/documents/:id/review/clause", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const structure = await DocumentStructureModel.findOne({ documentId: doc._id });
      if (!structure) return res.status(404).json({ message: "Structure not found" });
      const { clauseId, overrideContent, approved } = req.body;
      const clause = structure.clauses?.find((c: any) => c.id === clauseId);
      if (!clause) return res.status(404).json({ message: "Clause not found" });
      clause.overrideContent = overrideContent;
      clause.reviewed = approved !== false;
      await structure.save();
      res.json(structure.clauses);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export JSON
  app.get("/api/documents/:id/export/json", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      }).lean();
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const structure = await DocumentStructureModel.findOne({ documentId: doc._id }).lean();
      const payload = {
        document: {
          documentName: doc.documentName,
          version: doc.version,
          documentType: doc.documentType,
          riskScore: doc.riskScore,
          summary: doc.summary,
        },
        structure: structure
          ? {
              sections: structure.sections,
              clauses: structure.clauses,
              signatures: structure.signatures,
              relationships: structure.relationships,
              crossReferences: structure.crossReferences,
              extractedFields: structure.extractedFields,
              tables: structure.tables,
            }
          : null,
      };
      res.setHeader("Content-Disposition", `attachment; filename="${doc.documentName}_export.json"`);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export CSV
  app.get("/api/documents/:id/export/csv", isAuthenticated, async (req: any, res) => {
    try {
      const doc = await DocumentModel.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      }).lean();
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const structure = await DocumentStructureModel.findOne({ documentId: doc._id }).lean();
      const fields = structure?.extractedFields || [];
      const header = "fieldName,value,pageNumber,confidenceScore,reviewed\n";
      const rows = fields.map(
        (f: any) =>
          `"${(f.fieldName || "").replace(/"/g, '""')}","${String(f.overrideValue ?? f.value ?? "").replace(/"/g, '""')}",${f.pageNumber},${f.confidenceScore},${f.reviewed || false}`
      );
      const csv = header + rows.join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${doc.documentName}_export.csv"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
