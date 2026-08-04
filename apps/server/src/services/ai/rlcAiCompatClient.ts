import OpenAI from "openai";
import {
  completeRlcAiText,
  getRlcAiMode,
  type RlcAiMessage,
  type RlcAiPurpose,
} from "./rlcAiGateway";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function hasMultimodalContent(value: any): boolean {
  const input = value?.input ?? value?.messages;
  if (!Array.isArray(input)) return false;

  return input.some((message: any) => {
    if (!Array.isArray(message?.content)) return false;
    return message.content.some((part: any) => {
      const type = clean(part?.type).toLowerCase();
      return type && !["text", "input_text", "output_text"].includes(type);
    });
  });
}

function contentToText(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return clean(content);
  return content
    .map((part: any) => {
      if (typeof part === "string") return part;
      return clean(part?.text?.value ?? part?.text ?? part?.content);
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeMessages(body: any): RlcAiMessage[] {
  if (Array.isArray(body?.messages)) {
    return body.messages
      .map((message: any) => ({
        role: ["system", "assistant"].includes(message?.role)
          ? message.role
          : "user",
        content: contentToText(message?.content),
      }))
      .filter((message: RlcAiMessage) => !!message.content);
  }

  if (typeof body?.input === "string") {
    return [{ role: "user", content: body.input }];
  }

  if (Array.isArray(body?.input)) {
    return body.input
      .map((message: any) => ({
        role: ["system", "assistant"].includes(message?.role)
          ? message.role
          : "user",
        content: contentToText(message?.content),
      }))
      .filter((message: RlcAiMessage) => !!message.content);
  }

  return [];
}

function purposeOf(body: any): RlcAiPurpose {
  const explicit = clean(body?._rlcPurpose).toLowerCase();
  if (
    explicit === "copilot" ||
    explicit === "kalkulation" ||
    explicit === "extraction" ||
    explicit === "classification"
  ) {
    return explicit;
  }
  return "generic";
}

function directClient(): OpenAI {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY fehlt für Vision/Datei-Verarbeitung");
  return new OpenAI({
    apiKey,
    timeout: Number(process.env.RLC_AI_TIMEOUT_MS || 60_000),
  });
}

export function createRlcAiCompatClient(): any {
  return {
    chat: {
      completions: {
        create: async (body: any) => {
          if (hasMultimodalContent(body)) {
            if (getRlcAiMode() === "LOCAL") {
              throw new Error(
                "RLC_LOCAL_MULTIMODAL_UNAVAILABLE: Bilder benötigen OCR oder OpenAI Vision."
              );
            }
            return directClient().chat.completions.create(body);
          }

          const result = await completeRlcAiText({
            messages: normalizeMessages(body),
            purpose: purposeOf(body),
            model: body?.model,
            temperature: body?.temperature,
            responseFormat:
              body?.response_format?.type === "json_object" ? "json" : "text",
            maxTokens: body?.max_completion_tokens || body?.max_tokens,
          });

          return {
            id: `rlc-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: result.model,
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { role: "assistant", content: result.text },
              },
            ],
            usage: {
              prompt_tokens: result.usage?.inputTokens || 0,
              completion_tokens: result.usage?.outputTokens || 0,
              total_tokens: result.usage?.totalTokens || 0,
            },
            _rlc: result,
          };
        },
      },
    },
    responses: {
      create: async (body: any) => {
        if (hasMultimodalContent(body)) {
          if (getRlcAiMode() === "LOCAL") {
            throw new Error(
              "RLC_LOCAL_MULTIMODAL_UNAVAILABLE: Bilder/PDF benötigen OCR oder OpenAI Vision."
            );
          }
          return directClient().responses.create(body);
        }

        const result = await completeRlcAiText({
          messages: normalizeMessages(body),
          purpose: purposeOf(body),
          model: body?.model,
          temperature: body?.temperature,
          responseFormat:
            body?.response_format?.type === "json_object" ||
            body?.text?.format?.type === "json_object"
              ? "json"
              : "text",
          maxTokens: body?.max_output_tokens,
        });

        return {
          id: `rlc-resp-${Date.now()}`,
          object: "response",
          model: result.model,
          output_text: result.text,
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: result.text }],
            },
          ],
          _rlc: result,
        };
      },
    },
  };
}

