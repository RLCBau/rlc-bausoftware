import {
  parseRlcRegie,
  parseRlcLieferschein,
  parseRlcFotos,
} from "./rlcKiFieldParser";

export type RlcKiModuleActionPayload = {
  screen?: string;
  projectId?: string;
  projectCode?: string;
  title?: string;
  input?: string;
  contextMessage?: string;

  // RLC_KI_GLOBAL_FIELD_PATCHES_V1
  fieldPatches?: any;
  extractedFields?: any;
  parsedModule?: any;
};

export type RlcKiModuleActionResult = {
  ok: boolean;
  handled?: boolean;
  message?: string;
};

type Handler = (
  payload: RlcKiModuleActionPayload
) => Promise<RlcKiModuleActionResult> | RlcKiModuleActionResult;

const handlers = new Map<string, Handler>();

function norm(x: any) {
  return String(x || "").trim();
}

function low(x: any) {
  return norm(x).toLowerCase();
}

function hasUsefulFields(x: any) {
  if (!x || typeof x !== "object") return false;
  return Object.values(x).some((v: any) => {
    if (Array.isArray(v)) return v.length > 0;
    return String(v ?? "").trim().length > 0;
  });
}

function buildCentralFieldPatches(payload: RlcKiModuleActionPayload) {
  const screen = low(payload.screen);
  const input = norm(payload.input || payload.contextMessage);

  if (!input) return null;

  try {
    if (screen.includes("regie")) {
      const parsed = parseRlcRegie(input);
      return hasUsefulFields(parsed) ? parsed : null;
    }

    if (screen.includes("lieferschein")) {
      const parsed = parseRlcLieferschein(input);
      return hasUsefulFields(parsed) ? parsed : null;
    }

    if (
      screen.includes("photo") ||
      screen.includes("foto") ||
      screen.includes("photosnotes")
    ) {
      const parsed = parseRlcFotos(input);
      return hasUsefulFields(parsed) ? parsed : null;
    }
  } catch (e) {
    console.warn("RLC_KI_GLOBAL_FIELD_PATCHES_PARSE_ERROR", e);
  }

  return null;
}

function enrichPayload(payload: RlcKiModuleActionPayload): RlcKiModuleActionPayload {
  const already =
    payload.fieldPatches ||
    payload.extractedFields ||
    payload.parsedModule;

  if (hasUsefulFields(already)) {
    return {
      ...payload,
      fieldPatches: payload.fieldPatches || already,
      extractedFields: payload.extractedFields || already,
      parsedModule: payload.parsedModule || already,
    };
  }

  const parsed = buildCentralFieldPatches(payload);

  if (!parsed) return payload;

  return {
    ...payload,
    fieldPatches: parsed,
    extractedFields: parsed,
    parsedModule: parsed,
  };
}

export function registerRlcKiModuleHandler(screen: string, handler: Handler) {
  const key = norm(screen);
  if (!key) return () => {};

  handlers.set(key, handler);

  return () => {
    const current = handlers.get(key);
    if (current === handler) handlers.delete(key);
  };
}

export async function tryRunRlcKiModuleAction(
  payload: RlcKiModuleActionPayload
): Promise<RlcKiModuleActionResult> {
  const screen = norm(payload.screen);
  if (!screen) return { ok: false, handled: false, message: "NO_SCREEN" };

  const enrichedPayload = enrichPayload(payload);

  const direct = handlers.get(screen);
  if (direct) return await direct(enrichedPayload);

  for (const [key, handler] of handlers.entries()) {
    if (screen.includes(key) || key.includes(screen)) {
      return await handler(enrichedPayload);
    }
  }

  return { ok: false, handled: false, message: "NO_MODULE_HANDLER" };
}
