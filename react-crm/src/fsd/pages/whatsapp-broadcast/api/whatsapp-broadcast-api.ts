import { apiClient } from "@/src/fsd/shared/api";

export type WhatsappCustomer = { id: string; name: string; phone: string; whatsappPhone: string; inn: string; customerTypeLabel: string };
type UnknownRecord = Record<string, unknown>;
const asRecord = (value: unknown): UnknownRecord => (value && typeof value === "object" ? (value as UnknownRecord) : {});
const asArray = (value: unknown, key: string) => Array.isArray(value) ? value : Array.isArray(asRecord(value)[key]) ? asRecord(value)[key] as unknown[] : [];
const asString = (value: unknown) => typeof value === "string" ? value : "";

export async function getWhatsappCustomers(params: { search: string; customerType: string }) {
  const query = new URLSearchParams({ limit: "500" });
  if (params.search) query.set("search", params.search);
  if (params.customerType) query.set("customerType", params.customerType);
  return asArray(await apiClient<unknown>(`/api/whatsapp/customers?${query.toString()}`), "customers").map((value) => {
    const row = asRecord(value);
    return { id: asString(row.id), name: asString(row.name), phone: asString(row.phone), whatsappPhone: asString(row.whatsappPhone), inn: asString(row.inn), customerTypeLabel: asString(row.customerTypeLabel) };
  }).filter((item) => item.phone || item.whatsappPhone);
}

async function waha<T>(baseUrl: string, apiKey: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(asString(asRecord(data).error || asRecord(data).message) || "WAHA API error");
  return data as T;
}

export type WahaRecipient = { phone: string; name?: string; chatId?: string };

export type WahaBatchPayload = {
  recipients: WahaRecipient[];
  textTemplate: string;
  videoLinks: string[];
  session: string;
  dryRun: boolean;
};

export const getWahaSession = (baseUrl: string, apiKey: string, session: string) => {
  const query = new URLSearchParams();
  if (session) query.set("session", session);
  return waha<unknown>(baseUrl, apiKey, `/api/waha/session?${query.toString()}`);
};
export const startWahaSession = (baseUrl: string, apiKey: string, session: string) => {
  return waha<unknown>(baseUrl, apiKey, "/api/waha/session/start", { method: "POST", body: JSON.stringify({ session }) });
};
export const sendWahaText = (baseUrl: string, apiKey: string, payload: { phone?: string; chatId?: string; text: string; session: string }) => {
  return waha<unknown>(baseUrl, apiKey, "/api/send-text", { method: "POST", body: JSON.stringify(payload) });
};
export const sendWahaBatch = (baseUrl: string, apiKey: string, payload: WahaBatchPayload) => {
  return waha<{ ok?: boolean; job?: { id?: string; total?: number; dryRun?: boolean }; jobId?: string; total?: number }>(baseUrl, apiKey, "/api/send-batch", { method: "POST", body: JSON.stringify(payload) });
};
