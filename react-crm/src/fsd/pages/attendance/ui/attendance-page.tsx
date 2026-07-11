"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Download, MapPin, Plus, RefreshCw, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/src/fsd/widgets/app-shell";
import { AuthRequired, StatusPanel } from "@/src/fsd/shared/ui/status";
import { useToast } from "@/src/fsd/shared/ui/toast";
import { getErrorText, isUnauthorizedError } from "@/src/fsd/shared/lib/errors";
import {
  adminOpenAttendanceShift,
  closeAttendanceShift,
  deleteAttendanceStore,
  getAttendanceReport,
  getAttendanceStatus,
  getCrmSession,
  openAttendanceShift,
  saveAttendanceSchedule,
  saveAttendanceStore,
  type AttendanceStore,
  type AttendanceStorePayload,
} from "../api/attendance-api";
import {
  branchLabels,
  canManageAttendance,
  canViewReports,
  exportAttendanceCsv,
  findNearestAllowedStore,
  formatDateTime,
  formatDuration,
  formatMeters,
  formatNumber,
  getCurrentPosition,
  isAttendanceRequiredForUser,
  recordWorkMinutes,
  todayIsoDate,
} from "../model/attendance-model";
import styles from "./attendance-page.module.css";

type StoreForm = AttendanceStorePayload & { id?: string };

const emptyStoreForm: StoreForm = {
  name: "",
  branch: "ayu",
  address: "",
  latitude: 0,
  longitude: 0,
  allowedRadiusMeters: 10,
};

function useWorkTimer(checkInTime?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!checkInTime) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [checkInTime]);

  if (!checkInTime) return 0;
  return Math.max(0, Math.floor((now - new Date(checkInTime).getTime()) / 60000));
}

