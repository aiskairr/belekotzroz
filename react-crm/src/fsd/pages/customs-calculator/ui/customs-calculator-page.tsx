"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, PackageSearch, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/src/fsd/shared/ui/toast";
import { getErrorText } from "@/src/fsd/shared/lib/errors";
import { deleteCustomsHistory, getCustomsHistory, getCustomsHistoryItem, getCustomsProducts, saveCustomsHistory, type CustomsProduct } from "../api/customs-calculator-api";
import styles from "./customs-calculator-page.module.css";

type BoxVariant = "single" | "master";
type PaymentType = "cashless" | "cash";
type DistributionMode = "weight" | "volume";
type Row = {
  id: string; productId: string; name: string; code: string; article: string;
  boxVariant: BoxVariant; quantity: number; boxesCount: number; unitsPerBox: number; boxSize: number; masterBoxVolume: number;
  packageWeightKg: number; buyPriceValue: number; buyPriceCurrency: "USD" | "KGS"; paymentType: PaymentType;
  profitPerUnitUsd: number; otherPerUnitUsd: number; specification: string;
};
type PartyExpenses = { customsClearance: number; temporaryStorage: number; declaration: number; processing: number; seal: number; escort: number; deliveryUsd: number; distributionMode: DistributionMode };

const SETTINGS_KEY = "ordoCustomsCalculatorSettingsReact";
const DRAFT_KEY = "ordoCustomsCalculatorDraftReact";
const defaultExpenses: PartyExpenses = { customsClearance: 0, temporaryStorage: 0, declaration: 0, processing: 0, seal: 0, escort: 0, deliveryUsd: 0, distributionMode: "weight" };
const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = (value: number, currency = "USD") => `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} ${currency}`;
const measure = (value: number, unit: string) => `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: value > 0 && value < 1 ? 3 : 0, maximumFractionDigits: 3 }).format(value || 0)} ${unit}`;
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const roundMeasure = (value: number) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase("ru-RU");
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `row-${Date.now()}-${Math.random()}`);

function normalizeBuyPrice(product?: CustomsProduct | null) {
  const currency = normalizeSearch(`${product?.buyPrice?.currencyIsoCode || ""} ${product?.buyPrice?.currencyName || ""}`).includes("сом") || normalizeSearch(`${product?.buyPrice?.currencyIsoCode || ""}`).includes("kgs") ? "KGS" : "USD";
  return { value: Number(product?.buyPrice?.value || 0), currency: currency as "USD" | "KGS" };
}

function makeRow(product?: CustomsProduct | null): Row {
  const buy = normalizeBuyPrice(product);
  return {
    id: uid(), productId: product?.id || "", name: product?.name || "", code: product?.code || "", article: product?.article || "",
    boxVariant: "single", quantity: 1, boxesCount: 0, unitsPerBox: 0, boxSize: 0, masterBoxVolume: 0, packageWeightKg: 0,
    buyPriceValue: buy.value, buyPriceCurrency: buy.currency, paymentType: "cashless", profitPerUnitUsd: 0, otherPerUnitUsd: 0, specification: "",
  };
}

function readDraft() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") as { rows?: Row[]; partyExpenses?: PartyExpenses; usdRate?: number } | null; } catch { return null; }
}

function rowQuantity(row: Row) {
  return row.boxVariant === "master" && row.boxesCount > 0 && row.unitsPerBox > 0 ? row.boxesCount * row.unitsPerBox : Math.max(1, Number(row.quantity || 1));
}

function rowVolume(row: Row) {
  return row.boxVariant === "master" ? roundMeasure(Number(row.masterBoxVolume || 0) * Number(row.boxesCount || 0)) : roundMeasure(Number(row.boxSize || 0) * rowQuantity(row));
}

function rowVolumePerUnit(row: Row) {
  if (row.boxVariant === "master") return row.unitsPerBox > 0 ? roundMeasure(Number(row.masterBoxVolume || 0) / row.unitsPerBox) : 0;
  return roundMeasure(Number(row.boxSize || 0));
}

function rowWeight(row: Row) {
  return roundMoney(Number(row.packageWeightKg || 0) * rowQuantity(row));
}

