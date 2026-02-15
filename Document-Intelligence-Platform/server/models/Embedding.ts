import mongoose, { Schema, Document, Model } from "mongoose";

export interface IEmbedding extends Document {
  _id: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  chunkId: string;
  sectionTitle?: string;
  pageNumber: number;
  text: string;
  embeddingVector: number[];
  createdAt?: Date;
}

const embeddingSchema = new Schema<IEmbedding>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true },
    chunkId: { type: String, required: true },
    sectionTitle: { type: String },
    pageNumber: { type: Number, required: true },
    text: { type: String, required: true },
    embeddingVector: { type: [Number], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

embeddingSchema.index({ documentId: 1 });
// For vector search: create index on embeddingVector if using MongoDB 7+ $vectorSearch
// embeddingSchema.index({ embeddingVector: "vector" }, { name: "vector_index", dimensions: 768 });

export const EmbeddingModel: Model<IEmbedding> =
  mongoose.models.Embedding || mongoose.model<IEmbedding>("Embedding", embeddingSchema);
