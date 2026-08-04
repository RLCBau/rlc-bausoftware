import { KThread, KMessage, KAttachment } from "./types";

const KEY = "rlc-komms-db";

/* ================= LOAD / SAVE ================= */

function load(): KThread[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function save(data: KThread[]) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

/* ================= HELPERS ================= */

function normalizeThread(t: KThread): KThread {
  return {
    id: t.id || crypto.randomUUID(),
    subject: t.subject || "",
    projectId: (t as any).projectId || undefined, // future API ready
    participants: Array.isArray(t.participants) ? t.participants : [],
    messages: Array.isArray(t.messages) ? t.messages : [],
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
    unreadCount: Number.isFinite(t.unreadCount) ? t.unreadCount : 0,
    updatedAt: t.updatedAt || Date.now(),
  };
}

/* ================= DB ================= */

export const KommsDB = {
  list(): KThread[] {
    return load()
      .map(normalizeThread)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  createThread(projectId?: string): KThread {
    const thread: KThread = normalizeThread({
      id: crypto.randomUUID(),
      subject: "",
      projectId,
      participants: [],
      messages: [],
      attachments: [],
      unreadCount: 0,
      updatedAt: Date.now(),
    } as any);

    const all = load();
    all.push(thread);
    save(all);

    return thread;
  },

  removeThread(id: string) {
    const all = load().filter((x) => x.id !== id);
    save(all);
  },

  upsertThread(thread: KThread) {
    const t = normalizeThread(thread);

    const all = load();
    const index = all.findIndex((x) => x.id === t.id);

    if (index >= 0) {
      all[index] = t;
    } else {
      all.push(t);
    }

    save(all);
    return t;
  },

  addMessage(threadId: string, msg: KMessage) {
    const all = load();
    const index = all.findIndex((x) => x.id === threadId);

    if (index === -1) return;

    const t = normalizeThread(all[index]);

    const message: KMessage = {
      ...msg,
      id: msg.id || crypto.randomUUID(),
      createdAt: (msg as any).createdAt || Date.now(),
    } as any;

    t.messages = [message, ...(t.messages ?? [])];
    t.unreadCount = 0;
    t.updatedAt = Date.now();

    all[index] = t;
    save(all);

    return message;
  },

  markAsRead(threadId: string) {
    const all = load();
    const index = all.findIndex((x) => x.id === threadId);
    if (index === -1) return;

    const t = normalizeThread(all[index]);
    t.unreadCount = 0;

    all[index] = t;
    save(all);
  },

  async attach(threadId: string, file: File): Promise<KAttachment | null> {
    const all = load();
    const index = all.findIndex((x) => x.id === threadId);
    if (index === -1) return null;

    const t = normalizeThread(all[index]);

    const buf = await file.arrayBuffer();
    const blob = new Blob([buf], { type: file.type });

    const dataURL = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(blob);
    });

    const att: KAttachment = {
      id: crypto.randomUUID(),
      name: file.name,
      mime: file.type,
      size: file.size,
      dataURL,
    };

    t.attachments = [att, ...(t.attachments ?? [])];
    t.updatedAt = Date.now();

    all[index] = t;
    save(all);

    return att;
  },
};





