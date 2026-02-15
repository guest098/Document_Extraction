import mongoose, { Schema, Document, Model } from "mongoose";

export type DocumentStatus = "pending" | "processing" | "completed" | "failed" | "under_review";

export interface IDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  documentName: string;
  version: string;
  documentType: string;
  category?: string;
  uploadDate: Date;
  riskScore: number;
  status: DocumentStatus;
  filePath: string;
  originalName: string;
  mimeType: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    documentName: { type: String, required: true },
    version: { type: String, default: "1.0" },
    documentType: { type: String, required: true },
    category: { type: String },
    uploadDate: { type: Date, default: Date.now },
    riskScore: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "under_review"],
      default: "pending",
    },
    filePath: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, default: "application/pdf" },
    summary: { type: String },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, uploadDate: -1 });
documentSchema.index({ status: 1 });

export const DocumentModel: Model<IDocument> =
  mongoose.models.Document || mongoose.model<IDocument>("Document", documentSchema);
