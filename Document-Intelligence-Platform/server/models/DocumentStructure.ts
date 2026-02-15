import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// EXTRACTED FIELD
// ============================================================================

export interface IExtractedField {
  fieldName: string;
  value: string | number | boolean | Record<string, unknown>;
  pageNumber: number;
  boundingBox?: IBoundingBox;
  confidenceScore: number;
  reviewed?: boolean;
  overrideValue?: string | number | boolean;
}

// ============================================================================
// PAGE CONTENT
// ============================================================================

export interface IPageContent {
  pageNumber: number;
  rawText: string;
  sections?: { title: string; content: string; boundingBox?: IBoundingBox }[];
}

// ============================================================================
// TABLE
// ============================================================================

export interface ITableRow {
  cells: string[];
}

export interface ITable {
  pageNumber: number;
  headers: string[];
  rows: ITableRow[];
}

// ============================================================================
// ENTITY
// ============================================================================

export interface IEntity {
  type: string;
  value: string;
  pageNumber: number;
  boundingBox?: IBoundingBox;
  confidence?: number;
}

// ============================================================================
// EXTRACTED CLAUSE (NEW)
// ============================================================================

export interface ICrossReference {
  ref: string;
  target: string;
}

export interface IExtractedClause {
  id: string;
  title: string;
  content: string;
  pageNumber: number;
  boundingBox?: IBoundingBox;
  confidenceScore: number;
  clauseType?: "definition" | "obligation" | "restriction" | "right" | "termination" | "payment" | "liability" | "confidentiality" | "dispute" | "general";
  linkedClauses?: string[];
  crossReferences?: ICrossReference[];
  reviewed?: boolean;
  overrideContent?: string;
}

// ============================================================================
// SIGNATURE BLOCK (NEW)
// ============================================================================

export interface ISignatureBlock {
  id: string;
  role: "signatory" | "witness" | "notary" | "authorized_representative";
  name?: string;
  title?: string;
  company?: string;
  date?: string;
  pageNumber: number;
  boundingBox?: IBoundingBox;
  confidenceScore: number;
  reviewed?: boolean;
}

// ============================================================================
// RELATIONSHIP (NEW)
// ============================================================================

export interface IClauseRelationship {
  clauseId: string;
  text: string;
}

export interface IRelationship {
  id: string;
  type: "references" | "modifies" | "supersedes" | "annex" | "appendix" | "exhibit" | "related";
  source: IClauseRelationship;
  target: IClauseRelationship & { document?: string };
  pageNumber: number;
}

// ============================================================================
// CROSS-REFERENCE (NEW)
// ============================================================================

export interface ICrossRef {
  id: string;
  refType: "section" | "article" | "clause" | "appendix" | "exhibit" | "schedule" | "annex";
  refNumber: string;
  targetPageNumber?: number;
  targetSection?: string;
  context: string;
  pageNumber: number;
}

// ============================================================================
// MAIN DOCUMENT STRUCTURE
// ============================================================================

export interface IDocumentStructure extends Document {
  _id: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  pages: IPageContent[];
  sections: { title: string; content: string; pageNumber: number; boundingBox?: IBoundingBox; level?: number }[];
  tables: ITable[];
  entities: IEntity[];
  extractedFields: IExtractedField[];
  
  // NEW: Enhanced fields
  clauses?: IExtractedClause[];
  signatures?: ISignatureBlock[];
  relationships?: IRelationship[];
  crossReferences?: ICrossRef[];
  documentType?: string;
  
  rawStructure?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const boundingBoxSchema = new Schema(
  { x: Number, y: Number, width: Number, height: Number },
  { _id: false }
);

const extractedFieldSchema = new Schema(
  {
    fieldName: String,
    value: Schema.Types.Mixed,
    pageNumber: Number,
    boundingBox: boundingBoxSchema,
    confidenceScore: Number,
    reviewed: { type: Boolean, default: false },
    overrideValue: Schema.Types.Mixed,
  },
  { _id: false }
);

const pageContentSchema = new Schema(
  {
    pageNumber: Number,
    rawText: String,
    sections: [
      {
        title: String,
        content: String,
        boundingBox: boundingBoxSchema,
      },
    ],
  },
  { _id: false }
);

const tableRowSchema = new Schema({ cells: [String] }, { _id: false });

const entitySchema = new Schema(
  {
    type: String,
    value: String,
    pageNumber: Number,
    boundingBox: boundingBoxSchema,
    confidence: Number,
  },
  { _id: false }
);

// NEW: Cross reference schema
const crossRefSchema = new Schema(
  {
    ref: String,
    target: String,
  },
  { _id: false }
);

// NEW: Extracted clause schema
const extractedClauseSchema = new Schema(
  {
    id: String,
    title: String,
    content: String,
    pageNumber: Number,
    boundingBox: boundingBoxSchema,
    confidenceScore: Number,
    clauseType: { type: String, enum: ["definition", "obligation", "restriction", "right", "termination", "payment", "liability", "confidentiality", "dispute", "general"] },
    linkedClauses: [String],
    crossReferences: [crossRefSchema],
    reviewed: { type: Boolean, default: false },
    overrideContent: String,
  },
  { _id: false }
);

// NEW: Signature block schema
const signatureBlockSchema = new Schema(
  {
    id: String,
    role: { type: String, enum: ["signatory", "witness", "notary", "authorized_representative"] },
    name: String,
    title: String,
    company: String,
    date: String,
    pageNumber: Number,
    boundingBox: boundingBoxSchema,
    confidenceScore: Number,
    reviewed: { type: Boolean, default: false },
  },
  { _id: false }
);

// NEW: Relationship schema
const clauseRelationshipSchema = new Schema(
  {
    clauseId: String,
    text: String,
  },
  { _id: false }
);

const targetSchema = new Schema(
  {
    clauseId: String,
    text: String,
    document: String,
  },
  { _id: false }
);

const relationshipSchema = new Schema(
  {
    id: String,
    type: { type: String, enum: ["references", "modifies", "supersedes", "annex", "appendix", "exhibit", "related"] },
    source: clauseRelationshipSchema,
    target: targetSchema,
    pageNumber: Number,
  },
  { _id: false }
);

// NEW: Cross reference item schema
const crossRefItemSchema = new Schema(
  {
    id: String,
    refType: { type: String, enum: ["section", "article", "clause", "appendix", "exhibit", "schedule", "annex"] },
    refNumber: String,
    targetPageNumber: Number,
    targetSection: String,
    context: String,
    pageNumber: Number,
  },
  { _id: false }
);

const documentStructureSchema = new Schema<IDocumentStructure>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true, unique: true },
    pages: [pageContentSchema],
    sections: [{ title: String, content: String, pageNumber: Number, boundingBox: boundingBoxSchema, level: Number }],
    tables: [
      {
        pageNumber: Number,
        headers: [String],
        rows: [tableRowSchema],
      },
    ],
    entities: [entitySchema],
    extractedFields: [extractedFieldSchema],
    
    // NEW: Enhanced fields
    clauses: [extractedClauseSchema],
    signatures: [signatureBlockSchema],
    relationships: [relationshipSchema],
    crossReferences: [crossRefItemSchema],
    documentType: String,
    
    rawStructure: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
  },
  { timestamps: true }
);

export const DocumentStructureModel: Model<IDocumentStructure> =
  mongoose.models.DocumentStructure ||
  mongoose.model<IDocumentStructure>("DocumentStructure", documentStructureSchema);