export function AttendancePage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [dateFrom, setDateFrom] = useState(todayIsoDate);
  const [dateTo, setDateTo] = useState(todayIsoDate);
  const [userId, setUserId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState(false);
  const [storeForm, setStoreForm] = useState<StoreForm>(emptyStoreForm);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [adminOpenUserId, setAdminOpenUserId] = useState("");
  const [adminOpenStoreId, setAdminOpenStoreId] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<{ workStartsAt: string; workEndsAt: string } | null>(null);

  const sessionQuery = useQuery({ queryKey: ["crm-session"], queryFn: getCrmSession });
  const statusQuery = useQuery({ queryKey: ["attendance-status"], queryFn: getAttendanceStatus });
  const reportQuery = useQuery({
    queryKey: ["attendance-report", dateFrom, dateTo, userId, storeId],
    queryFn: () => getAttendanceReport({ dateFrom, dateTo, userId, storeId }),
    enabled: Boolean(sessionQuery.data?.user),
  });

  const currentUser = sessionQuery.data?.user ?? null;
  const working = statusQuery.data?.status === "working";
  const required = isAttendanceRequiredForUser(currentUser);
  const managerView = canViewReports(currentUser);
  const adminView = canManageAttendance(currentUser);
  const employeeView = required && !managerView;
  const workMinutes = useWorkTimer(working ? statusQuery.data?.openRecord?.checkInTime : undefined);
  const report = reportQuery.data;
  const selectedAdminUserId = adminOpenUserId || report?.users[0]?.id || "";
  const selectedAdminStoreId = adminOpenStoreId || report?.stores[0]?.id || "";
  const schedule = scheduleDraft ?? report?.schedule ?? { workStartsAt: "09:00", workEndsAt: "18:00" };

  const invalidateAttendance = async () => {
    await queryClient.invalidateQueries({ queryKey: ["attendance-status"] });
    await queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    await queryClient.invalidateQueries({ queryKey: ["crm-session"] });
  };

  const shiftMutation = useMutation({
    mutationFn: async (mode: "open" | "close") => {
      setActionError(false);
      setActionStatus("Запрашиваю геолокацию...");

      const position = await getCurrentPosition();
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const stores = report?.stores ?? [];
      const activeStoreId = mode === "close" ? statusQuery.data?.openRecord?.storeId : "";
      const currentStore = activeStoreId ? stores.find((store) => store.id === activeStoreId) : null;
      const nearest = currentStore
        ? {
            store: currentStore,
            distance: findNearestAllowedStore([currentStore], latitude, longitude)?.distance ?? Number.POSITIVE_INFINITY,
          }
        : findNearestAllowedStore(stores, latitude, longitude);

      if (!nearest) {
        throw new Error("Нет рабочей точки для проверки геолокации. Обратитесь к администратору.");
      }

      if (nearest.distance > nearest.store.allowedRadiusMeters) {
        throw new Error(
          `Вы вне зоны офиса. Ближайшая точка: ${nearest.store.name}, расстояние ${formatMeters(nearest.distance)}, разрешено ${formatMeters(nearest.store.allowedRadiusMeters)}.`,
        );
      }

      setActionStatus(`Вы в зоне ${nearest.store.name}. Отправляю отметку...`);
      const payload = {
        storeId: nearest.store.id,
        latitude,
        longitude,
        deviceInfo: navigator.userAgent,
      };

      return mode === "open" ? openAttendanceShift(payload) : closeAttendanceShift(payload);
    },
    onSuccess: async (result) => {
      setActionError(false);
      setActionStatus(`${result.message || "Смена обновлена"}. Расстояние: ${formatMeters(result.distanceMeters)}.`);
      showToast({ tone: "success", title: result.action === "check_in" ? "Смена открыта" : "Смена завершена" });
      await invalidateAttendance();
    },
    onError: (error) => {
      setActionError(true);
      setActionStatus(getErrorText(error));
      showToast({ tone: "error", title: "Не удалось обновить смену", description: getErrorText(error) });
    },
  });

  const storeMutation = useMutation({
    mutationFn: saveAttendanceStore,
    onSuccess: async () => {
      showToast({ tone: "success", title: "Рабочая точка сохранена" });
      setIsStoreModalOpen(false);
      setStoreForm(emptyStoreForm);
      await queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    },
  });

  const deleteStoreMutation = useMutation({
    mutationFn: deleteAttendanceStore,
    onSuccess: async () => {
      showToast({ tone: "success", title: "Рабочая точка удалена" });
      await queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: saveAttendanceSchedule,
    onSuccess: async (schedule) => {
      setScheduleDraft(schedule);
      showToast({ tone: "success", title: "График сохранен" });
      await queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    },
  });

  const adminOpenMutation = useMutation({
    mutationFn: adminOpenAttendanceShift,
    onSuccess: async () => {
      showToast({ tone: "success", title: "Смена открыта администратором" });
      await invalidateAttendance();
    },
  });

  const totals = useMemo(
    () => [
      { label: "Записей", value: formatNumber(report?.totals.records ?? 0) },
      { label: "На работе", value: formatNumber(report?.totals.open ?? 0) },
      { label: "Отработано", value: formatDuration(report?.totals.totalWorkMinutes ?? 0) },
      { label: "Опозданий", value: formatDuration(report?.totals.lateMinutes ?? 0) },
    ],
    [report],
  );

  const fillStoreLocation = async () => {
    setActionError(false);
    setActionStatus("Запрашиваю координаты устройства...");
    const position = await getCurrentPosition();
    const accuracy = Math.round(Number(position.coords.accuracy || 0));
    setStoreForm((current) => ({
      ...current,
      latitude: Number(position.coords.latitude.toFixed(7)),
      longitude: Number(position.coords.longitude.toFixed(7)),
      allowedRadiusMeters: accuracy > 20 ? Math.min(100, Math.max(30, accuracy)) : current.allowedRadiusMeters,
    }));
    setActionStatus(`Координаты подставлены. Погрешность GPS: примерно ${accuracy} м.`);
  };

  const openStoreForm = (store?: AttendanceStore) => {
    setStoreForm(
      store
        ? {
            id: store.id,
            name: store.name,
            branch: store.branch || "ayu",
            address: store.address,
            latitude: store.latitude,
            longitude: store.longitude,
            allowedRadiusMeters: store.allowedRadiusMeters,
          }
        : emptyStoreForm,
    );
    setIsStoreModalOpen(true);
  };

  const hasLoadError = sessionQuery.error || statusQuery.error || reportQuery.error;

  useEffect(() => {
    if (hasLoadError && ![sessionQuery.error, statusQuery.error, reportQuery.error].some(isUnauthorizedError)) {
      showToast({ tone: "error", title: "Не удалось загрузить посещаемость", description: getErrorText(hasLoadError) });
    }
  }, [hasLoadError, reportQuery.error, sessionQuery.error, showToast, statusQuery.error]);

  useEffect(() => {
    if (storeMutation.error) {
      showToast({ tone: "error", title: "Не удалось сохранить точку", description: getErrorText(storeMutation.error) });
    }
  }, [showToast, storeMutation.error]);

  useEffect(() => {
    if (deleteStoreMutation.error) {
      showToast({ tone: "error", title: "Не удалось удалить точку", description: getErrorText(deleteStoreMutation.error) });
    }
  }, [deleteStoreMutation.error, showToast]);

  useEffect(() => {
    if (scheduleMutation.error) {
      showToast({ tone: "error", title: "Не удалось сохранить график", description: getErrorText(scheduleMutation.error) });
    }
  }, [scheduleMutation.error, showToast]);

  useEffect(() => {
    if (adminOpenMutation.error) {
      showToast({ tone: "error", title: "Не удалось открыть смену", description: getErrorText(adminOpenMutation.error) });
    }
  }, [adminOpenMutation.error, showToast]);

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p>Геозона посещаемости</p>
            <h1>{managerView ? "Посещаемость сотрудников" : "Открытие смены"}</h1>
            <span>
              {managerView
                ? "Кто на работе, сколько отработал, кто опоздал и какие рабочие точки активны."
                : "Одна кнопка открывает смену только внутри зоны офиса."}
            </span>
          </div>
          <section className={styles.statusCard}>
            <span>Текущий статус</span>
            <strong>{statusQuery.isLoading ? "Загрузка..." : working ? "На работе" : "Не на работе"}</strong>
            <small>{working ? formatDuration(workMinutes) : "00:00"}</small>
          </section>
        </header>

        {hasLoadError && [sessionQuery.error, statusQuery.error, reportQuery.error].some(isUnauthorizedError) ? <AuthRequired /> : null}

        {employeeView ? (
          <section className={styles.employeeGrid}>
            {!working ? (
              <div className={styles.shiftPrompt}>
                <div className={styles.shiftIcon}>
                  <ShieldCheck size={34} />
                </div>
                <p>Смена еще не открыта</p>
                <h2>Откройте смену, чтобы продолжить работу в CRM</h2>
                <span>Система запросит геолокацию и проверит, что вы в зоне одной из рабочих точек.</span>
                <button type="button" onClick={() => shiftMutation.mutate("open")} disabled={shiftMutation.isPending || reportQuery.isLoading}>
                  {shiftMutation.isPending ? "Проверяю..." : "Открыть смену"}
                </button>
                {actionStatus ? <strong className={actionError ? styles.errorText : ""}>{actionStatus}</strong> : null}
              </div>
            ) : (
              <div className={styles.shiftPrompt}>
                <div className={styles.shiftIcon}>
                  <Clock3 size={34} />
                </div>
                <p>Смена открыта</p>
                <h2>{formatDuration(workMinutes)} на смене</h2>
                <span>{statusQuery.data?.openRecord?.storeName || "Рабочая точка определена при открытии смены"}</span>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => {
                    if (window.confirm("Завершить текущую смену? Система проверит геолокацию офиса.")) {
                      shiftMutation.mutate("close");
                    }
                  }}
                  disabled={shiftMutation.isPending}
                >
                  {shiftMutation.isPending ? "Проверяю..." : "Завершить смену"}
                </button>
                {actionStatus ? <strong className={actionError ? styles.errorText : ""}>{actionStatus}</strong> : null}
              </div>
            )}
          </section>
        ) : null}

        {managerView ? (
          <section className={styles.managerGrid}>
            <div className={styles.reportCard}>
              <div className={styles.sectionHead}>
                <div>
                  <p>Отчеты</p>
                  <h2>Смены сотрудников</h2>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={() => exportAttendanceCsv(report?.rows ?? [], dateFrom, dateTo)}>
                  <Download size={18} />
                  CSV
                </button>
              </div>
              <div className={styles.filters}>
                <label className={styles.field}>
                  <span>С даты</span>
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>По дату</span>
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Сотрудник</span>
                  <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                    <option value="">Все сотрудники</option>
                    {(report?.users ?? []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Точка</span>
                  <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                    <option value="">Все точки</option>
                    {(report?.stores ?? []).map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => reportQuery.refetch()}>
                  <RefreshCw size={18} />
                  Обновить
                </button>
              </div>

              <div className={styles.totals}>
                {totals.map((item) => (
                  <article key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>

              <div className={styles.recordsList}>
                {reportQuery.isLoading ? <StatusPanel title="Загрузка отчета" /> : null}
                {!reportQuery.isLoading && !report?.rows.length ? <StatusPanel title="За выбранный период записей нет" /> : null}
                {(report?.rows ?? []).map((record) => (
                  <article key={record.id} className={styles.recordRow}>
                    <div>
                      <strong>{record.userName || "Сотрудник"}</strong>
                      <small>{record.storeName || "-"}</small>
                    </div>
                    <div>
                      <small>Приход</small>
                      <strong>{formatDateTime(record.checkInTime)}</strong>
                    </div>
                    <div>
                      <small>Уход</small>
                      <strong>{record.checkOutTime ? formatDateTime(record.checkOutTime) : "-"}</strong>
                    </div>
                    <div>
                      <small>Время</small>
                      <strong>{formatDuration(recordWorkMinutes(record))}</strong>
                    </div>
                    <div>
                      <small>Опоздание</small>
                      <strong>{record.lateMinutes ? formatDuration(record.lateMinutes) : "-"}</strong>
                    </div>
                    <span className={`${styles.badge} ${record.status === "closed" ? styles.closed : ""}`}>
                      {record.status === "open" ? "На работе" : "Закрыто"}
                    </span>
                  </article>
                ))}
              </div>
            </div>

            {adminView ? (
              <aside className={styles.adminCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <p>Админ</p>
                    <h2>Рабочие точки</h2>
                  </div>
                  <button type="button" onClick={() => openStoreForm()}>
                    <Plus size={18} />
                    Точка
                  </button>
                </div>

                <section className={styles.scheduleBox}>
                  <div>
                    <p>График работы</p>
                    <span>Используется для расчета опозданий.</span>
                  </div>
                  <label className={styles.field}>
                    <span>Начало</span>
                    <input
                      type="time"
                      value={schedule.workStartsAt}
                      onChange={(event) => setScheduleDraft((current) => ({ ...(current ?? schedule), workStartsAt: event.target.value }))}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Конец</span>
                    <input
                      type="time"
                      value={schedule.workEndsAt}
                      onChange={(event) => setScheduleDraft((current) => ({ ...(current ?? schedule), workEndsAt: event.target.value }))}
                    />
                  </label>
                  <button type="button" onClick={() => scheduleMutation.mutate(schedule)} disabled={scheduleMutation.isPending}>
                    {scheduleMutation.isPending ? "Сохраняю..." : "Сохранить график"}
                  </button>
                </section>

                <div className={styles.adminOpen}>
                  <label className={styles.field}>
                    <span>Открыть смену</span>
                    <select value={selectedAdminUserId} onChange={(event) => setAdminOpenUserId(event.target.value)}>
                      {(report?.users ?? []).map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Точка</span>
                    <select value={selectedAdminStoreId} onChange={(event) => setAdminOpenStoreId(event.target.value)}>
                      {(report?.stores ?? []).map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={!selectedAdminUserId || !selectedAdminStoreId || adminOpenMutation.isPending}
                    onClick={() => adminOpenMutation.mutate({ userId: selectedAdminUserId, storeId: selectedAdminStoreId })}
                  >
                    <UserCheck size={18} />
                    Открыть
                  </button>
                </div>

                <div className={styles.storesList}>
                  {(report?.stores ?? []).map((store) => (
                    <article key={store.id} className={styles.storeRow}>
                      <div className={styles.storeMain}>
                        <div>
                          <strong>{store.name}</strong>
                          <small>{store.address || branchLabels[store.branch] || "Адрес не указан"}</small>
                        </div>
                        <span className={styles.badge}>Активна</span>
                      </div>
                      <div className={styles.storeMeta}>
                        <span>
                          {store.latitude.toFixed(6)}, {store.longitude.toFixed(6)}
                        </span>
                        <span>Радиус {formatMeters(store.allowedRadiusMeters)}</span>
                      </div>
                      <div className={styles.storeActions}>
                        <button type="button" onClick={() => openStoreForm(store)}>
                          Изменить
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => {
                            if (window.confirm(`Удалить рабочую точку "${store.name}" навсегда?`)) {
                              deleteStoreMutation.mutate(store.id);
                            }
                          }}
                          disabled={deleteStoreMutation.isPending}
                        >
                          <Trash2 size={16} />
                          Удалить навсегда
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </aside>
            ) : null}
          </section>
        ) : null}

        {isStoreModalOpen ? (
          <div className={styles.modal} onClick={() => setIsStoreModalOpen(false)}>
            <form
              className={styles.storeForm}
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                storeMutation.mutate(storeForm);
              }}
            >
              <div className={styles.sectionHead}>
                <div>
                  <p>Рабочая точка</p>
                  <h2>{storeForm.id ? "Изменить точку" : "Новая точка"}</h2>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={() => setIsStoreModalOpen(false)}>
                  Закрыть
                </button>
              </div>
              <label className={styles.field}>
                <span>Название</span>
                <input required value={storeForm.name} onChange={(event) => setStoreForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className={styles.field}>
                <span>Филиал</span>
                <select value={storeForm.branch} onChange={(event) => setStoreForm((current) => ({ ...current, branch: event.target.value }))}>
                  {Object.entries(branchLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldWide}>
                <span>Адрес</span>
                <input value={storeForm.address} onChange={(event) => setStoreForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <label className={styles.field}>
                <span>Latitude</span>
                <input
                  required
                  type="number"
                  step="0.0000001"
                  value={storeForm.latitude}
                  onChange={(event) => setStoreForm((current) => ({ ...current, latitude: Number(event.target.value) }))}
                />
              </label>
              <label className={styles.field}>
                <span>Longitude</span>
                <input
                  required
                  type="number"
                  step="0.0000001"
                  value={storeForm.longitude}
                  onChange={(event) => setStoreForm((current) => ({ ...current, longitude: Number(event.target.value) }))}
                />
              </label>
              <label className={styles.field}>
                <span>Радиус, м</span>
                <input
                  required
                  type="number"
                  min="1"
                  value={storeForm.allowedRadiusMeters}
                  onChange={(event) => setStoreForm((current) => ({ ...current, allowedRadiusMeters: Number(event.target.value) }))}
                />
              </label>
              <button type="button" className={styles.secondaryButton} onClick={fillStoreLocation}>
                <MapPin size={18} />
                Взять мои координаты
              </button>
              <button type="submit" disabled={storeMutation.isPending}>
                {storeMutation.isPending ? "Сохраняю..." : "Сохранить точку"}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
