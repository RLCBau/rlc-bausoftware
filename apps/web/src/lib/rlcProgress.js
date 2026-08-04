export function rlcProgressStart(id, label) {
    window.dispatchEvent(new CustomEvent("rlc:global-progress", {
        detail: { id, label, progress: 8, status: "running" },
    }));
}
export function rlcProgressSuccess(id, label) {
    window.dispatchEvent(new CustomEvent("rlc:global-progress", {
        detail: { id, label, progress: 100, status: "success" },
    }));
}
export function rlcProgressError(id, label) {
    window.dispatchEvent(new CustomEvent("rlc:global-progress", {
        detail: { id, label, progress: 100, status: "error" },
    }));
}
export async function runRlcAction(id, label, fn) {
    rlcProgressStart(id, label);
    try {
        const result = await Promise.resolve(fn());
        rlcProgressSuccess(id, label);
        return result;
    }
    catch (e) {
        rlcProgressError(id, label);
        throw e;
    }
}
