import OpenAI from "openai";

export type RlcAiMode = "HYBRID" | "LOCAL" | "OPENAI";
export type RlcAiProvider = "openai" | "ollama";
export type RlcAiPurpose =
  | "copilot"
  | "kalkulation"
  | "extraction"
  | "classification"
  | "generic";

export type RlcAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RlcAiTextRequest = {
  messages: RlcAiMessage[];
  purpose?: RlcAiPurpose;
  model?: string;
  temperature?: number;
  responseFormat?: "text" | "json";
  maxTokens?: number;
  timeoutMs?: number;
};

export type RlcAiTextResult = {
  text: string;
  provider: RlcAiProvider;
  model: string;
  mode: RlcAiMode;
  fallbackUsed: boolean;
  latencyMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

type RuntimeState = {
  openAiFailures: number;
  openAiCircuitOpenUntil: number;
  lastProvider: RlcAiProvider | null;
  lastModel: string | null;
  lastFallbackUsed: boolean;
  lastError: string | null;
  lastRequestAt: string | null;
};

const runtimeState: RuntimeState = {
  openAiFailures: 0,
  openAiCircuitOpenUntil: 0,
  lastProvider: null,
  lastModel: null,
  lastFallbackUsed: false,
  lastError: null,
  lastRequestAt: null,
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function getRlcAiMode(): RlcAiMode {
  const mode = clean(process.env.RLC_AI_MODE).toUpperCase();
  if (mode === "LOCAL" || mode === "OPENAI" || mode === "HYBRID") {
    return mode;
  }
  return "HYBRID";
}

export function getOpenAiModel(purpose: RlcAiPurpose = "generic"): string {
  const byPurpose: Partial<Record<RlcAiPurpose, string | undefined>> = {
    copilot: process.env.OPENAI_MODEL_SUPPORT,
    kalkulation: process.env.OPENAI_KALKULATION_MODEL,
    extraction: process.env.OPENAI_MODEL_EXTRACTION,
    classification: process.env.OPENAI_MODEL_CLASSIFICATION,
  };

  return (
    clean(byPurpose[purpose]) ||
    clean(process.env.OPENAI_MODEL) ||
    "gpt-4o-mini"
  );
}

export function getOllamaModel(purpose: RlcAiPurpose = "generic"): string {
  const byPurpose: Partial<Record<RlcAiPurpose, string | undefined>> = {
    copilot: process.env.OLLAMA_MODEL_COPILOT,
    kalkulation: process.env.OLLAMA_MODEL_KALKULATION,
    extraction: process.env.OLLAMA_MODEL_EXTRACTION,
    classification: process.env.OLLAMA_MODEL_CLASSIFICATION,
  };

  return (
    clean(byPurpose[purpose]) ||
    clean(process.env.OLLAMA_MODEL) ||
    "qwen3.5:2b-q4_K_M"
  );
}

function ollamaBaseUrl(): string {
  return (clean(process.env.OLLAMA_BASE_URL) || "http://ollama:11434").replace(
    /\/$/,
    ""
  );
}

function safeError(error: unknown): string {
  const value = clean((error as any)?.message || error || "KI request failed");
  return value.slice(0, 500);
}

function isGpt56Model(model: string): boolean {
  return /^gpt-5\.6(?:-|$)/i.test(model);
}

function stripThinking(text: string): string {
  return clean(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function isOpenAiCircuitOpen(): boolean {
  return runtimeState.openAiCircuitOpenUntil > Date.now();
}

function recordOpenAiSuccess() {
  runtimeState.openAiFailures = 0;
  runtimeState.openAiCircuitOpenUntil = 0;
}

function recordOpenAiFailure(error: unknown) {
  runtimeState.openAiFailures += 1;
  runtimeState.lastError = safeError(error);

  const threshold = envNumber("RLC_AI_CIRCUIT_FAILURES", 2, 1, 20);
  if (runtimeState.openAiFailures >= threshold) {
    const cooldownMs = envNumber(
      "RLC_AI_CIRCUIT_COOLDOWN_MS",
      60_000,
      5_000,
      15 * 60_000
    );
    runtimeState.openAiCircuitOpenUntil = Date.now() + cooldownMs;
  }
}

function recordResult(result: RlcAiTextResult) {
  runtimeState.lastProvider = result.provider;
  runtimeState.lastModel = result.model;
  runtimeState.lastFallbackUsed = result.fallbackUsed;
  runtimeState.lastError = null;
  runtimeState.lastRequestAt = new Date().toISOString();
}

async function completeWithOpenAi(
  request: RlcAiTextRequest
): Promise<RlcAiTextResult> {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY fehlt");

  const model = clean(request.model) || getOpenAiModel(request.purpose);
  const timeoutMs = request.timeoutMs || envNumber("RLC_AI_TIMEOUT_MS", 45_000, 3_000, 180_000);
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  const started = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    temperature:
      typeof request.temperature === "number" ? request.temperature : 0.2,
  };

  if (request.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  if (request.maxTokens) {
    if (isGpt56Model(model)) body.max_completion_tokens = request.maxTokens;
    else body.max_tokens = request.maxTokens;
  }

  // This branch is used only when a GPT-5.6 model is explicitly configured.
  // Enterprise fallback never upgrades the OpenAI model automatically.
  if (isGpt56Model(model)) {
    body.reasoning_effort = clean(process.env.OPENAI_REASONING_EFFORT) || "none";
  }

  const completion = await client.chat.completions.create(body as any);
  const raw = completion.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new Error("OpenAI hat keine Textantwort geliefert");

  const usage: any = completion.usage || {};
  return {
    text,
    provider: "openai",
    model: clean((completion as any).model) || model,
    mode: getRlcAiMode(),
    fallbackUsed: false,
    latencyMs: Date.now() - started,
    usage: {
      inputTokens: Number(usage.prompt_tokens) || undefined,
      outputTokens: Number(usage.completion_tokens) || undefined,
      totalTokens: Number(usage.total_tokens) || undefined,
    },
  };
}

async function completeWithOllama(
  request: RlcAiTextRequest,
  fallbackUsed: boolean
): Promise<RlcAiTextResult> {
  const model = getOllamaModel(request.purpose);
  const timeoutMs =
    request.timeoutMs || envNumber("OLLAMA_TIMEOUT_MS", 120_000, 5_000, 300_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        messages: request.messages,
        ...(request.responseFormat === "json" ? { format: "json" } : {}),
        options: {
          temperature:
            typeof request.temperature === "number" ? request.temperature : 0.2,
          num_ctx: envNumber("OLLAMA_CONTEXT_TOKENS", 8_192, 2_048, 32_768),
          ...(request.maxTokens ? { num_predict: request.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(`Ollama HTTP ${response.status}: ${detail}`);
    }

    const payload: any = await response.json();
    const text = stripThinking(payload?.message?.content || payload?.response || "");
    if (!text) throw new Error("Ollama hat keine Textantwort geliefert");

    return {
      text,
      provider: "ollama",
      model: clean(payload?.model) || model,
      mode: getRlcAiMode(),
      fallbackUsed,
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: Number(payload?.prompt_eval_count) || undefined,
        outputTokens: Number(payload?.eval_count) || undefined,
        totalTokens:
          (Number(payload?.prompt_eval_count) || 0) +
            (Number(payload?.eval_count) || 0) ||
          undefined,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function completeRlcAiText(
  request: RlcAiTextRequest
): Promise<RlcAiTextResult> {
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error("RLC KI: messages fehlen");
  }

  const mode = getRlcAiMode();

  if (mode === "LOCAL") {
    const result = await completeWithOllama(request, false);
    recordResult(result);
    return result;
  }

  if (mode === "OPENAI") {
    try {
      const result = await completeWithOpenAi(request);
      recordOpenAiSuccess();
      recordResult(result);
      return result;
    } catch (error) {
      recordOpenAiFailure(error);
      throw error;
    }
  }

  let primaryError: unknown = null;
  if (!isOpenAiCircuitOpen()) {
    try {
      const result = await completeWithOpenAi(request);
      recordOpenAiSuccess();
      recordResult(result);
      return result;
    } catch (error) {
      primaryError = error;
      recordOpenAiFailure(error);
    }
  } else {
    primaryError = new Error("OpenAI circuit temporär geöffnet");
  }

  try {
    const result = await completeWithOllama(request, true);
    recordResult(result);
    return result;
  } catch (localError) {
    runtimeState.lastError = `OpenAI: ${safeError(primaryError)} | Ollama: ${safeError(
      localError
    )}`;
    throw new Error(runtimeState.lastError);
  }
}

export function isRlcAiTextConfigured(): boolean {
  const mode = getRlcAiMode();
  if (mode === "LOCAL") return !!ollamaBaseUrl();
  if (mode === "OPENAI") return !!clean(process.env.OPENAI_API_KEY);
  return !!clean(process.env.OPENAI_API_KEY) || !!ollamaBaseUrl();
}

export function getRlcAiRuntimeStatus() {
  const mode = getRlcAiMode();
  return {
    mode,
    openai: {
      configured: !!clean(process.env.OPENAI_API_KEY),
      model: getOpenAiModel("generic"),
      supportModel: getOpenAiModel("copilot"),
      kalkulationModel: getOpenAiModel("kalkulation"),
      circuitOpen: isOpenAiCircuitOpen(),
      circuitOpenUntil: runtimeState.openAiCircuitOpenUntil
        ? new Date(runtimeState.openAiCircuitOpenUntil).toISOString()
        : null,
      consecutiveFailures: runtimeState.openAiFailures,
    },
    local: {
      baseUrl: ollamaBaseUrl(),
      model: getOllamaModel("generic"),
    },
    last: {
      provider: runtimeState.lastProvider,
      model: runtimeState.lastModel,
      fallbackUsed: runtimeState.lastFallbackUsed,
      requestAt: runtimeState.lastRequestAt,
      error: runtimeState.lastError,
    },
  };
}

export async function checkOllamaHealth(timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, status: response.status, models: [] as string[] };
    }
    const payload: any = await response.json();
    const models = Array.isArray(payload?.models)
      ? payload.models
          .map((item: any) => clean(item?.name || item?.model))
          .filter(Boolean)
      : [];
    const expected = getOllamaModel("generic");
    return {
      ok: true,
      expectedModel: expected,
      modelInstalled: models.some(
        (name: string) => name === expected || name.startsWith(`${expected}:`)
      ),
      models,
    };
  } catch (error) {
    return { ok: false, error: safeError(error), models: [] as string[] };
  } finally {
    clearTimeout(timer);
  }
}
