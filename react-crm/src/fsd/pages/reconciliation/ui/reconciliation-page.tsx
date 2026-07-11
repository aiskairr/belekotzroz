"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw } from "lucide-react";
import { useToast } from "@/src/fsd/shared/ui/toast";
import { getErrorText } from "@/src/fsd/shared/lib/errors";
import { getReconciliationDebtors, getReconciliationDetails, type Debtor } from "../api/reconciliation-api";
import styles from "./reconciliation-page.module.css";

const money = (value: number) => `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} сом`;
const dateTime = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-";

function mergeDebtors(items: Debtor[]) {
  const byId = new Map<string, Debtor>();
  for (const item of items) {
    const current = byId.get(item.id);
    if (!current) {
      byId.set(item.id, { ...item });
      continue;
    }
    current.debt += item.debt;
    current.paid += item.paid;
    current.documentCount += item.documentCount;
    if (!current.lastMoment || new Date(item.lastMoment) > new Date(current.lastMoment)) {
      current.lastMoment = item.lastMoment;
      current.lastDocumentName = item.lastDocumentName;
    }
  }
  return Array.from(byId.values()).sort((left, right) => right.debt - left.debt || left.name.localeCompare(right.name, "ru"));
}

export function ReconciliationPage() {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [selected, setSelected] = useState<Debtor | null>(null);
  const debtorsQuery = useInfiniteQuery({
    queryKey: ["reconciliation-debtors", appliedSearch, customerType],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getReconciliationDebtors({ search: appliedSearch, customerType, offset: Number(pageParam), limit: 60 }),
    getNextPageParam: (lastPage) => lastPage.page.hasMore ? lastPage.page.nextOffset : undefined,
  });
  const detailsQuery = useQuery({ queryKey: ["reconciliation-details", selected?.id], queryFn: () => getReconciliationDetails(selected?.id || ""), enabled: Boolean(selected?.id) });
  const refreshDebtors = () => {
    const nextSearch = search.trim();
    if (nextSearch === appliedSearch) {
      debtorsQuery.refetch();
      return;
    }
    setAppliedSearch(nextSearch);
  };

  useEffect(() => {
    if (debtorsQuery.error) showToast({ tone: "error", title: "Не удалось загрузить акт сверки", description: getErrorText(debtorsQuery.error) });
  }, [debtorsQuery.error, showToast]);

  const pages = debtorsQuery.data?.pages ?? [];
  const debtors = mergeDebtors(pages.flatMap((page) => page.debtors));
  const totals = debtors.reduce((sum, debtor) => ({
    debt: sum.debt + debtor.debt,
    paid: sum.paid + debtor.paid,
    documents: sum.documents + debtor.documentCount,
    debtors: sum.debtors + 1,
  }), { debt: 0, paid: 0, documents: 0, debtors: 0 });
  const isInitialLoading = debtorsQuery.isLoading && !pages.length;
  const loadedChunks = pages.length;
  return (
    <section className={styles.page}>
      <header className={styles.header}><div><p>Взаиморасчеты</p><h1>Акт сверки</h1><span>Должники, документы, оплаты и печатный акт по контрагенту.</span></div><button onClick={() => window.print()}><Printer size={17} /> Печать</button></header>
      <section className={styles.filters}>
        <label><span>Поиск</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Контрагент, телефон, ИНН" /></label>
        <label><span>Тип клиента</span><select value={customerType} onChange={(event) => setCustomerType(event.target.value)}><option value="">Все</option><option value="legal">Юрлица</option><option value="entrepreneur">ИП</option><option value="person">Физлица</option></select></label>
        <button onClick={refreshDebtors}><RefreshCw size={17} /> Обновить</button>
      </section>
      <section className={styles.summary}><article className={styles.total}><span>Долг в загруженных частях</span><strong>{money(totals.debt)}</strong></article><article><span>Должников</span><strong>{totals.debtors}</strong></article><article><span>Документов</span><strong>{totals.documents}</strong></article><article><span>Оплачено</span><strong>{money(totals.paid)}</strong></article></section>
      <section className={styles.loadState}><span>Загружено частей: {loadedChunks || 0}</span>{debtorsQuery.hasNextPage ? <button type="button" onClick={() => debtorsQuery.fetchNextPage()} disabled={debtorsQuery.isFetchingNextPage}>{debtorsQuery.isFetchingNextPage ? "Загружаю..." : "Загрузить еще"}</button> : <strong>{pages.length ? "Все доступные части загружены" : ""}</strong>}</section>
      <section className={styles.tablePanel}><table><thead><tr><th>Контрагент</th><th>Тип</th><th>Контакты</th><th>Последний документ</th><th>Док.</th><th>Оплачено</th><th>Долг</th></tr></thead><tbody>{debtors.map((item) => <tr key={item.id} onClick={() => setSelected(item)}><td><strong>{item.name}</strong><small>{item.actualAddress || "Адрес не указан"}</small></td><td>{item.customerTypeLabel || "Клиент"}</td><td>{[item.phone, item.inn].filter(Boolean).join(" / ") || "-"}</td><td><strong>{item.lastDocumentName || "-"}</strong><small>{dateTime(item.lastMoment)}</small></td><td>{item.documentCount}</td><td>{money(item.paid)}</td><td><b>{money(item.debt)}</b></td></tr>)}{!debtors.length ? <tr><td colSpan={7}>{isInitialLoading ? "Загрузка первой части..." : "Долгов нет в загруженных частях."}</td></tr> : null}</tbody></table></section>
      {selected ? <div className={styles.modal} onClick={() => setSelected(null)}><section onClick={(event) => event.stopPropagation()}><header><div><h2>{selected.name}</h2><p>{selected.customerTypeLabel} · долг {money(selected.debt)}</p></div><button onClick={() => setSelected(null)}>Закрыть</button></header>{detailsQuery.isLoading ? <p>Загружаю документы...</p> : <><div className={styles.summary}><article className={styles.total}><span>Долг</span><strong>{money(detailsQuery.data?.totals.debt ?? 0)}</strong></article><article><span>Сумма</span><strong>{money(detailsQuery.data?.totals.amount ?? 0)}</strong></article><article><span>Оплачено</span><strong>{money(detailsQuery.data?.totals.paid ?? 0)}</strong></article><article><span>Документов</span><strong>{detailsQuery.data?.totals.documents ?? 0}</strong></article></div><h3>Документы с долгом</h3><div className={styles.list}>{(detailsQuery.data?.documents ?? []).map((doc) => <article key={doc.id}><div><a href={doc.webUrl} target="_blank" rel="noreferrer">{doc.typeLabel} №{doc.name}</a><small>{dateTime(doc.moment)} · {doc.storeName || "-"}</small></div><strong>{money(doc.debt)}</strong></article>)}</div><h3>Оплаты</h3><div className={styles.list}>{(detailsQuery.data?.payments ?? []).map((payment) => <article key={payment.id}><div><a href={payment.webUrl} target="_blank" rel="noreferrer">Оплата №{payment.name}</a><small>{dateTime(payment.moment)} {payment.description || ""}</small></div><strong>{money(payment.amount)}</strong></article>)}</div></>}</section></div> : null}
    </section>
  );
}
