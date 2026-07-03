import { CalEvent } from "./types";

const KEY = "rlc-calendar-db";

function load(): CalEvent[] {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as CalEvent[]) : [];
  } catch {
    return [];
  }
}

function save(data: CalEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function parseIcsDate(value?: string): string {
  if (!value) return new Date().toISOString();

  const v = value.trim();

  // YYYYMMDD
  if (/^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    return new Date(Date.UTC(y, m, d, 12, 0, 0)).toISOString();
  }

  // YYYYMMDDTHHMMSSZ
  if (/^\d{8}T\d{6}Z$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    return new Date(Date.UTC(y, m, d, hh, mm, ss)).toISOString();
  }

  // YYYYMMDDTHHMMSS
  if (/^\d{8}T\d{6}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    return new Date(y, m, d, hh, mm, ss).toISOString();
  }

  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return new Date().toISOString();
}

function formatIcsDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function unescapeIcsText(s?: string): string {
  if (!s) return "";
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function unfoldIcsLines(txt: string): string[] {
  const raw = txt.split(/\r?\n/);
  const lines: string[] = [];

  for (const line of raw) {
    if (!line) {
      lines.push("");
      continue;
    }

    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  return lines;
}

export const CalendarDB = {
  list(): CalEvent[] {
    return load().sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  },

  blank(): CalEvent {
    const now = new Date();
    const later = new Date(now.getTime() + 3600000);

    return {
      id: crypto.randomUUID(),
      title: "",
      start: now.toISOString(),
      end: later.toISOString(),
      attendees: [],
    };
  },

  upsert(e: CalEvent) {
    const all = load();
    const i = all.findIndex((x) => x.id === e.id);
    const next: CalEvent = {
      ...e,
      attendees: Array.isArray(e.attendees) ? e.attendees : [],
    };

    if (i >= 0) all[i] = next;
    else all.push(next);

    save(all);
  },

  remove(id: string) {
    save(load().filter((e) => e.id !== id));
  },

  importICS(txt: string) {
    const events: CalEvent[] = [];
    const lines = unfoldIcsLines(txt);
    let cur: Record<string, string[]> | null = null;

    for (const line of lines) {
      if (line === "BEGIN:VEVENT") {
        cur = {};
        continue;
      }

      if (line === "END:VEVENT") {
        if (cur) {
          const title = unescapeIcsText(cur.SUMMARY?.[0] || "");
          const start = parseIcsDate(cur.DTSTART?.[0]);
          const end = parseIcsDate(cur.DTEND?.[0] || cur.DTSTART?.[0]);
          const location = unescapeIcsText(cur.LOCATION?.[0] || "");
          const notes = unescapeIcsText(cur.DESCRIPTION?.[0] || "");
          const projectId = unescapeIcsText(cur["X-RLC-PROJECTID"]?.[0] || "");
          const attendees = (cur.ATTENDEE || [])
            .map((v) => {
              const mail = v.replace(/^mailto:/i, "").trim();
              return mail || "";
            })
            .filter(Boolean);

          if (title || cur.DTSTART?.[0]) {
            events.push({
              id: crypto.randomUUID(),
              title: title || "(ohne Titel)",
              start,
              end,
              location: location || undefined,
              notes: notes || undefined,
              projectId: projectId || undefined,
              attendees,
            });
          }
        }

        cur = null;
        continue;
      }

      if (!cur) continue;

      const idx = line.indexOf(":");
      if (idx <= 0) continue;

      const rawKey = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      const key = rawKey.split(";")[0].trim().toUpperCase();

      if (!cur[key]) cur[key] = [];
      cur[key].push(value);
    }

    if (events.length === 0) return 0;

    const all = load();
    all.push(...events);
    save(all);
    return events.length;
  },

  exportICS(evts: CalEvent[]) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RLC Bausoftware//Kalender//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const e of evts) {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + e.id);
      lines.push("DTSTAMP:" + formatIcsDate(new Date().toISOString()));
      lines.push("DTSTART:" + formatIcsDate(e.start));
      lines.push("DTEND:" + formatIcsDate(e.end));
      lines.push("SUMMARY:" + escapeIcsText(e.title || "(ohne Titel)"));

      if (e.location) lines.push("LOCATION:" + escapeIcsText(e.location));
      if (e.notes) lines.push("DESCRIPTION:" + escapeIcsText(e.notes));
      if (e.projectId) lines.push("X-RLC-PROJECTID:" + escapeIcsText(e.projectId));

      for (const attendee of e.attendees || []) {
        if (attendee?.trim()) {
          lines.push("ATTENDEE:mailto:" + attendee.trim());
        }
      }

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  },
};





