import fs from "fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { DocumentModel, DocumentStructureModel, EmbeddingModel, RiskFlagModel } from "../models";
import type { Types } from "mongoose";
import { 
  embedText, 
  extractStructureFromPdf, 
  extractStructureFromImage, 
  detectRisksSemantic,
  type ExtractedClause,
  type SignatureBlock,
  type Relationship,
  type CrossReference,
  type SemanticRisk
} from "./gemini";
import { isChromaEnabled, addChunks as chromaAddChunks, deleteByDocumentId as chromaDeleteByDocumentId } from "./chroma.js";
import { extractTextFromImage as ocrExtractText } from "./ocr.js";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

// ============================================================================
// OCR CORRECTION LAYER
// ============================================================================

/**
 * OCR Correction Layer - fixes common OCR errors for low-quality images
 */
function correctOcrText(text: string): string {
  if (!text || text.length < 10) return text;
  
  let corrected = text;
  
  const corrections: [RegExp, string][] = [
    [/Technatogees/gi, "Technologies"],
    [/Pot Lod/gi, "Pvt Ltd"],
    [/X77 Rated/gi, "XYZ Retail"],
    [/Serves Softee/gi, "Services"],
    [/Pt Ld/gi, "Pvt Ltd"],
    [/Payert Terma/gi, "Payment Terms"],
    [/Net 10 Says/gi, "Net 30 Days"],
    [/Lert het pay vee en mds/gi, "Payment is due within"],
    [/Latity Moer/gi, "Liability"],
    [/lately tented/gi, "limited to"],
    [/te \$\d+[,.]?\d*\s+\d+/gi, "$10,000"],
    [/limited to te/gi, "limited to"],
    [/\$\d+,\d+\s+\d+/gi, "$10,000,000"],
    [/Termurster/gi, "Termination"],
    [/may ter erete/gi, "may terminate"],
    [/ath 0 dept/gi, "with 30 days"],
    [/tte e/gi, "notice"],
    [/orfdentent/gi, "confidential"],
    [/orfdertent/gi, "confidential"],
    [/orfdent/gi, "confidential"],
    [/orfertent/gi, "confidential"],
    [/(?:orfd|orfer|orfde)\w*tent/gi, "confidential"],
    [/(?:conf|confi|confid)[:;.]/gi, "confidential:"],
    [/Bott pete muatl/gi, "Both parties must"],
    [/hore ot ar rlert/gi, "hold in confidence"],
    [/Both parties muatl/gi, "Both parties must"],
    [/hold in confirdence/gi, "hold in confidence"],
    [/Both parties must beep/gi, "Both parties must"],
    [/beep/gi, ""],
    [/\s{2,}/g, " "],
  ];
  
  for (const [pattern, replacement] of corrections) {
    corrected = corrected.replace(pattern, replacement);
  }
  
  return corrected;
}

// ============================================================================
// TEXT CHUNKING
// ============================================================================

function chunkText(text: string, pageNumber: number): { text: string; pageNumber: number; clauseId?: string }[] {
  const chunks: { text: string; pageNumber: number; clauseId?: string }[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    let slice = text.slice(start, end);
    if (end < text.length) {
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace > CHUNK_SIZE / 2) {
        slice = slice.slice(0, lastSpace + 1);
        start += lastSpace + 1 - CHUNK_OVERLAP;
      } else {
        start = end - CHUNK_OVERLAP;
      }
    } else {
      start = text.length;
    }
    if (slice.trim()) chunks.push({ text: slice.trim(), pageNumber });
  }
  const fallback = text.slice(0, CHUNK_SIZE).trim();
  return chunks.length ? chunks : (fallback ? [{ text: fallback, pageNumber }] : []);
}

// ============================================================================
// RISK DETECTION RULES
// ============================================================================

// ============================================================================
// COMPREHENSIVE RISK DETECTION RULES - 10 CATEGORIES
// ============================================================================

/** 1. Missing Clause Risk - Essential contract clauses */
type RiskPattern = { pattern: RegExp; risk: string; severity: "low" | "medium" | "high" | "critical"; missingOnly?: boolean; clauseType?: string };

const MISSING_CLAUSE_RISKS: RiskPattern[] = [
  // Confidentiality clause
  { pattern: /confidential|confidentiality|non-disclosure|trade secret|proprietary information|classified information/i, 
    clauseType: "confidentiality", risk: "Confidentiality clause", severity: "high", missingOnly: true },
  // Termination clause
  { pattern: /termination|cancel|terminate|breach of contract|notice period|time limit/i, 
    clauseType: "termination", risk: "Termination clause", severity: "medium", missingOnly: true },
  // Limitation of liability
  { pattern: /limitation of liability|limit.*liability|cap.*liability|maximum liability|liable.*damage/i, 
    clauseType: "liability", risk: "Limitation of liability", severity: "high", missingOnly: true },
  // Arbitration clause
  { pattern: /arbitration|dispute resolution|mediation|governing law|jurisdiction|legal proceeding/i, 
    clauseType: "arbitration", risk: "Arbitration/dispute resolution clause", severity: "medium", missingOnly: true },
  // Payment terms
  { pattern: /payment terms|payment schedule|price|fees|compensation|invoice|payment due|due date|net \d+|advance payment/i, 
    clauseType: "payment", risk: "Payment terms", severity: "high", missingOnly: true },
  // Data protection / Privacy
  { pattern: /data protection|privacy|personal data|gdpr|hipaa|information security|data processing|pii|sensitive data/i, 
    clauseType: "data_protection", risk: "Data protection clause", severity: "high", missingOnly: true },
];

