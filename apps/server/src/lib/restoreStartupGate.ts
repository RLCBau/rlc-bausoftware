import fs from "fs";
import crypto from "crypto";
import { prisma } from "./prisma";
import { erasureLedgerPath, checkRestoredErasureState } from "./erasureLedger";

/** Fail closed before HTTP listen, including when an old DB/ledger is restored. */
export async function enforceRestoreGateOnStartup() {
  if (process.env.RLC_ENFORCE_RESTORE_GATE !== "1") {
    throw new Error("RESTORE_GATE_NOT_ENABLED");
  }
  const reference=process.env.RLC_ERASURE_LEDGER_REFERENCE || "/app/recovery/erasure-ledger.sha256";
  const expected=fs.readFileSync(reference,"utf8").trim();
  if(!/^[0-9a-f]{64}$/i.test(expected)) throw new Error("RESTORE_LEDGER_REFERENCE_INVALID");
  const data=fs.readFileSync(erasureLedgerPath());
  const actual=crypto.createHash("sha256").update(data).digest("hex");
  if(actual.toLowerCase() !== expected.toLowerCase()) throw new Error("RESTORE_LEDGER_DIGEST_MISMATCH");
  const result=await checkRestoredErasureState(prisma);
  if(!result.ready) throw new Error("RESTORE_GATE_DENIED:"+String(result.error));
  console.info("[restore-gate] startup verified events="+result.checked);
}
