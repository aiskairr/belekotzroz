"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, Bot, CheckCheck, MessageCircle, Phone, Play, RefreshCw, Search, Send, Settings, Star, Users } from "lucide-react";
import { useToast } from "@/src/fsd/shared/ui/toast";
import { getErrorText } from "@/src/fsd/shared/lib/errors";
import {
  getWahaSession,
  getWhatsappCustomers,
  sendWahaBatch,
  sendWahaText,
  startWahaSession,
  type WahaRecipient,
  type WhatsappCustomer,
} from "../api/whatsapp-broadcast-api";
import styles from "./whatsapp-broadcast-page.module.css";

const digits = (value: string) => value.replace(/\D/g, "");
const settingsKey = "ordoWahaBackendSettings";

const getStoredWahaSettings = () => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(settingsKey) || "{}") as { url?: string; apiKey?: string; session?: string };
  } catch {
    return {};
  }
};

const recipientFromCustomer = (customer: WhatsappCustomer): WahaRecipient | null => {
  const phone = digits(customer.whatsappPhone || customer.phone);
  if (!phone) return null;
  return { phone, name: customer.name };
};

const parseManualRecipients = (value: string): WahaRecipient[] => {
  return value
    .split(/\n|,|;/)
    .map((line) => {
      const phone = digits(line);
      return phone ? { phone } : null;
    })
    .filter((item): item is WahaRecipient => Boolean(item));
};

const initials = (name: string) => (name || "?").trim().slice(0, 1).toUpperCase();
const avatarTone = (index: number) => ["teal", "violet", "amber", "blue", "rose", "green"][index % 6];

