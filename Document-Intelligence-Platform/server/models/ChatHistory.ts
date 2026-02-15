import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICitation {
  pageNumber: number;
  text: string;
  boundingBox?: number[];
}

export interface IChatHistory extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  documentIds: mongoose.Types.ObjectId[];
  question: string;
  answer: string;
  citations: ICitation[];
  confidence: number;
  riskMode?: boolean;
  timestamp: Date;
}

const citationSchema = new Schema(
  {
    pageNumber: Number,
    text: String,
    boundingBox: [Number],
  },
  { _id: false }
);

const chatHistorySchema = new Schema<IChatHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    documentIds: [{ type: Schema.Types.ObjectId, ref: "Document" }],
    question: { type: String, required: true },
    answer: { type: String, required: true },
    citations: [citationSchema],
    confidence: { type: Number, default: 0 },
    riskMode: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatHistorySchema.index({ userId: 1, timestamp: -1 });
chatHistorySchema.index({ documentIds: 1 });

export const ChatHistoryModel: Model<IChatHistory> =
  mongoose.models.ChatHistory || mongoose.model<IChatHistory>("ChatHistory", chatHistorySchema);