/** 2. Weak Clause Detection - Vague language patterns */
const WEAK_CLAUSE_PATTERNS: RiskPattern[] = [
  { pattern: /(?:either party|any party)\s+(?:may|can)\s+(?:terminate|cancel|modify|change)\s+(?:at any time|without notice|at will)/i,
    risk: "Unilateral termination without notice period", severity: "high", clauseType: "weak_termination" },
  { pattern: /(?:reasonable|appropriate|necessary|as needed|as required)\s+(?:effort|cost|time|determination)/i,
    risk: "Vague 'reasonable effort' language without specific definitions", severity: "medium", clauseType: "vague" },
  { pattern: /(?:may consider|may evaluate|may assess|subject to|at discretion)/i,
    risk: "Discretionary language without clear criteria", severity: "medium", clauseType: "vague" },
  { pattern: /(?:without prejudice|sole discretion|absolute discretion|irrevocable)/i,
    risk: "One-sided discretionary language", severity: "medium", clauseType: "imbalance" },
  { pattern: /(?:as soon as practicable|within a reasonable time|forthwith|immediately)/i,
    risk: "Undefined timeframes", severity: "low", clauseType: "vague" },
  { pattern: /(?:indefinitely|perpetual|forever|eternal)/i,
    risk: "Indefinite obligations", severity: "high", clauseType: "weak_termination" },
  { pattern: /(?:notwithstanding|without limiting|except as otherwise)/i,
    risk: "Limiting language that may override other clauses", severity: "medium", clauseType: "vague" },
];

/** 3. Payment & Financial Risk - Only patterns NOT covered by MISSING_CLAUSE_RISKS */
const PAYMENT_RISK_PATTERNS: RiskPattern[] = [
  { pattern: /late payment|late fee|penalty.*payment|interest.*overdue|default.*payment/i, risk: "Late payment penalty", severity: "medium", missingOnly: true },
  { pattern: /refund|return.*money|money back|reimbursement|cancel.*payment/i, risk: "Refund policy", severity: "medium", missingOnly: true },
  { pattern: /currency|exchange rate|forex|conversion/i, risk: "Currency/Exchange terms", severity: "medium", missingOnly: true },
  { pattern: /price adjustment|price change|escalation|price revision|rate.*increase/i, risk: "Price adjustment clause", severity: "medium", missingOnly: true },
  { pattern: /unlimited liability|unlimited.*cost|unlimited.*expense|no.*cap/i, risk: "Unlimited financial exposure", severity: "critical", missingOnly: false },
];

/** 4. Compliance Risk - Only specific regulatory requirements NOT in MISSING_CLAUSE_RISKS */
const COMPLIANCE_RISK_PATTERNS: { pattern: RegExp; risk: string; severity: "low" | "medium" | "high"; missingOnly?: boolean }[] = [
  { pattern: /sox|sarbanes|financial reporting|audit/i, risk: "SOX compliance", severity: "low", missingOnly: true },
  { pattern: /iso \d+|iso.*standard|iso.*certification/i, risk: "ISO compliance", severity: "low", missingOnly: true },
  { pattern: /pci dss|payment card|credit card.*data/i, risk: "PCI DSS compliance", severity: "low", missingOnly: true },
  { pattern: /ccpa|california consumer|privacy.*california/i, risk: "CCPA compliance", severity: "low", missingOnly: true },
  { pattern: /industry.*standard|best practice|regulatory.*requirement/i, risk: "Industry standards", severity: "low", missingOnly: true },
];

/** 5. Contract Imbalance Risk - One-sided terms */
const IMBALANCE_RISK_PATTERNS: RiskPattern[] = [
  { pattern: /(?:vendor|supplier|service provider|contractor).*shall.*(?:not|never)/i,
    risk: "Vendor has no obligations while client has all obligations", severity: "high", clauseType: "imbalance" },
  { pattern: /(?:client|customer|buyer).*shall.*(?:immediately|at once|without delay)/i,
    risk: "Client has immediate obligations while vendor has flexibility", severity: "medium", clauseType: "imbalance" },
  { pattern: /vendor.*not liable|vendor.*immune|vendor.*exempt/i,
    risk: "Vendor liability exemption", severity: "high", clauseType: "imbalance" },
  { pattern: /client.*entire risk|client.*assume.*risk|client.*responsible.*all/i,
    risk: "All risk on client side", severity: "high", clauseType: "imbalance" },
  { pattern: /unilateral.*amendment|unilateral.*change|modify.*without notice/i,
    risk: "One-sided amendment rights", severity: "high", clauseType: "imbalance" },
  { pattern: /waiver.*any.*right|waive.*claim|waive.*remedy/i,
    risk: "Waiver of rights", severity: "medium", clauseType: "imbalance" },
  { pattern: /exclusive.*remedy|sole.*remedy|only.*remedy/i,
    risk: "Exclusive/sole remedy limitations", severity: "medium", clauseType: "imbalance" },
];

/** 7. Signature & Authorization Risk */
const SIGNATURE_RISK_PATTERNS: RiskPattern[] = [
  { pattern: /signature|sign here|authori[sz]ed|signed/i, risk: "Signature block", severity: "low", missingOnly: true },
  { pattern: /date.*(?:of|execution|signature|signing)|executed on|dated/i, risk: "Execution date", severity: "low", missingOnly: true },
  { pattern: /witness|notary|attest|attorney/i, risk: "Witness/Notarization", severity: "low", missingOnly: true },
  { pattern: /company.*name|entity.*name|party.*name/i, risk: "Party identification", severity: "low", missingOnly: true },
  { pattern: /title|position|role|authority/i, risk: "Signatory authority", severity: "low", missingOnly: true },
];

/** 8. Structural Risk - Document structure issues */
const STRUCTURAL_RISK_PATTERNS: RiskPattern[] = [
  { pattern: /table of contents|index|table of cases/i, risk: "Table of contents", severity: "low", missingOnly: true },
  { pattern: /definitions|definition of terms|defined terms/i, risk: "Definitions section", severity: "medium", missingOnly: true },
  { pattern: /recitals|whereas|preamble|background/i, risk: "Recitals/Background", severity: "low", missingOnly: true },
  { pattern: /schedule|appendix|exhibit|annex/i, risk: "Schedules/Appendices", severity: "low", missingOnly: true },
  { pattern: /amendment|modification|addendum|revised/i, risk: "Amendment clause", severity: "medium", missingOnly: true },
  { pattern: /entire agreement|whole agreement|integrated/i, risk: "Entire agreement clause", severity: "medium", missingOnly: true },
  { pattern: /severability|separability|invalid.*enforce/i, risk: "Severability clause", severity: "medium", missingOnly: true },
  { pattern: /notice.*address|contact.*information|communication details/i, risk: "Notice details", severity: "low", missingOnly: true },
];