export function WhatsappBroadcastPage() {
  const { showToast } = useToast();
  const storedSettings = getStoredWahaSettings();
  const [search, setSearch] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [baseUrl, setBaseUrl] = useState(storedSettings.url || "http://127.0.0.1:3300");
  const [apiKey, setApiKey] = useState(storedSettings.apiKey || "change-me");
  const [session, setSession] = useState(storedSettings.session || "default");
  const [selected, setSelected] = useState<WhatsappCustomer | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [message, setMessage] = useState("");
  const [campaignName, setCampaignName] = useState("Рассылка клиентам");
  const [bulkPhones, setBulkPhones] = useState("");
  const [bulkMessage, setBulkMessage] = useState("Здравствуйте, {name}! ");
  const [videoLinks, setVideoLinks] = useState("");
  const [dryRun, setDryRun] = useState(true);

  useEffect(() => {
    localStorage.setItem(settingsKey, JSON.stringify({ url: baseUrl, apiKey, session }));
  }, [apiKey, baseUrl, session]);

  const customersQuery = useQuery({
    queryKey: ["whatsapp-customers", search, customerType],
    queryFn: () => getWhatsappCustomers({ search, customerType }),
  });
  const sessionQuery = useQuery({
    queryKey: ["waha-session", baseUrl, apiKey, session],
    queryFn: () => getWahaSession(baseUrl, apiKey, session),
    retry: false,
  });

  const visibleRecipients = useMemo(() => {
    const byPhone = new Map<string, WahaRecipient>();
    for (const customer of customersQuery.data ?? []) {
      const recipient = recipientFromCustomer(customer);
      if (recipient) byPhone.set(recipient.phone, recipient);
    }
    return [...byPhone.values()];
  }, [customersQuery.data]);

  const bulkRecipients = useMemo(() => {
    const byPhone = new Map<string, WahaRecipient>();
    for (const recipient of parseManualRecipients(bulkPhones)) byPhone.set(recipient.phone, recipient);
    return [...byPhone.values()];
  }, [bulkPhones]);

  const startMutation = useMutation({
    mutationFn: () => startWahaSession(baseUrl, apiKey, session),
    onSuccess: () => sessionQuery.refetch(),
  });
  const sendMutation = useMutation({
    mutationFn: () => sendWahaText(baseUrl, apiKey, { phone: digits(selected?.whatsappPhone || selected?.phone || manualPhone), text: message, session }),
    onSuccess: () => {
      showToast({ tone: "success", title: "Сообщение отправлено" });
      setMessage("");
    },
    onError: (error) => showToast({ tone: "error", title: "Не удалось отправить", description: getErrorText(error) }),
  });
  const batchMutation = useMutation({
    mutationFn: () => sendWahaBatch(baseUrl, apiKey, {
      recipients: bulkRecipients,
      textTemplate: bulkMessage,
      videoLinks: videoLinks.split(/\n|,|;/).map((link) => link.trim()).filter(Boolean),
      session,
      dryRun,
    }),
    onSuccess: (data) => {
      const job = data.job;
      showToast({
        tone: "success",
        title: dryRun ? "Проверка рассылки готова" : "Рассылка запущена",
        description: job?.id || data.jobId || `${job?.total || data.total || bulkRecipients.length} номеров`,
      });
    },
    onError: (error) => showToast({ tone: "error", title: "Не удалось запустить рассылку", description: getErrorText(error) }),
  });

  const selectedPhone = selected?.phone || selected?.whatsappPhone || manualPhone;
  const selectedName = selected?.name || manualName || "Выберите чат";
  const sessionStatus = sessionQuery.isError ? "Не подключен" : sessionQuery.isLoading ? "Проверяю..." : "WAHA доступен";

  return (
    <section className={styles.whatsapp}>
      <aside className={styles.rail}>
        <button className={styles.railActive} type="button"><MessageCircle size={24} /><b>{visibleRecipients.length}</b></button>
        <button type="button"><Phone size={23} /></button>
        <button type="button"><Users size={23} /></button>
        <i />
        <button type="button"><Archive size={23} /></button>
        <button type="button"><Star size={23} /></button>
        <span />
        <button type="button"><Bot size={23} /></button>
        <button type="button"><Settings size={23} /></button>
      </aside>

      <aside className={styles.chatList}>
        <header>
          <div>
            <h1>Чаты</h1>
            <p>{sessionStatus}</p>
          </div>
          <button onClick={() => customersQuery.refetch()} type="button"><RefreshCw size={18} /></button>
        </header>
        <div className={styles.search}>
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" />
        </div>
        <select className={styles.typeFilter} value={customerType} onChange={(event) => setCustomerType(event.target.value)}>
          <option value="">Все клиенты</option>
          <option value="legal">Юрлица</option>
          <option value="person">Физлица</option>
        </select>
        <div className={styles.contacts}>
          {(customersQuery.data ?? []).map((customer, index) => (
            <button key={customer.id} className={selected?.id === customer.id ? styles.contactActive : ""} onClick={() => setSelected(customer)} type="button">
              <span className={`${styles.avatar} ${styles[avatarTone(index)]}`}>{initials(customer.name)}</span>
              <span className={styles.contactBody}>
                <span><b>{customer.name}</b><time>{index < 2 ? "сейчас" : index < 5 ? "вчера" : "вторник"}</time></span>
                <small><CheckCheck size={16} /> {customer.phone || customer.whatsappPhone} {customer.inn ? `· ИНН ${customer.inn}` : ""}</small>
              </span>
              {index % 4 === 1 ? <em>{index + 1}</em> : null}
            </button>
          ))}
          {!customersQuery.data?.length ? <p className={styles.emptyList}>{customersQuery.isLoading ? "Загрузка..." : "Контакты не найдены."}</p> : null}
        </div>
      </aside>

      <main className={styles.chat}>
        <header className={styles.chatHeader}>
          <div className={`${styles.avatar} ${styles.teal}`}>{initials(selectedName)}</div>
          <div>
            <h2>{selectedName}</h2>
            <p>{selectedPhone || "Номер не выбран"}</p>
          </div>
          <button onClick={() => setBulkPhones(visibleRecipients.map((item) => item.phone).join("\n"))} disabled={!visibleRecipients.length} type="button">
            В рассылку
          </button>
        </header>

        <section className={styles.chatCanvas}>
          {selectedPhone ? (
            <>
              <article className={styles.bubbleIn}>Здравствуйте! Можно узнать актуальную информацию?</article>
              <article className={styles.bubbleOut}>Да, напишите сообщение и отправьте через WAHA.</article>
            </>
          ) : (
            <div className={styles.blank}>
              <MessageCircle size={76} />
              <h2>WhatsApp рассылка</h2>
              <p>Выберите клиента слева или введите ручной номер ниже.</p>
            </div>
          )}
        </section>

        <section className={styles.composer}>
          <div className={styles.manual}>
            <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Имя" />
            <input value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} placeholder="+996..." />
            <button onClick={() => setSelected({ id: `manual:${manualPhone}`, name: manualName || manualPhone, phone: manualPhone, whatsappPhone: digits(manualPhone), inn: "", customerTypeLabel: "Номер" })} type="button">
              Выбрать
            </button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); sendMutation.mutate(); }}>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Сообщение клиенту" />
            <button disabled={sendMutation.isPending || !message.trim() || !(selected || manualPhone)} type="submit">
              <Send size={19} />
            </button>
          </form>
        </section>
      </main>

      <aside className={styles.broadcast}>
        <header>
          <h2>Рассылка</h2>
          <p>{bulkRecipients.length} получателей</p>
        </header>
        <label>
          <span>Название</span>
          <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
        </label>
        <label>
          <span>Получатели</span>
          <textarea value={bulkPhones} onChange={(event) => setBulkPhones(event.target.value)} placeholder="Номера через запятую или с новой строки" />
        </label>
        <label>
          <span>Текст</span>
          <textarea value={bulkMessage} onChange={(event) => setBulkMessage(event.target.value)} placeholder="Здравствуйте, {name}! ..." />
        </label>
        <label>
          <span>Видео-ссылки</span>
          <textarea value={videoLinks} onChange={(event) => setVideoLinks(event.target.value)} placeholder="Ссылки с новой строки" />
        </label>
        <div className={styles.connection}>
          <strong>WAHA</strong>
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          <input value={session} onChange={(event) => setSession(event.target.value)} />
          <div>
            <button onClick={() => sessionQuery.refetch()} type="button">Проверить</button>
            <button onClick={() => startMutation.mutate()} type="button">Подключить</button>
          </div>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
          Только проверка
        </label>
        <button className={styles.launchButton} onClick={() => batchMutation.mutate()} disabled={!bulkMessage.trim() || !bulkRecipients.length || batchMutation.isPending} type="button">
          <Play size={18} /> {dryRun ? "Проверить" : "Запустить"}
        </button>
      </aside>
    </section>
  );
}
