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

/** Read-only server state: a network failure after /issue must never trigger blind reissue. */
export async function getInvoiceFiscalState(projectKey: string, invoiceId: string) {
  const project = safeSegment(projectKey, "PROJECT");
  const id = safeSegment(invoiceId, "INVOICE_ID");
  const invoices = await request<Array<Record<string, any>>>(`/api/kalkulation/rechnung/${project}`);
  if (!Array.isArray(invoices)) throw new Error("FISCAL_LIST_UNAVAILABLE");
  const invoice = invoices.find(x => String(x?.id) === id);
  if (!invoice) throw new Error("FISCAL_INVOICE_NOT_FOUND");
  return invoice;
}

/** Explicit issue only. An ambiguous response must be verified by GET, never retried automatically. */
export async function issueInvoiceOnServer(projectKey: string, invoiceId: string) {
  const project = safeSegment(projectKey, "PROJECT");
  const id = safeSegment(invoiceId, "INVOICE_ID");
  let result: {ok?:boolean;fiscalStatus?:string;invoice?:{fiscalStatus?:string};error?:string;[k:string]:unknown};
  try {
    result = await request(`/api/kalkulation/rechnung/${project}/${id}/issue`, {method:"POST"});
  } catch (error) {
    // The request may have reached WORM storage before the response was lost.
    const checked = await getInvoiceFiscalState(projectKey, invoiceId).catch(() => null);
    if (checked?.fiscalStatus === "AUSGESTELLT") {
      return {issued:true, reconciliationRequired:true, result:checked, verifiedAfterError:true};
    }
    throw new Error("FISCAL_ISSUE_STATUS_UNCERTAIN_CHECK_SERVER");
  }
  if (result?.invoice?.fiscalStatus === "AUSGESTELLT" && result?.ok === true) {
    return {issued:true, reconciliationRequired:false, result, verifiedAfterError:false};
  }
  if (result?.fiscalStatus === "AUSGESTELLT" && result?.error === "ACCOUNTING_RECONCILIATION_REQUIRED") {
    return {issued:true, reconciliationRequired:true, result, verifiedAfterError:false};
  }
  throw new Error("FISCAL_ISSUE_NOT_CONFIRMED");
}