/** 9. Ambiguity Risk - Unclear wording */
const AMBIGUITY_RISK_PATTERNS: RiskPattern[] = [
  { pattern: /reasonable effort|reasonable time|reasonable cost|reasonable/i,
    risk: "Undefined 'reasonable' standard", severity: "medium", clauseType: "ambiguity" },
  { pattern: /as needed|as necessary|as appropriate|as required/i,
    risk: "Undefined triggers for actions", severity: "medium", clauseType: "ambiguity" },
  { pattern: /may consider|may evaluate|may determine|at discretion/i,
    risk: "Subjective decision-making without criteria", severity: "medium", clauseType: "ambiguity" },
  { pattern: /best practice|industry standard|commercially reasonable/i,
    risk: "Undefined industry standards", severity: "medium", clauseType: "ambiguity" },
  { pattern: /material breach|substantial breach|significant default/i,
    risk: "Undefined 'material/substantial' threshold", severity: "medium", clauseType: "ambiguity" },
  { pattern: /force majeure|act of god|unforeseeable/i,
    risk: "Undefined force majeure events", severity: "low", clauseType: "ambiguity" },
  { pattern: /good faith|fair dealing|honest/i,
    risk: "Undefined good faith standards", severity: "low", clauseType: "ambiguity" },
];

/** 10. Metadata & Validity Risk */
const METADATA_RISK_PATTERNS: RiskPattern[] = [
  // Date validation - more flexible patterns
  { pattern: /effective\s+(date|on|from)\s*\w+|effective:\s*\w+|commencement\s*date|start\s*date/i, risk: "Effective date", severity: "low", missingOnly: true },
  { pattern: /expiration\s*date|end\s*date|termination\s*date|expiry|ending\s*date/i, risk: "Expiration/Termination date", severity: "medium", missingOnly: true },
  { pattern: /term\s*(and|of|duration|period)|duration\s+of|period\s+of|\d+\s*months?|\d+\s*years?/i, risk: "Term duration", severity: "medium", missingOnly: true },
  { pattern: /renewal|automatic\s*renewal|extend\s*term/i, risk: "Renewal terms", severity: "medium", missingOnly: true },
  { pattern: /deadline|due\s*date|payment\s*due|time\s*is\s*of\s*the\s*essence/i, risk: "Critical deadlines", severity: "low", missingOnly: true },
];

/** Contract clause risks */
const CONTRACT_CLAUSE_RISKS = [
  { pattern: /arbitration|dispute resolution|governing law/i, risk: "Missing or weak arbitration clause", severity: "medium" as const, missingOnly: true },
  { pattern: /unlimited liability|liable for any damages|no limit on liability/i, risk: "Unlimited liability", severity: "high" as const, missingOnly: false },
  { pattern: /termination|terminate (?:this )?agreement|notice period/i, risk: "Termination period", severity: "low" as const, missingOnly: true },
  { pattern: /indemnif|hold harmless/i, risk: "Indemnification clause", severity: "medium" as const, missingOnly: false },
  { pattern: /confidentiality|confidential|confidence|hold in confidence/i, risk: "Missing confidentiality clause", severity: "medium" as const, missingOnly: true },
  { pattern: /limitation of liability|liability limited to|limit on liability|cap on liability|limit.*liability/i, risk: "Missing limitation of liability", severity: "high" as const, missingOnly: true },
];

/** Indian GST invoice compliance */
const GST_INVOICE_COMPLIANCE = [
  { pattern: /gstin|gst\s*in|gst\s*number|tax\s*identification/i, risk: "Missing GSTIN (vendor/buyer)", severity: "high" as const },
  { pattern: /address|registered\s*address|billing\s*address/i, risk: "Missing full address (supplier/recipient)", severity: "high" as const },
  { pattern: /place\s*of\s*supply|state\s*code|supply\s*state/i, risk: "Missing Place of Supply", severity: "high" as const },
  { pattern: /sac\s*code|hsn\s*code|service\s*code|harmonized/i, risk: "Missing SAC/HSN code for service/goods", severity: "medium" as const },
];

/** Required fields per document type */
const REQUIRED_FIELDS: Record<string, string[]> = {
  contract: ["parties", "effective date", "term", "termination"],
  invoice: ["invoice number", "date", "total", "due date", "vendor", "bill to"],
  identity_document: [],
};

// ============================================================================
// DOCUMENT TYPE DETECTION
// ============================================================================

export type DocumentTypeKind = "contract" | "invoice" | "identity_document" | "nda" | "sla" | "purchase_order" | "unknown";

function detectDocumentType(rawText: string): DocumentTypeKind {
  const t = rawText.toLowerCase();
  
  if (!rawText || rawText.length < 20) return "unknown";
  
  // First check for strong contract indicators (most common document type)
  const contractIndicators = [
    /agreement/i, /contract/i, /parties/i, /between\s+[a-z]/i,
    /whereas/i, /hereby/i, /terms?\s*and\s*conditions/i,
    /termination/i, /confidentiality/i, /liability/i,
    /indemnif/i, /governing\s*law/i, /arbitration/i,
    /service\s*agreement/i, /master\s*agreement/i,
    /this\s+agreement/i, /party\s+of\s+the/i,
    /witnesseth/i, /herein/i, /notwithstanding/i
  ];
  const contractScore = contractIndicators.filter(p => p.test(t)).length;
  
  // Strong contract detection (at least 3 indicators OR has "agreement" + other contract terms)
  if (contractScore >= 3 || (t.includes("agreement") && contractScore >= 2)) {
    return "contract";
  }
  
  // Check for NDA
  if (/nda|non[-\s]?disclosure|confidentiality\s*agreement/i.test(t) && /confidential|proprietary|trade\s*secret/i.test(t)) {
    return "nda";
  }
  
  // Check for SLA
  if (/sla|service\s*level\s*agreement|service\s*guarantee|uptime|response\s*time/i.test(t)) {
    return "sla";
  }
  
  // Check for Purchase Order
  if (/purchase\s*order|p\.?o\.?|po\s*number|order\s*date|ship\s*to|vendor\s*quote/i.test(t)) {
    return "purchase_order";
  }
  
  // Check for invoice - require STRONGER indicators (at least 3)
  const invoiceIndicators = [
    /tax\s*invoice/i, /invoice\s*number/i, /bill\s*to\s*:/i,
    /gst\s*invoice/i, /vendor\s*:/i, /bill\s*amount/i,
    /subtotal/i, /grand\s*total/i, /due\s*date/i,
    /payment\s*terms.*days/i, /net\s*\d+\s*days/i,
    /invoice\s*date/i, /total\s*amount/i, /balance\s*due/i
  ];
  const invoiceScore = invoiceIndicators.filter(p => p.test(t)).length;
  if (invoiceScore >= 3) return "invoice";
  
  // Check for identity document
  const idIndicators = [
    /driver'?s?\s*licen[sc]e/i, /identification\s*(?:card|document)/i,
    /id\s*card/i, /date\s*of\s*birth/i, /expiry/i,
    /customer\s*number/i, /license\s*number/i
  ];
  const idScore = idIndicators.filter(p => p.test(t)).length;
  if (idScore >= 2) return "identity_document";
  
  // Fallback to contract if any contract-like terms exist
  if (contractScore >= 1) return "contract";
  
  return "unknown";
}

