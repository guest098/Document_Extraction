// Platform auth storage (optional integration).
// The app uses JWT auth from server/auth by default.
export interface IAuthStorage {
  getUser(id: string): Promise<{ id: string; email?: string; firstName?: string; lastName?: string } | undefined>;
  upsertUser(user: { id: string; email?: string; firstName?: string; lastName?: string; profileImageUrl?: string }): Promise<unknown>;
}

class AuthStorage implements IAuthStorage {
  async getUser(): Promise<undefined> {
    return undefined;
  }
  async upsertUser(): Promise<unknown> {
    return {};
  }
}

export const authStorage = new AuthStorage();
