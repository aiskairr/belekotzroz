import { apiClient } from "@/src/fsd/shared/api";

export type ReportType = "retaildemand" | "demand" | "retailsalesreturn" | "salesreturn";
export type CustomerType = "legal" | "entrepreneur" | "individual" | "";

export type RetailStore = {
  id: string;
  name: string;
  href: string;
  storeHref: string;
};

export type ReportProduct = {
  code: string;
  name: string;
  quantity: number;
  price: number;
  sum: number;
  isGift: boolean;
};

export type ReportRow = {
  id: string;
  type: ReportType;
  typeLabel: string;
  name: string;
  moment: string;
  amount: number;
  paid: number;
  unpaid: number;
  netProfit: number;
  storeName: string;
  organizationName: string;
  customerId: string;
  customerHref: string;
  customerName: string;
  customerType: CustomerType;
  customerTypeLabel: string;
  customerPhone: string;
  customerInn: string;
  customerAddress: string;
  employeeName: string;
  paymentType: string;
  comment: string;
  webUrl: string;
  productText: string;
  products: ReportProduct[];
};

export type SalesReport = {
  rows: ReportRow[];
  canViewProfit: boolean;
};

export type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  documentType?: ReportType;
  customerType?: CustomerType;
  search?: string;
  retailStoreHref?: string;
  storeHref?: string;
};

const reportTypes: ReportType[] = ["retaildemand", "demand", "retailsalesreturn", "salesreturn"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeReportType(value: unknown): ReportType {
  return reportTypes.includes(value as ReportType) ? (value as ReportType) : "retaildemand";
}

function normalizeCustomerType(value: unknown): CustomerType {
  if (value === "legal" || value === "entrepreneur" || value === "individual") return value;
  if (value === "person") return "individual";
  return "";
}

function normalizeStore(value: unknown): RetailStore {
  const record = asRecord(value);
  return {
    id: asString(record.id ?? record.href ?? record.name),
    name: asString(record.name),
    href: asString(record.href),
    storeHref: asString(record.storeHref ?? record.store_href),
  };
}

function normalizeProduct(value: unknown): ReportProduct {
  const record = asRecord(value);
  return {
    code: asString(record.code),
    name: asString(record.name),
    quantity: asNumber(record.quantity),
    price: asNumber(record.price),
    sum: asNumber(record.sum),
    isGift: record.isGift === true || record.is_gift === true,
  };
}

function normalizeRow(value: unknown): ReportRow {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    type: normalizeReportType(record.type),
    typeLabel: asString(record.typeLabel ?? record.type_label),
    name: asString(record.name),
    moment: asString(record.moment),
    amount: asNumber(record.amount),
    paid: asNumber(record.paid),
    unpaid: asNumber(record.unpaid),
    netProfit: asNumber(record.netProfit ?? record.net_profit),
    storeName: asString(record.storeName ?? record.store_name),
    organizationName: asString(record.organizationName ?? record.organization_name),
    customerId: asString(record.customerId ?? record.customer_id),
    customerHref: asString(record.customerHref ?? record.customer_href),
    customerName: asString(record.customerName ?? record.customer_name),
    customerType: normalizeCustomerType(record.customerType ?? record.customer_type),
    customerTypeLabel: asString(record.customerTypeLabel ?? record.customer_type_label),
    customerPhone: asString(record.customerPhone ?? record.customer_phone),
    customerInn: asString(record.customerInn ?? record.customer_inn),
    customerAddress: asString(record.customerAddress ?? record.customer_address),
    employeeName: asString(record.employeeName ?? record.employee_name),
    paymentType: asString(record.paymentType ?? record.payment_type),
    comment: asString(record.comment),
    webUrl: asString(record.webUrl ?? record.web_url),
    productText: asString(record.productText ?? record.product_text),
    products: asArray(record.products).map(normalizeProduct),
  };
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  retaildemand: "Продажи",
  demand: "Отгрузки",
  retailsalesreturn: "Возвраты продаж",
  salesreturn: "Возвраты отгрузок",
};

export async function getReportStores() {
  const payload = asRecord(await apiClient<unknown>("/api/retail-stores"));
  return asArray(payload.retailStores).map(normalizeStore).filter((store) => store.href || store.id);
}

export async function getSalesReport(filters: ReportFilters): Promise<SalesReport> {
  const params = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  if (filters.documentType) params.set("documentType", filters.documentType);
  if (filters.customerType) params.set("customerType", filters.customerType);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.retailStoreHref) params.set("retailStoreHref", filters.retailStoreHref);
  if (filters.storeHref) params.set("storeHref", filters.storeHref);

  const payload = asRecord(await apiClient<unknown>(`/api/reports/sales?${params.toString()}`));
  return {
    rows: asArray(payload.rows).map(normalizeRow).filter((row) => row.id),
    canViewProfit: payload.canViewProfit === true,
  };
}
