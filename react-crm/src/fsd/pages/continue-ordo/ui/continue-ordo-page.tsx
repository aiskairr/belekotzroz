import { ArrowUpRight, ExternalLink } from "lucide-react";
import Image from "next/image";
import styles from "./continue-ordo-page.module.css";

const ORDO_CRM_URL = "https://ordo-crm.onrender.com";

export function ContinueOrdoPage() {
  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />

      <section className={styles.card}>
        <div className={styles.logoWrap}>
          <Image
            src="/ordo-logo.svg"
            alt="ORDO CRM"
            width={184}
            height={64}
            priority
          />
        </div>

        <div className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          Рабочая система доступна
        </div>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>Переход в ORDO CRM</p>
          <h1>Продолжите работу в основной системе</h1>
          <p className={styles.description}>
            Для работы с продажами, клиентами и отчётами перейдите в действующую
            версию ORDO CRM.
          </p>
        </div>

        <a className={styles.primaryAction} href={ORDO_CRM_URL}>
          Перейти в ORDO CRM
          <ArrowUpRight size={21} strokeWidth={2.4} aria-hidden="true" />
        </a>

        <a className={styles.address} href={ORDO_CRM_URL}>
          <ExternalLink size={15} aria-hidden="true" />
          ordo-crm.onrender.com
        </a>

        <p className={styles.hint}>
          Сохраните новую страницу в закладках браузера, чтобы быстро открывать CRM.
        </p>
      </section>

      <footer className={styles.footer}>ORDO CRM · Рабочее пространство команды</footer>
    </main>
  );
}
