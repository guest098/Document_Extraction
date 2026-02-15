import mongoose, { Schema, Document, Model } from "mongoose";

export type RiskSeverity = "low" | "medium" | "high";

export interface IRiskFlag extends Document {
  _id: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  clauseReference: string;
  riskType: string;
  severity: RiskSeverity;
  explanation: string;
  suggestedClause?: string;
  regulatoryMapping?: string[];
  pageNumber?: number;
  createdAt: Date;
}

const riskFlagSchema = new Schema<IRiskFlag>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true },
    clauseReference: { type: String, required: true },
    riskType: { type: String, required: true },
    severity: { type: String, enum: ["low", "medium", "high"], required: true },
    explanation: { type: String, required: true },
    suggestedClause: { type: String },
    regulatoryMapping: [String],
    pageNumber: { type: Number },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

riskFlagSchema.index({ documentId: 1 });
riskFlagSchema.index({ severity: 1 });

export const RiskFlagModel: Model<IRiskFlag> =
  mongoose.models.RiskFlag || mongoose.model<IRiskFlag>("RiskFlag", riskFlagSchema);
