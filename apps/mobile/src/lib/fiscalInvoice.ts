import { request } from "./api";

export type FiscalState = "ENTWURF" | "AUSGESTELLT" | "KORRIGIERT" | "STORNIERT";

function safeSegment(value: unknown, label: string): string {
  const v = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(v)) throw new Error("INVALID_" + label);
  return encodeURIComponent(v);
}

/** Save a draft in the authoritative fiscal module; NEVER marks it as issued. */
export async function saveInvoiceDraftOnServer(projectKey: string, draft: Record<string, any>) {
  const project = safeSegment(projectKey, "PROJECT");
  const id = safeSegment(draft.id, "INVOICE_ID");
  const data = { ...draft, id, nr: String(draft.nr || draft.rechnungNr || "").trim(), fiscalStatus: "ENTWURF" };
  if (!data.nr) throw new Error("INVOICE_NUMBER_REQUIRED");
  const result = await request<{ok:boolean; id:string}>(`/api/kalkulation/rechnung/${project}/save`, {
    method: "POST", body: JSON.stringify(data)
  });
  if (!result?.ok || String(result.id) !== id) throw new Error("FISCAL_DRAFT_NOT_CONFIRMED");
  return result;
}

/** Explicit issue call only. A 202 means issued but accounting reconciliation is still required. */
export async function issueInvoiceOnServer(projectKey: string, invoiceId: string) {
  const project = safeSegment(projectKey, "PROJECT");
  const id = safeSegment(invoiceId, "INVOICE_ID");
  const result = await request<{ok?:boolean;fiscalStatus?:string;error?:string;[k:string]:unknown}>(
    `/api/kalkulation/rechnung/${project}/${id}/issue`, {method:"POST"}
  );
  if (result?.fiscalStatus !== "AUSGESTELLT") throw new Error("FISCAL_ISSUE_NOT_CONFIRMED");
  return {issued:true, reconciliationRequired:result.error==="ACCOUNTING_RECONCILIATION_REQUIRED", result};
}
