export type RlcKiModuleActionPayload = {
  screen?: string;
  projectId?: string;
  projectCode?: string;
  title?: string;
  input?: string;
  contextMessage?: string;
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

  const direct = handlers.get(screen);
  if (direct) return await direct(payload);

  for (const [key, handler] of handlers.entries()) {
    if (screen.includes(key) || key.includes(screen)) {
      return await handler(payload);
    }
  }

  return { ok: false, handled: false, message: "NO_MODULE_HANDLER" };
}