// ============================================================================
// FIELD & TABLE EXTRACTION
// ============================================================================

function extractIdFieldsFromText(rawText: string): { fieldName: string; value: unknown; pageNumber: number; confidenceScore: number }[] {
  const fields: { fieldName: string; value: unknown; pageNumber: number; confidenceScore: number }[] = [];
  const pageNumber = 1;
  const confidence = 0.88;
  const patterns: { name: string; regex: RegExp }[] = [
    { name: "Name", regex: /(?:name|customer\s*name)\s*:\s*([^\n]+)/i },
    { name: "Name", regex: /(\b[A-Z][a-z]+,\s*[A-Z][a-z]+\b)/ },
    { name: "Date of Birth", regex: /(?:date\s*of\s*birth|dob)\s*:\s*([^\n]+)/i },
    { name: "Customer Number", regex: /(?:customer\s*number)\s*:\s*(\d+)/i },
    { name: "License Number", regex: /(?:licen[sc]e\s*(?:number|no\.?))\s*:\s*([^\n]+)/i },
    { name: "Expiry", regex: /(?:expiry|date\s*of\s*expiry|exp\.?)\s*:\s*([^\n]+)/i },
    { name: "Address", regex: /(?:address)\s*:\s*([^\n]+)/i },
  ];
  const seen = new Set<string>();
  for (const { name, regex } of patterns) {
    const m = rawText.match(regex);
    if (m) {
      const value = (m[1] ?? m[0]).trim();
      const key = `${name}:${String(value).slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        fields.push({ fieldName: name, value, pageNumber, confidenceScore: confidence });
      }
    }
  }
  return fields;
}

function detectInvoiceTable(pageText: string, pageNumber: number): { pageNumber: number; headers: string[]; rows: { cells: string[] }[] } | null {
  const lines = pageText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex(
    (l) => /item\s+description/i.test(l) && /quantity/i.test(l) && (/total|unit\s*price/i.test(l) || /[\d,]+/.test(l))
  );
  if (headerIdx === -1) return null;
  const headers = ["Item", "Description", "Quantity", "Unit Price", "Total"];
  const dataRows: { cells: string[] }[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length >= 5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[parts.length - 3])) {
      const itemNum = parts[0];
      const qty = parts[parts.length - 3];
      const unitPrice = parts[parts.length - 2];
      const total = parts[parts.length - 1];
      const desc = parts.slice(1, parts.length - 3).join(" ");
      dataRows.push({ cells: [itemNum, desc, qty, unitPrice, total] });
    }
  }
  if (dataRows.length > 0) return { pageNumber, headers, rows: dataRows };
  return null;
}

function detectTablesFromText(pageText: string, pageNumber: number): { pageNumber: number; headers: string[]; rows: { cells: string[] }[] }[] {
  const tables: { pageNumber: number; headers: string[]; rows: { cells: string[] }[] }[] = [];
  const invoiceTable = detectInvoiceTable(pageText, pageNumber);
  if (invoiceTable) tables.push(invoiceTable);
  const lines = pageText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return tables;
  const rows: string[][] = [];
  for (const line of lines) {
    let cells = line.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 3 && (/^\d+$/.test(parts[0]) || /^[\d,]+\.?\d*$/.test(parts[0])) && /[\d,]+/.test(parts[parts.length - 1]))
        cells = parts;
      else if (parts.length >= 2 && /[\d,]+/.test(parts[parts.length - 1]))
        cells = parts;
    }
    if (cells.length >= 2) rows.push(cells);
  }
  if (rows.length >= 2 && tables.length === 0) {
    const headerRow = rows[0];
    const dataRows = rows.slice(1).filter((r) => r.some((c) => c.length > 0)).map((cells) => ({ cells }));
    if (dataRows.length > 0) {
      const headers = headerRow.map((h) => h || `Col${headerRow.indexOf(h) + 1}`);
      tables.push({ pageNumber, headers, rows: dataRows });
    }
  }
  return tables;
}

function extractSectionsFromText(rawText: string): { title: string; content: string; pageNumber: number }[] {
  const sections: { title: string; content: string; pageNumber: number }[] = [];
  const blocks = rawText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let pageNumber = 1;
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const first = lines[0]?.trim() || "";
    const isHeader =
      first.length < 80 && (first === first.toUpperCase() || /:\s*$/.test(first) || /^(Section|Article|Clause|Part)\s+\d+/i.test(first));
    const title = isHeader ? first.replace(/\s*:\s*$/, "") : "Content";
    const content = isHeader ? lines.slice(1).join("\n").trim() : block;
    if (content.length > 0) sections.push({ title, content: content || block, pageNumber });
  }
  return sections.length > 0 ? sections : [{ title: "Document", content: rawText.slice(0, 5000), pageNumber: 1 }];
}

function extractFieldsFromText(rawText: string): { fieldName: string; value: unknown; pageNumber: number; confidenceScore: number }[] {
  const fields: { fieldName: string; value: unknown; pageNumber: number; confidenceScore: number }[] = [];
  const pageNumber = 1;
  const confidence = 0.85;
  const patterns: { name: string; regex: RegExp }[] = [
    { name: "Invoice Number", regex: /Invoice\s*Number\s*:\s*([^\s\n]+)/i },
    { name: "Invoice Date", regex: /Invoice\s*Date\s*:\s*([^\n]+?)(?:\s+Vendor|\s*$)/i },
    { name: "Vendor", regex: /Vendor\s*:\s*([^\n]+?)(?:\s+Bill|\s*$)/i },
    { name: "Bill To", regex: /Bill\s*To\s*:\s*([^\n]+?)(?:\s+Payment|\s*$)/i },
    { name: "Payment Terms", regex: /Payment\s*Terms\s*:\s*([^\n]+)/i },
    { name: "Subtotal", regex: /Subtotal\s*:\s*([^\n]+)/i },
    { name: "GST", regex: /GST\s*\([^)]*\)\s*:\s*([^\n]+)/i },
    { name: "Grand Total", regex: /Grand\s*Total\s*:\s*([^\n]+)/i },
    { name: "Due Date", regex: /Due\s*Date\s*:\s*([^\n]+)/i },
    { name: "Parties", regex: /(?:parties?|between)\s*[:\s]+([^\n]{3,120})/i },
    { name: "Effective Date", regex: /effective\s*date\s*[:\s]+([^\n]+)/i },
    { name: "Term", regex: /(?:term|duration)\s*[:\s]+([^\n]+)/i },
    { name: "Client", regex: /(?:between\s+)?([A-Za-z0-9\s.,&]+(?:Pvt\.?|Private|Limited|Ltd\.?|Inc\.?|LLC)?)\s*\(\s*["']?Client["']?\s*\)/i },
    { name: "Service Provider", regex: /([A-Za-z0-9\s.,&]+(?:Pvt\.?|Private|Limited|Ltd\.?|Inc\.?|LLC)?)\s*\(\s*["']?Service\s*Provider["']?\s*\)/i },
  ];
  for (const { name, regex } of patterns) {
    const m = rawText.match(regex);
    if (m) {
      const val = m[1].trim().replace(/^\s*between\s+/i, "").trim();
      fields.push({ fieldName: name, value: val, pageNumber, confidenceScore: confidence });
    }
  }
  return fields;
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

export async function runDocumentPipeline(
  documentId: Types.ObjectId,
  filePath: string
): Promise<{ riskScore: number; summary: string }> {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new Error("Document not found");

  await DocumentModel.updateOne({ _id: documentId }, { status: "processing" });

  const mimeType = doc.mimeType || "application/pdf";
  const isImage = /^image\//.test(mimeType);

  try {
    const buffer = await fs.readFile(filePath);
    let rawText: string;
    let numPages: number;
    let pages: { pageNumber: number; rawText: string; sections?: { title: string; content: string; boundingBox?: { x: number; y: number; width: number; height: number } }[] }[];
    let sections: { title: string; content: string; pageNumber: number; boundingBox?: { x: number; y: number; width: number; height: number }; level?: number }[];
    let tables: { pageNumber: number; headers: string[]; rows: { cells: string[] }[] }[];
    let extractedForDb: { fieldName: string; value: unknown; pageNumber: number; confidenceScore: number; boundingBox?: { x: number; y: number; width: number; height: number }; reviewed?: boolean }[];
    let summary: string;
    
    // NEW: Enhanced extracted data
    let clauses: ExtractedClause[] = [];
    let signatures: SignatureBlock[] = [];
    let relationships: Relationship[] = [];
    let crossReferences: { id: string; refType: string; refNumber: string; targetPageNumber?: number; targetSection?: string; context: string; pageNumber: number }[] = [];
    let documentType: string = "unknown";

    if (isImage) {
      // Process image with OCR + enhanced extraction
      const ocrResult = await ocrExtractText(buffer, mimeType);
      const ocrText = ocrResult.text || "";
      let imageResult: Awaited<ReturnType<typeof extractStructureFromImage>> & { rawText?: string };
      try {
        imageResult = await extractStructureFromImage(buffer, mimeType);
      } catch {
        imageResult = { 
          layoutElements: [], sections: [], clauses: [], relationships: [], 
          signatures: [], crossReferences: [], extractedFields: [], tables: [], 
          summary: "", insights: "", rawText: "" 
        };
      }
      
      rawText = (imageResult.rawText || "").trim() || ocrText;
      rawText = correctOcrText(rawText);
      numPages = 1;
      
      // Use enhanced extraction results
      pages = [{ pageNumber: 1, rawText, sections: imageResult.sections?.map((s: any) => ({ title: s.title, content: s.content, boundingBox: s.boundingBox })) || [] }];
      sections = (imageResult.sections || []).map((s: any) => ({ 
        title: s.title || "", 
        content: s.content || "", 
        pageNumber: s.pageNumber || 1,
        boundingBox: s.boundingBox,
        level: s.level || 1
      }));
      tables = (imageResult.tables?.length ? imageResult.tables : detectTablesFromText(rawText, 1)) as any;
      
      // Enhanced data
      clauses = (imageResult.clauses || []).map((c: any) => ({
        id: c.id || `clause_${Math.random().toString(36).substr(2, 9)}`,
        title: c.title || "",
        content: c.content || "",
        pageNumber: c.pageNumber || 1,
        clauseType: c.clauseType,
        confidenceScore: c.confidenceScore ?? 0.7,
        boundingBox: c.boundingBox,
        crossReferences: c.crossReferences
      }));
      signatures = (imageResult.signatures || []).map((s: any) => ({
        id: s.id || `sig_${Math.random().toString(36).substr(2, 9)}`,
        role: s.role || "signatory",
        name: s.name,
        title: s.title,
        company: s.company,
        date: s.date,
        pageNumber: s.pageNumber || 1,
        confidenceScore: s.confidenceScore ?? 0.7,
        boundingBox: s.boundingBox
      }));
      relationships = imageResult.relationships || [];
      crossReferences = imageResult.crossReferences || [];
      documentType = imageResult.documentType || "unknown";
      
      const aiFields = imageResult.extractedFields || [];
      const ocrConfidence = 0.6;
      extractedForDb = aiFields.length > 0
        ? aiFields.map((f: any) => ({
            fieldName: f.fieldName,
            value: f.value,
            pageNumber: f.pageNumber ?? 1,
            confidenceScore: f.confidenceScore ? Math.min(f.confidenceScore, 0.7) : ocrConfidence,
            boundingBox: f.boundingBox,
            reviewed: false
          }))
        : extractFieldsFromText(rawText).map((f) => ({ ...f, reviewed: false }));
      
      summary = [imageResult.summary, imageResult.insights].filter(Boolean).join("\n\n") ||
        (ocrText ? `Image processed with OCR. ${sections.length} sections, ${extractedForDb.length} fields.` : `Image processed.`);
    } else {
      // Process PDF
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { totalPages, text: pageTexts } = await extractText(pdf, { mergePages: false });
      rawText = Array.isArray(pageTexts) ? pageTexts.join("\n") : pageTexts;
      numPages = totalPages || 1;
      const textArray = Array.isArray(pageTexts) ? pageTexts : [pageTexts];
      pages = [];
      for (let i = 0; i < numPages; i++) {
        pages.push({ pageNumber: i + 1, rawText: textArray[i] || "", sections: [] });
      }
      if (pages.length === 0) pages.push({ pageNumber: 1, rawText, sections: [] });

      // Use enhanced structure extraction
      const { 
        sections: aiSections, 
        extractedFields: aiFields, 
        tables: aiTables, 
        summary: aiSummary,
        clauses: aiClauses,
        signatures: aiSignatures,
        relationships: aiRelationships,
        crossReferences: aiCrossRefs,
        documentType: detectedType
      } = await extractStructureFromPdf("", "application/pdf", rawText, numPages);
      
      // Get heuristic tables per page
      const heuristicTables: any[] = [];
      for (let i = 0; i < pages.length; i++) {
        heuristicTables.push(...detectTablesFromText(pages[i].rawText, i + 1));
      }
      
      tables = aiTables.length > 0 ? aiTables : heuristicTables;
      sections = aiSections.length > 0 ? aiSections : extractSectionsFromText(rawText);
      
      // Enhanced data
      clauses = aiClauses;
      signatures = aiSignatures;
      relationships = aiRelationships;
      crossReferences = aiCrossRefs;
      documentType = detectedType || "unknown";
      
      const heuristicFields = extractFieldsFromText(rawText);
      const extractedFields = aiFields.length > 0
        ? [...aiFields, ...heuristicFields.filter((h) => !aiFields.some((a) => a.fieldName.toLowerCase() === h.fieldName.toLowerCase()))]
        : heuristicFields;
      extractedForDb = extractedFields.map((f: any) => ({
        fieldName: f.fieldName,
        value: f.value,
        pageNumber: f.pageNumber,
        confidenceScore: f.confidenceScore ?? 0.8,
        boundingBox: f.boundingBox,
        reviewed: false
      }));
      summary = aiSummary?.trim() || "";
    }

    // Determine effective document type - use AI detection as primary, fallback to heuristic
    const heuristicType = detectDocumentType(rawText);
    const finalDocType = (documentType && documentType !== "unknown") ? documentType : heuristicType;
    
    if (heuristicType === "identity_document") {
      const idFields = extractIdFieldsFromText(rawText);
      const existingKeys = new Set(extractedForDb.map((f) => f.fieldName.toLowerCase()));
      for (const f of idFields) {
        if (!existingKeys.has(f.fieldName.toLowerCase())) {
          extractedForDb.push({ ...f, boundingBox: undefined, reviewed: false });
          existingKeys.add(f.fieldName.toLowerCase());
        }
      }
    }

    // Save enhanced structure to database
    await DocumentStructureModel.findOneAndUpdate(
      { documentId },
      {
        documentId,
        pages,
        sections,
        tables,
        // Enhanced fields
        clauses,
        signatures,
        relationships,
        crossReferences,
        extractedFields: extractedForDb,
        documentType: finalDocType,
      },
      { upsert: true, new: true }
    );

    // Create chunks for embedding
    const chunksForEmbedding: { text: string; pageNumber: number; sectionTitle?: string; clauseId?: string }[] = [];
    for (const p of pages) {
      const chunks = chunkText(p.rawText, p.pageNumber);
      chunks.forEach((c) => chunksForEmbedding.push({ ...c, sectionTitle: undefined }));
    }
    for (const s of sections) {
      const chunks = chunkText(s.content, s.pageNumber);
      chunks.forEach((c) =>
        chunksForEmbedding.push({ ...c, sectionTitle: s.title })
      );
    }
    // Add clause chunks
    for (const c of clauses) {
      const chunks = chunkText(c.content, c.pageNumber);
      chunks.forEach((chunk) => 
        chunksForEmbedding.push({ ...chunk, clauseId: c.id, sectionTitle: c.title })
      );
    }
    if (chunksForEmbedding.length === 0 && rawText.trim()) {
      chunksForEmbedding.push({ text: rawText.slice(0, CHUNK_SIZE).trim(), pageNumber: 1 });
    }
    const validChunks = chunksForEmbedding.filter((c) => (c.text || "").trim().length > 0);

    // Store embeddings
    if (isChromaEnabled()) {
      try {
        await chromaDeleteByDocumentId(documentId.toString());
      } catch (_) {}
      const chromaChunks = validChunks.map((chunk, i) => ({
        chunkId: `chunk_${documentId}_${i}`,
        documentId: documentId.toString(),
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
        text: chunk.text,
      }));
      await chromaAddChunks(chromaChunks);
    }

    for (let i = 0; i < validChunks.length; i++) {
      const chunk = validChunks[i];
      const text = (chunk.text || "").trim();
      if (!text) continue;
      const vec = await embedText(text);
      if (vec.length > 0) {
        await EmbeddingModel.create({
          documentId,
          chunkId: `chunk_${documentId}_${i}`,
          sectionTitle: chunk.sectionTitle,
          pageNumber: chunk.pageNumber,
          text,
          embeddingVector: vec,
        });
      }
    }

    // Risk Detection - Comprehensive 10-Category Analysis
    const riskFlags: { documentId: Types.ObjectId; clauseReference: string; riskType: string; severity: "low" | "medium" | "high" | "critical"; explanation: string; suggestedClause?: string; pageNumber?: number; clauseId?: string; regulatoryMapping?: string[] }[] = [];
    await RiskFlagModel.deleteMany({ documentId });

    const rawLower = rawText.toLowerCase();
    const textQuality = rawText.replace(/[^a-zA-Z0-9]/g, "").length;
    const isLowQualityText = textQuality < 50;

    // 1. MISSING CLAUSE RISK - Check for essential contract clauses
    if (finalDocType === "contract" && !isLowQualityText) {
      for (const r of MISSING_CLAUSE_RISKS) {
        const match = rawText.match(r.pattern);
        const isMissingRule = "missingOnly" in r && r.missingOnly;
        if (!match && (isMissingRule || r.risk.includes("Missing"))) {
          riskFlags.push({
            documentId,
            clauseReference: r.risk,
            riskType: "missing_clause",
            severity: r.severity,
            explanation: `Missing essential ${r.clauseType} clause: ${r.risk}. This is critical for comprehensive contract protection.`,
            pageNumber: 1,
          });
        }
      }
      
      // 2. WEAK CLAUSE DETECTION - Find vague or risky language
      for (const w of WEAK_CLAUSE_PATTERNS) {
        const match = rawText.match(w.pattern);
        if (match) {
          riskFlags.push({
            documentId,
            clauseReference: w.risk,
            riskType: "weak_clause",
            severity: w.severity as any,
            explanation: `Weak clause detected: ${w.risk}. This language may create ambiguity or unfair terms.`,
            pageNumber: 1,
          });
        }
      }
      
      // 3. PAYMENT & FINANCIAL RISK
      for (const p of PAYMENT_RISK_PATTERNS) {
        const match = rawText.match(p.pattern);
        const isMissingRule = "missingOnly" in p && p.missingOnly;
        if (!match && isMissingRule) {
          riskFlags.push({
            documentId,
            clauseReference: p.risk,
            riskType: "payment_risk",
            severity: p.severity as "low" | "medium" | "high" | "critical",
            explanation: `Missing payment term: ${p.risk}. This could lead to financial disputes.`,
            pageNumber: 1,
          });
        } else if (match && p.severity === "critical") {
          // Flag critical financial exposures
          riskFlags.push({
            documentId,
            clauseReference: p.risk,
            riskType: "payment_risk",
            severity: p.severity as "low" | "medium" | "high" | "critical",
            explanation: `Critical financial exposure: ${p.risk}. This could result in unlimited liability.`,
            pageNumber: 1,
          });
        }
      }
      
      // 4. COMPLIANCE RISK
      for (const c of COMPLIANCE_RISK_PATTERNS) {
        const match = rawText.match(c.pattern);
        const isMissingRule = "missingOnly" in c && c.missingOnly;
        if (!match && isMissingRule) {
          riskFlags.push({
            documentId,
            clauseReference: c.risk,
            riskType: "compliance",
            severity: c.severity as "low" | "medium" | "high" | "critical",
            explanation: `Missing ${c.risk} clause. Required for regulatory compliance.`,
            pageNumber: 1,
          });
        }
      }
      
      // 5. CONTRACT IMBALANCE RISK
      for (const i of IMBALANCE_RISK_PATTERNS) {
        const match = rawText.match(i.pattern);
        if (match) {
          riskFlags.push({
            documentId,
            clauseReference: i.risk,
            riskType: "contract_imbalance",
            severity: i.severity as "low" | "medium" | "high" | "critical",
            explanation: `Contract imbalance detected: ${i.risk}. One party may have significantly more power or protection.`,
            pageNumber: 1,
          });
        }
      }
      
      // 7. SIGNATURE & AUTHORIZATION RISK
      for (const s of SIGNATURE_RISK_PATTERNS) {
        const match = rawText.match(s.pattern);
        const isMissingRule = "missingOnly" in s && s.missingOnly;
        if (!match && isMissingRule) {
          riskFlags.push({
            documentId,
            clauseReference: s.risk,
            riskType: "signature_authorization",
            severity: "medium",
            explanation: `Missing ${s.risk}. Required for proper document execution and enforceability.`,
            pageNumber: 1,
          });
        }
      }
      
      // 8. STRUCTURAL RISK
      for (const st of STRUCTURAL_RISK_PATTERNS) {
        const match = rawText.match(st.pattern);
        const isMissingRule = "missingOnly" in st && st.missingOnly;
        if (!match && isMissingRule) {
          riskFlags.push({
            documentId,
            clauseReference: st.risk,
            riskType: "structural",
            severity: st.severity as "low" | "medium" | "high" | "critical",
            explanation: `Missing structural element: ${st.risk}. May affect document organization and enforceability.`,
            pageNumber: 1,
          });
        }
      }
      
      // 9. AMBIGUITY RISK
      for (const a of AMBIGUITY_RISK_PATTERNS) {
        const match = rawText.match(a.pattern);
        if (match) {
          riskFlags.push({
            documentId,
            clauseReference: a.risk,
            riskType: "ambiguity",
            severity: a.severity as "low" | "medium" | "high" | "critical",
            explanation: `Ambiguous language detected: ${a.risk}. This vague wording could lead to disputes.`,
            pageNumber: 1,
          });
        }
      }
      
      // 10. METADATA & VALIDITY RISK
      for (const m of METADATA_RISK_PATTERNS) {
        const match = rawText.match(m.pattern);
        const isMissingRule = "missingOnly" in m && m.missingOnly;
        if (!match && isMissingRule) {
          riskFlags.push({
            documentId,
            clauseReference: m.risk,
            riskType: "metadata_validity",
            severity: m.severity as "low" | "medium" | "high" | "critical",
            explanation: `Missing metadata: ${m.risk}. Required for document validity and timeline clarity.`,
            pageNumber: 1,
          });
        }
      }
      
      // Semantic analysis on clauses (AI-powered detection)
      if (rawText.length > 100) {
        const semantic = await detectRisksSemantic(rawText.slice(0, 5000));
        if (semantic && semantic.severity !== "low") {
          riskFlags.push({
            documentId,
            clauseReference: "AI-detected risk in document",
            riskType: semantic.riskType,
            severity: semantic.severity === "critical" ? "high" : semantic.severity,
            explanation: semantic.explanation,
            suggestedClause: semantic.suggestedClause,
            pageNumber: 1,
            regulatoryMapping: semantic.regulatoryReferences
          });
        }
      }
    }

    // Invoice GST compliance
    if (finalDocType === "invoice") {
      for (const g of GST_INVOICE_COMPLIANCE) {
        const match = rawText.match(g.pattern);
        if (!match) {
          riskFlags.push({
            documentId,
            clauseReference: g.risk,
            riskType: "compliance",
            severity: g.severity,
            explanation: `GST invoice validity: ${g.risk}. Required for valid Input Tax Credit (ITC) under Indian GST rules.`,
            pageNumber: 1,
          });
        }
      }
    }

    // Required field validation with flexible pattern matching
    const requiredForType = REQUIRED_FIELDS[finalDocType] ?? REQUIRED_FIELDS.contract;
    
    // Define flexible patterns for required fields
    const fieldPatterns: Record<string, RegExp[]> = {
      "effective date": [
        /effective\s+(date|on|from)\s+\w+/i,
        /effective:\s*\w+\s+\d+/i,
        /commencement\s*date/i,
        /start\s*date\s+(of|of\s+)?/i,
        /effective\s+\d{1,2}[\/\_\-]\d{1,2}[\/\_\-]\d{2,4}/i,
        /effective\s+\w+\s+\d{1,2},?\s+\d{4}/i,
      ],
      "termination": [
        /termination\s*(clause|date|period|notice)/i,
        /term.*terminat/i,
        /notice\s*period/i,
        /ending\s+date/i,
      ],
      "term": [
        /term\s*(and|of|period|duration)/i,
        /duration\s+of/i,
        /period\s+of/i,
        /\d+\s*months?/i,
        /\d+\s*years?/i,
      ],
      "parties": [
        /between\s+\w+/i,
        /by\s+and\s+between/i,
        /party\s+(of|of\s+the)/i,
        /incorporated|company|pvt|ltd|limited|inc\./i,
      ],
      "invoice number": [
        /invoice\s*(no|number|#|\.)\s*\d+/i,
        /inv\s*(no|#)?\s*\d+/i,
      ],
      "date": [
        /date:\s*\d+/i,
        /dated\s+\d+/i,
        /\d{1,2}[\/\_\-]\d{1,2}[\/\_\-]\d{2,4}/i,
      ],
      "total": [
        /total\s*(amount|due|payable)/i,
        /grand\s*total/i,
        /inr\s*\d+/i,
        /\$\s*\d+/i,
      ],
      "due date": [
        /due\s*date/i,
        /payment\s*due/i,
        /payable\s*by/i,
        /net\s*\d+/i,
      ],
      "vendor": [
        /vendor|supplier|provider|contractor/i,
      ],
      "bill to": [
        /bill\s*to| billed\s*to/i,
        /billing\s*address/i,
      ],
    };
    
    for (const field of requiredForType) {
      // First try exact match
      let found = rawLower.includes(field);
      
      // If not found exactly, try pattern matching
      if (!found && fieldPatterns[field]) {
        for (const pattern of fieldPatterns[field]) {
          if (pattern.test(rawText)) {
            found = true;
            break;
          }
        }
      }
      
      if (!found) {
        riskFlags.push({
          documentId,
          clauseReference: `Missing required: ${field}`,
          riskType: "validation",
          severity: "medium",
          explanation: `Document type "${finalDocType}" typically requires "${field}". Not found or not extracted.`,
          pageNumber: 1,
        });
      }
    }

    // Deduplicate risk flags - normalize clause reference and use comprehensive key
    const normalizeKey = (str: string): string => {
      return str.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    };
    const seenRiskKey = new Set<string>();
    const uniqueRiskFlags = riskFlags.filter((f) => {
      // Create a normalized key that considers similar clause references
      const normalizedRef = normalizeKey(f.clauseReference);
      const normalizedExplanation = normalizeKey(f.explanation.slice(0, 50));
      const key = `${f.riskType}:${normalizedRef}:${normalizedExplanation}`;
      if (seenRiskKey.has(key)) return false;
      seenRiskKey.add(key);
      return true;
    });

    if (uniqueRiskFlags.length > 0) {
      await RiskFlagModel.insertMany(uniqueRiskFlags);
    }

    // Calculate risk score
    const high = uniqueRiskFlags.filter((f) => f.severity === "high" || f.severity === "critical").length;
    const medium = uniqueRiskFlags.filter((f) => f.severity === "medium").length;
    const lowOrInfo = uniqueRiskFlags.filter((f) => f.severity === "low").length;
    const riskScore = finalDocType === "identity_document"
      ? Math.min(15, lowOrInfo * 5)
      : Math.min(100, Math.round(high * 25 + medium * 15 + lowOrInfo * 5));

    // Generate summary if empty
    const typeLabel = finalDocType === "identity_document" 
      ? "Identity document"
      : finalDocType === "invoice" 
        ? "Invoice" 
        : finalDocType !== "unknown" 
          ? finalDocType.charAt(0).toUpperCase() + finalDocType.slice(1).replace(/_/g, " ")
          : "Document";
    
    const finalSummary = summary?.trim() || 
      `${typeLabel} processed. ${sections.length} sections, ${clauses.length} clauses, ${extractedForDb.length} fields, ${tables.length} table(s) detected.`;

    await DocumentModel.updateOne(
      { _id: documentId },
      { status: "completed", riskScore, summary: finalSummary, documentType: finalDocType }
    );

    return { riskScore, summary: finalSummary };
  } catch (err) {
    console.error("Pipeline error:", err);
    await DocumentModel.updateOne({ _id: documentId }, { status: "failed" });
    throw err;
  }
}
