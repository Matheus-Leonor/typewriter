import { nanoid } from 'nanoid';
import { db, Session, SessionPatch } from '../db';

export function generateTitle(content: string): string {
  const words = content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~[\]()]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

  if (words.length === 0) {
    const now = new Date();
    const hhmm = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const ddmm = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `Sessão · ${hhmm} · ${ddmm}`;
  }
  return words.join(' ');
}

export function countWords(content: string): number {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~[\]()]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

class SessionStore {
  async create(contentType: Session['content_type'] = 'free'): Promise<Session> {
    const id = nanoid();
    const title = generateTitle('');
    return db.sessions.create(id, title, contentType);
  }

  async get(id: string): Promise<Session | null> {
    return db.sessions.get(id);
  }

  async update(id: string, patch: SessionPatch): Promise<void> {
    return db.sessions.update(id, patch);
  }

  async list(): Promise<Session[]> {
    return db.sessions.list();
  }

  async search(query: string): Promise<Session[]> {
    return db.sessions.search(query);
  }

  async delete(id: string): Promise<void> {
    return db.sessions.delete(id);
  }
}

export const sessionStore = new SessionStore();
