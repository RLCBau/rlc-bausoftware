export type RlcProgressStatus = "running" | "success" | "error";

export type RlcProgressPayload = {
  id: string;
  label: string;
  progress?: number;
  status?: RlcProgressStatus;
};

export function rlcProgressStart(id: string, label: string) {
  window.dispatchEvent(new CustomEvent<RlcProgressPayload>("rlc:global-progress", {
    detail: { id, label, progress: 8, status: "running" },
  }));
}

export function rlcProgressSuccess(id: string, label: string) {
  window.dispatchEvent(new CustomEvent<RlcProgressPayload>("rlc:global-progress", {
    detail: { id, label, progress: 100, status: "success" },
  }));
}

export function rlcProgressError(id: string, label: string) {
  window.dispatchEvent(new CustomEvent<RlcProgressPayload>("rlc:global-progress", {
    detail: { id, label, progress: 100, status: "error" },
  }));
}

export async function runRlcAction<T>(
  id: string,
  label: string,
  fn: () => T | Promise<T>
): Promise<T> {
  rlcProgressStart(id, label);

  try {
    const result = await Promise.resolve(fn());
    rlcProgressSuccess(id, label);
    return result;
  } catch (e) {
    rlcProgressError(id, label);
    throw e;
  }
}
