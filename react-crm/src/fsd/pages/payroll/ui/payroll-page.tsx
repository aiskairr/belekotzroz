"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, PlusCircle, Printer, RefreshCw, Save } from "lucide-react";
import { useToast } from "@/src/fsd/shared/ui/toast";
import { getErrorText } from "@/src/fsd/shared/lib/errors";
import {
  addPayrollExpense,
  getPayrollReport,
  savePayrollConfigs,
  type PayrollPercentBase,
  type PayrollRow,
  type PayrollScheme,
} from "../api/payroll-api";
import styles from "./payroll-page.module.css";

const schemeLabels: Record<PayrollScheme, string> = {
  salary: "Только оклад",
  percent: "Только процент",
  salary_percent: "Оклад + процент",
  category_bonus: "Бонус по категории",
  salary_category_bonus: "Оклад + бонус категории",
};

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { dateFrom: localDate(start), dateTo: localDate(end) };
}

function money(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} сом`;
}

function number(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value || 0);
}

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T00:00:00`)) : "-";
}

function formatDateTime(value: string) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-";
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function prorateSalary(monthlySalary: number, from: string, to: string) {
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let result = 0;
  while (current <= end) {
    const days = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
    result += Number(monthlySalary || 0) / days;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

function calculateRows(rows: PayrollRow[], dateFrom: string, dateTo: string) {
  return rows.map((row) => {
    const config = row.payroll;
    const fixedSalary =
      config.enabled && ["salary", "salary_percent", "salary_category_bonus"].includes(config.scheme)
        ? prorateSalary(config.monthlySalary, dateFrom, dateTo)
        : 0;
    const source = config.percentBase === "profit" ? Math.max(0, row.profit) : Math.max(0, row.revenue);
    const commission =
      config.enabled && ["category_bonus", "salary_category_bonus"].includes(config.scheme)
        ? row.categoryBonus
        : config.enabled && ["percent", "salary_percent"].includes(config.scheme)
          ? Math.round((source * config.percent / 100 + Number.EPSILON) * 100) / 100
          : 0;

    return { ...row, fixedSalary, commission, totalSalary: Math.round((fixedSalary + commission + Number.EPSILON) * 100) / 100 };
  });
}

export function PayrollPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const initialRange = useMemo(() => monthRange(0), []);
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom);
  const [dateTo, setDateTo] = useState(initialRange.dateTo);
  const [search, setSearch] = useState("");
  const [payrollPatches, setPayrollPatches] = useState<Record<string, PayrollRow["payroll"]>>({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const payrollQuery = useQuery({
    queryKey: ["payroll", dateFrom, dateTo],
    queryFn: () => getPayrollReport({ dateFrom, dateTo }),
  });

  const saveMutation = useMutation({
    mutationFn: () => savePayrollConfigs(rows),
    onSuccess: async () => {
      setPayrollPatches({});
      showToast({ tone: "success", title: "Настройки зарплаты сохранены" });
      await queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
  });

  const expenseMutation = useMutation({
    mutationFn: () =>
      addPayrollExpense({
        expenseDate: dateTo,
        amount: totals.totalSalary,
        description: `Зарплата за период ${formatDate(dateFrom)} - ${formatDate(dateTo)}. Сотрудников в расчете: ${totals.employees}.`,
      }),
    onSuccess: () => showToast({ tone: "success", title: "Зарплата добавлена в расходы" }),
  });

  useEffect(() => {
    if (payrollQuery.error) showToast({ tone: "error", title: "Не удалось загрузить зарплаты", description: getErrorText(payrollQuery.error) });
  }, [payrollQuery.error, showToast]);

  useEffect(() => {
    if (saveMutation.error) showToast({ tone: "error", title: "Не удалось сохранить настройки", description: getErrorText(saveMutation.error) });
  }, [saveMutation.error, showToast]);

  useEffect(() => {
    if (expenseMutation.error) showToast({ tone: "error", title: "Не удалось добавить расход", description: getErrorText(expenseMutation.error) });
  }, [expenseMutation.error, showToast]);

  const rows = (payrollQuery.data?.rows ?? []).map((row) => ({ ...row, payroll: payrollPatches[row.id] ?? row.payroll }));
  const calculatedRows = calculateRows(rows, dateFrom, dateTo);
  const query = normalize(search);
  const visibleRows = query ? calculatedRows.filter((row) => normalize(`${row.name} ${row.payroll.customPosition}`).includes(query)) : calculatedRows;
  const selectedEmployee = calculatedRows.find((row) => row.id === selectedEmployeeId) ?? null;
  const totals = calculatedRows.reduce(
    (sum, row) => ({
      employees: sum.employees + (row.payroll.enabled ? 1 : 0),
      documents: sum.documents + row.documents,
      revenue: sum.revenue + row.revenue,
      profit: sum.profit + row.profit,
      fixedSalary: sum.fixedSalary + row.fixedSalary,
      commission: sum.commission + row.commission,
      totalSalary: sum.totalSalary + row.totalSalary,
    }),
    { employees: 0, documents: 0, revenue: 0, profit: 0, fixedSalary: 0, commission: 0, totalSalary: 0 },
  );

  const patchRow = (id: string, patch: Partial<PayrollRow["payroll"]>) => {
    const source = rows.find((row) => row.id === id);
    if (!source) return;
    setPayrollPatches((current) => ({ ...current, [id]: { ...source.payroll, ...patch } }));
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Финансы персонала</p>
          <h1>Зарплаты</h1>
          <span>Расчет окладов и процентов по продажам МойСклад за выбранный период.</span>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !rows.length}>
            <Save size={17} /> {saveMutation.isPending ? "Сохраняю..." : "Сохранить"}
          </button>
          <button type="button" onClick={() => window.print()}>
            <Printer size={17} /> Печать
          </button>
        </div>
      </header>

      <section className={styles.filters}>
        <label><span>С даты</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>По дату</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label><span>Поиск</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Сотрудник или должность" /></label>
        <button type="button" onClick={() => { const range = monthRange(0); setDateFrom(range.dateFrom); setDateTo(range.dateTo); }}>Этот месяц</button>
        <button type="button" onClick={() => { const range = monthRange(-1); setDateFrom(range.dateFrom); setDateTo(range.dateTo); }}>Прошлый месяц</button>
        <button type="button" onClick={() => payrollQuery.refetch()}><RefreshCw size={16} /> Обновить</button>
      </section>

      <section className={styles.summary}>
        <article className={styles.total}><span>К выплате</span><strong>{money(totals.totalSalary)}</strong><small>{number(totals.employees)} сотрудников</small></article>
        <article><span>Выручка</span><strong>{money(totals.revenue)}</strong></article>
        <article><span>Оклады</span><strong>{money(totals.fixedSalary)}</strong></article>
        <article><span>Проценты</span><strong>{money(totals.commission)}</strong></article>
        <article><span>Документы</span><strong>{number(totals.documents)}</strong></article>
      </section>

      {payrollQuery.data?.totals.unassignedDocuments ? (
        <div className={styles.warning}>
          Без сотрудника: {number(payrollQuery.data.totals.unassignedDocuments)} продаж на {money(payrollQuery.data.totals.unassignedRevenue)}.
        </div>
      ) : null}

      <section className={styles.tablePanel}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Сотрудники</h2>
            <p>{payrollQuery.isLoading ? "Загружаю продажи и сотрудников..." : `${formatDate(dateFrom)} - ${formatDate(dateTo)} · ${visibleRows.length} строк`}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (totals.totalSalary <= 0) return showToast({ tone: "error", title: "Сумма зарплаты равна нулю" });
              if (window.confirm(`Добавить ${money(totals.totalSalary)} в расходы?`)) expenseMutation.mutate();
            }}
            disabled={expenseMutation.isPending}
          >
            <PlusCircle size={17} /> В расходы
          </button>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th><th>Должность</th><th>Схема</th><th>Оклад</th><th>%</th><th>База</th><th>Продажи</th><th>Выручка</th><th>Прибыль</th><th>Оклад</th><th>Комиссия</th><th>Итого</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className={!row.payroll.enabled ? styles.disabledRow : ""}>
                  <td>
                    <label className={styles.employeeCell}>
                      <input type="checkbox" checked={row.payroll.enabled} onChange={(event) => patchRow(row.id, { enabled: event.target.checked })} />
                      <span><strong>{row.name}</strong><small>{row.payroll.enabled ? "Участвует" : "Выключен"}</small></span>
                    </label>
                  </td>
                  <td>{row.payroll.customPosition || "Не указана"}</td>
                  <td>
                    <select value={row.payroll.scheme} onChange={(event) => patchRow(row.id, { scheme: event.target.value as PayrollScheme })}>
                      {Object.entries(schemeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={row.payroll.monthlySalary} readOnly /></td>
                  <td><input type="number" min="0" max="100" step="0.1" value={row.payroll.percent} disabled={!["percent", "salary_percent"].includes(row.payroll.scheme)} onChange={(event) => patchRow(row.id, { percent: Number(event.target.value) })} /></td>
                  <td>
                    <select value={row.payroll.percentBase} disabled={!["percent", "salary_percent"].includes(row.payroll.scheme)} onChange={(event) => patchRow(row.id, { percentBase: event.target.value as PayrollPercentBase })}>
                      <option value="revenue">Выручка</option>
                      <option value="profit">Прибыль</option>
                    </select>
                  </td>
                  <td><button className={styles.detailButton} type="button" onClick={() => setSelectedEmployeeId(row.id)}><Eye size={15} /> {number(row.documents)}</button></td>
                  <td>{money(row.revenue)}</td><td>{money(row.profit)}</td><td>{money(row.fixedSalary)}</td><td>{money(row.commission)}</td><td><strong>{money(row.totalSalary)}</strong></td>
                </tr>
              ))}
              {!visibleRows.length ? <tr><td colSpan={12}>{payrollQuery.isLoading ? "Загрузка..." : "Сотрудники не найдены."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEmployee ? (
        <div className={styles.modal} onClick={() => setSelectedEmployeeId("")}>
          <section className={styles.salesModal} onClick={(event) => event.stopPropagation()}>
            <header>
              <div><h2>{selectedEmployee.name}</h2><p>{formatDate(dateFrom)} - {formatDate(dateTo)} · {selectedEmployee.sales.length} документов · {money(selectedEmployee.revenue)}</p></div>
              <button type="button" onClick={() => setSelectedEmployeeId("")}>Закрыть</button>
            </header>
            <div className={styles.salesList}>
              {selectedEmployee.sales.length ? selectedEmployee.sales.map((sale) => (
                <article key={sale.id}>
                  <div className={styles.saleHead}>
                    <div><span>{sale.typeLabel || "Документ"} № {sale.name}</span><strong>{formatDateTime(sale.moment)}</strong></div>
                    <div><span>{sale.customerName || "Розничный покупатель"} · {money(sale.amount)}</span><strong className={sale.netProfit < 0 ? styles.negative : ""}>Прибыль: {money(sale.netProfit)}</strong></div>
                    {sale.webUrl ? <a href={sale.webUrl} target="_blank" rel="noreferrer">МойСклад</a> : null}
                  </div>
                  <div className={styles.products}>
                    {sale.products.map((product, index) => <span key={`${sale.id}-${index}`}><b>{product.code || "-"}</b>{product.name} · {number(product.quantity)} шт · {money(product.sum)}</span>)}
                  </div>
                </article>
              )) : <p>У сотрудника нет продаж за выбранный период.</p>}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
