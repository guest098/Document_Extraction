// Re-export user type for compatibility; auth is now JWT-based in server/auth
export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | Date;
};
