import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { 
  documents, documentVersions, chatHistory,
  type Document, type DocumentVersion, type ChatMessage,
  type CreateDocumentRequest
} from "@shared/schema";

export interface IStorage {
  // Documents
  createDocument(doc: CreateDocumentRequest & { userId: string, fileUrl: string, extractedData: any, riskScore: number, summary: string }): Promise<Document>;
  getDocuments(userId: string): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;

  // Versions
  createDocumentVersion(version: Partial<DocumentVersion> & { documentId: number, versionNumber: number }): Promise<DocumentVersion>;
  getDocumentVersions(documentId: number): Promise<DocumentVersion[]>;

  // Chat
  createChatMessage(message: Partial<ChatMessage> & { documentId: number, userId: string, role: string, content: string }): Promise<ChatMessage>;
  getChatHistory(documentId: number): Promise<ChatMessage[]>;
}

export class DatabaseStorage implements IStorage {
  // Documents
  async createDocument(doc: CreateDocumentRequest & { userId: string, fileUrl: string, extractedData: any, riskScore: number, summary: string }): Promise<Document> {
    const [newDoc] = await db.insert(documents).values(doc).returning();
    return newDoc;
  }

  async getDocuments(userId: string): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.createdAt));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Versions
  async createDocumentVersion(version: Partial<DocumentVersion> & { documentId: number, versionNumber: number }): Promise<DocumentVersion> {
    // @ts-ignore
    const [newVersion] = await db.insert(documentVersions).values(version).returning();
    return newVersion;
  }

  async getDocumentVersions(documentId: number): Promise<DocumentVersion[]> {
    return await db.select().from(documentVersions).where(eq(documentVersions.documentId, documentId)).orderBy(desc(documentVersions.versionNumber));
  }

  // Chat
  async createChatMessage(message: Partial<ChatMessage> & { documentId: number, userId: string, role: string, content: string }): Promise<ChatMessage> {
    // @ts-ignore
    const [newMessage] = await db.insert(chatHistory).values(message).returning();
    return newMessage;
  }

  async getChatHistory(documentId: number): Promise<ChatMessage[]> {
    return await db.select().from(chatHistory).where(eq(chatHistory.documentId, documentId)).orderBy(chatHistory.createdAt);
  }
}

export const storage = new DatabaseStorage();
