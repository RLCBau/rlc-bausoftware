import {
  checkOllamaHealth,
  completeRlcAiText,
  getRlcAiRuntimeStatus,
} from "../services/ai/rlcAiGateway";

async function main() {
  const localHealth = await checkOllamaHealth(10_000);
  console.log(JSON.stringify({ runtime: getRlcAiRuntimeStatus(), localHealth }, null, 2));

  const result = await completeRlcAiText({
    purpose: "generic",
    temperature: 0,
    maxTokens: 120,
    messages: [
      { role: "system", content: "Antworte kurz und nur auf Deutsch." },
      { role: "user", content: "Antworte exakt mit: RLC KI OK" },
    ],
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        answer: result.text,
        provider: result.provider,
        model: result.model,
        mode: result.mode,
        fallbackUsed: result.fallbackUsed,
        latencyMs: result.latencyMs,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      { ok: false, error: String(error?.message || error || "AI smoke test failed") },
      null,
      2
    )
  );
  process.exit(1);
});