export function CustomsCalculatorPage() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const draft = readDraft();
  const [usdRate, setUsdRate] = useState(() => Number(draft?.usdRate || 89));
  const [rows, setRows] = useState<Row[]>(() => draft?.rows?.length ? draft.rows : []);
  const [party, setParty] = useState<PartyExpenses>(() => ({ ...defaultExpenses, ...(draft?.partyExpenses || {}) }));
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const productsQuery = useQuery({ queryKey: ["customs-products"], queryFn: getCustomsProducts });
  const history = useQuery({ queryKey: ["customs-history"], queryFn: getCustomsHistory });
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const results = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return [];
    return products.filter((product) => normalizeSearch([product.name, product.code, product.article].join(" ")).includes(query)).slice(0, 12);
  }, [products, search]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ usdRate }));
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, rowSeq: rows.length + 1, partyExpenses: party, usdRate }));
  }, [party, rows, usdRate]);

  const context = useMemo(() => {
    const commonKgs = roundMoney(party.customsClearance + party.temporaryStorage + party.declaration + party.processing + party.seal + party.escort);
    const commonUsd = usdRate > 0 ? roundMoney(commonKgs / usdRate) : 0;
    const totalCommonUsd = roundMoney(commonUsd + party.deliveryUsd);
    const denominator = party.distributionMode === "volume" ? rows.reduce((sum, row) => sum + rowVolume(row), 0) : rows.reduce((sum, row) => sum + rowWeight(row), 0);
    return { commonKgs, commonUsd, totalCommonUsd, denominator, sharedRateUsd: denominator > 0 ? roundMoney(totalCommonUsd / denominator) : 0 };
  }, [party, rows, usdRate]);

  const calculateRow = (row: Row) => {
    const quantity = rowQuantity(row);
    const buyUnitUsd = row.buyPriceCurrency === "USD" ? Number(row.buyPriceValue || 0) : usdRate > 0 ? roundMoney(Number(row.buyPriceValue || 0) / usdRate) : 0;
    const totalWeightKg = rowWeight(row);
    const totalVolumeM3 = rowVolume(row);
    const distributionBase = party.distributionMode === "volume" ? totalVolumeM3 : totalWeightKg;
    const sharedTotalUsd = roundMoney(distributionBase * context.sharedRateUsd);
    const sharedPerUnitUsd = quantity > 0 ? roundMoney(sharedTotalUsd / quantity) : 0;
    const profitPerUnitUsd = roundMoney(Number(row.profitPerUnitUsd || 0));
    const otherPerUnitUsd = roundMoney(Number(row.otherPerUnitUsd || 0));
    const landedPerUnitUsd = roundMoney(buyUnitUsd + sharedPerUnitUsd + otherPerUnitUsd);
    const taxRate = row.paymentType === "cash" ? 0.04 : 0.02;
    const taxablePerUnit = roundMoney(landedPerUnitUsd + profitPerUnitUsd);
    const taxPerUnitUsd = roundMoney(taxablePerUnit * taxRate);
    const finalPerUnitUsd = roundMoney(taxablePerUnit + taxPerUnitUsd);
    return {
      quantity, buyUnitUsd, buyTotalUsd: roundMoney(buyUnitUsd * quantity), totalWeightKg, totalVolumeM3, sharedTotalUsd, sharedPerUnitUsd,
      profitTotalUsd: roundMoney(profitPerUnitUsd * quantity), otherTotalUsd: roundMoney(otherPerUnitUsd * quantity),
      landedPerUnitUsd, taxRateLabel: row.paymentType === "cash" ? "4%" : "2%", taxTotalUsd: roundMoney(taxPerUnitUsd * quantity),
      finalPerUnitUsd, finalTotalUsd: roundMoney(finalPerUnitUsd * quantity),
    };
  };

  const totals = rows.reduce((acc, row) => {
    const calc = calculateRow(row);
    acc.units += calc.quantity; acc.weight += calc.totalWeightKg; acc.volume += calc.totalVolumeM3; acc.buy += calc.buyTotalUsd;
    acc.profit += calc.profitTotalUsd; acc.expenses += calc.sharedTotalUsd + calc.otherTotalUsd + calc.taxTotalUsd + calc.profitTotalUsd; acc.final += calc.finalTotalUsd;
    return acc;
  }, { units: 0, weight: 0, volume: 0, buy: 0, profit: 0, expenses: 0, final: 0 });

  const save = useMutation({
    mutationFn: () => {
      const title = window.prompt("Название для истории", `${rows.find((row) => row.name)?.name || "Расчет таможни"} • ${new Date().toLocaleString("ru-RU")}`);
      if (title === null) throw new Error("cancelled");
      return saveCustomsHistory({ title, draft: { rows, rowSeq: rows.length + 1, partyExpenses: party, usdRate } });
    },
    onSuccess: async () => { showToast({ tone: "success", title: "Расчет сохранен" }); setHistoryOpen(true); await qc.invalidateQueries({ queryKey: ["customs-history"] }); },
    onError: (error) => { if (getErrorText(error) !== "cancelled") showToast({ tone: "error", title: "Не удалось сохранить", description: getErrorText(error) }); },
  });
  const del = useMutation({ mutationFn: deleteCustomsHistory, onSuccess: () => qc.invalidateQueries({ queryKey: ["customs-history"] }) });
  const restore = useMutation({
    mutationFn: getCustomsHistoryItem,
    onSuccess: (item) => {
      setRows((Array.isArray(item.rows) ? item.rows : []) as Row[]);
      setParty({ ...defaultExpenses, ...(item.partyExpenses || {}) } as PartyExpenses);
      showToast({ tone: "success", title: "История загружена" });
    },
  });

  const patch = (id: string, patchRow: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patchRow } : row));
  const patchParty = (patchExpense: Partial<PartyExpenses>) => setParty((current) => ({ ...current, ...patchExpense }));

  return (
    <section className={styles.page}>
      <header className={styles.header}><div><p>Импорт и себестоимость</p><h1>Калькулятор таможни</h1><span>Ручные товары, каталог МойСклад, расходы партии, налоги и история расчетов.</span></div><button onClick={() => save.mutate()}><Save size={17}/> Сохранить</button></header>
      <section className={styles.toolbar}>
        <label><span>Курс USD - KGS</span><input type="number" value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value))}/></label>
        <label className={styles.searchField}><span>Поиск в каталоге</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название, код или артикул"/></label>
        <button onClick={() => productsQuery.refetch()}><PackageSearch size={17}/> Обновить</button>
        <button onClick={() => setRows((value) => [...value, makeRow()])}><Plus size={17}/> Добавить товар</button>
        <button onClick={() => setHistoryOpen((value) => !value)}><History size={17}/> История</button>
        <button onClick={() => { if (confirm("Очистить все строки калькулятора?")) setRows([]); }}><Trash2 size={17}/> Очистить</button>
      </section>
      {historyOpen ? <section className={styles.history}><h2>История расчетов</h2>{(history.data ?? []).map((item) => <article key={item.id}><button onClick={() => restore.mutate(item.id)}><strong>{item.name}</strong><span>{item.createdAt} · {item.rowsCount} строк</span></button><button onClick={() => del.mutate(item.id)}><Trash2 size={15}/></button></article>)}</section> : null}
      <section className={styles.searchResults}><h2>Результаты поиска</h2>{!search ? <p>Каталог необязателен. Можно сразу добавить товар вручную.</p> : null}{results.map((product) => <article key={product.id}><div><strong>{product.name}</strong><span>Код: {product.code || "-"} · Артикул: {product.article || "-"} · Закупка: {money(product.buyPrice?.value || 0, product.buyPrice?.currencyIsoCode || product.buyPrice?.currencyName || "USD")}</span></div><button onClick={() => setRows((value) => [...value, makeRow(product)])}>Добавить</button></article>)}</section>
      <section className={styles.party}><h2>Общие расходы партии</h2><div className={styles.partyGrid}>{[
        ["customsClearance", "Растаможка, сом"], ["temporaryStorage", "СВХ, сом"], ["declaration", "Декларация, сом"], ["processing", "Оформление, сом"], ["seal", "Пломба, сом"], ["escort", "Сопровождение, сом"], ["deliveryUsd", "Транспорт, USD"],
      ].map(([key, label]) => <label key={key}><span>{label}</span><input type="number" value={party[key as keyof PartyExpenses] as number} onChange={(e) => patchParty({ [key]: Number(e.target.value) })}/></label>)}<label><span>Распределять по</span><select value={party.distributionMode} onChange={(e) => patchParty({ distributionMode: e.target.value as DistributionMode })}><option value="weight">Весу</option><option value="volume">Объему</option></select></label></div></section>
      <section className={styles.summary}><article><span>Товаров</span><strong>{rows.length}</strong></article><article><span>Количество</span><strong>{nf.format(totals.units)} шт</strong></article><article><span>Вес</span><strong>{measure(totals.weight, "кг")}</strong></article><article><span>Объем</span><strong>{measure(totals.volume, "м³")}</strong></article><article><span>Закупка</span><strong>{money(totals.buy)}</strong></article><article><span>Расходы</span><strong>{money(totals.expenses)}</strong></article><article className={styles.total}><span>Себестоимость партии</span><strong>{money(totals.final)}</strong></article></section>
      <section className={styles.rows}>{rows.length ? rows.map((row, index) => { const calc = calculateRow(row); return <article key={row.id} className={styles.rowCard}><header><div><span>Товар {index + 1}</span><strong>{row.name || "Новая позиция"}</strong></div><button onClick={() => setRows((value) => value.filter((item) => item.id !== row.id))}><Trash2 size={16}/></button></header><div className={styles.rowGrid}><label className={styles.wide}><span>Название</span><input value={row.name} onChange={(e) => patch(row.id, { name: e.target.value })}/></label><label><span>Код</span><input value={row.code} onChange={(e) => patch(row.id, { code: e.target.value })}/></label><label><span>Тип коробки</span><select value={row.boxVariant} onChange={(e) => patch(row.id, { boxVariant: e.target.value as BoxVariant })}><option value="single">Обычная</option><option value="master">Мастер</option></select></label>{row.boxVariant === "master" ? <><label><span>Коробок</span><input type="number" value={row.boxesCount} onChange={(e) => patch(row.id, { boxesCount: Number(e.target.value) })}/></label><label><span>Штук в коробке</span><input type="number" value={row.unitsPerBox} onChange={(e) => patch(row.id, { unitsPerBox: Number(e.target.value) })}/></label><label><span>Объем мастер-коробки</span><input type="number" value={row.masterBoxVolume} onChange={(e) => patch(row.id, { masterBoxVolume: Number(e.target.value) })}/></label></> : <label><span>Количество</span><input type="number" value={row.quantity} onChange={(e) => patch(row.id, { quantity: Number(e.target.value) })}/></label>}<label><span>Объем 1 шт</span><input value={rowVolumePerUnit(row)} readOnly/></label><label><span>Вес 1 шт, кг</span><input type="number" value={row.packageWeightKg} onChange={(e) => patch(row.id, { packageWeightKg: Number(e.target.value) })}/></label><label><span>Закупка</span><input type="number" value={row.buyPriceValue} onChange={(e) => patch(row.id, { buyPriceValue: Number(e.target.value) })}/></label><label><span>Валюта</span><select value={row.buyPriceCurrency} onChange={(e) => patch(row.id, { buyPriceCurrency: e.target.value as "USD" | "KGS" })}><option value="USD">USD</option><option value="KGS">KGS</option></select></label><label><span>Оплата</span><select value={row.paymentType} onChange={(e) => patch(row.id, { paymentType: e.target.value as PaymentType })}><option value="cashless">Безнал 2%</option><option value="cash">Наличка 4%</option></select></label><label><span>Прибыль/шт USD</span><input type="number" value={row.profitPerUnitUsd} onChange={(e) => patch(row.id, { profitPerUnitUsd: Number(e.target.value) })}/></label><label><span>Прочие/шт USD</span><input type="number" value={row.otherPerUnitUsd} onChange={(e) => patch(row.id, { otherPerUnitUsd: Number(e.target.value) })}/></label></div><div className={styles.metrics}><span>Закуп: <b>{money(calc.buyTotalUsd)}</b></span><span>Вес/объем: <b>{measure(calc.totalWeightKg, "кг")} / {measure(calc.totalVolumeM3, "м³")}</b></span><span>Нагрузка/шт: <b>{money(calc.sharedPerUnitUsd)}</b></span><span>Налог {calc.taxRateLabel}: <b>{money(calc.taxTotalUsd)}</b></span><span>Себест./шт: <b>{money(calc.landedPerUnitUsd)}</b></span><span>Итог/шт: <b>{money(calc.finalPerUnitUsd)}</b></span></div></article>; }) : <div className={styles.empty}>Пока нет товаров. Добавьте товар вручную или через поиск.</div>}</section>
    </section>
  );
}
