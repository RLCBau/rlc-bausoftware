import crypto from "crypto";
import { storage, objectKey } from "../storage/storageService";

async function main() {
  const health = await storage.health();
  if (!health.ok) throw new Error(`Storage health failed: ${health.error || "unknown error"}`);

  const key = objectKey("system", "smoke-tests", `${Date.now()}-${crypto.randomUUID()}.txt`);
  const body = Buffer.from(`RLC storage smoke test ${new Date().toISOString()}\n`, "utf8");
  await storage.put({ key, body, contentType: "text/plain" });
  const downloaded = await storage.get(key);
  if (!downloaded.equals(body)) throw new Error("Storage smoke test content mismatch");
  await storage.delete(key);
  console.log(JSON.stringify({ ok: true, provider: storage.name, key }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
