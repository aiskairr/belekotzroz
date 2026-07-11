import type { CrmRole, CrmUser } from "@/src/fsd/entities/user";

export const PERMISSIONS = {
  sales: "Продажи",
  debtSale: "Продажа в долг",
  deliveries: "Доставки",
  attendance: "Посещаемость",
  reports: "Отчетность",
  bankCommissions: "Банковские комиссии",
  reportProfit: "Показывать прибыль в отчетности",
  expenses: "Расходы",
  payroll: "Зарплаты",
  commercialDocuments: "Счета юрлицам",
  reconciliation: "Акт сверки",
  whatsappBroadcast: "WhatsApp рассылка",
  priceFormula: "Расчет цен",
  customsCalculator: "Калькулятор таможни",
  audit: "Журнал действий",
  users: "Сотрудники и доступ",
  about: "О системе",
};

export const BRANCHES = {
  ayu: "Аю-Гранд",
  besh: "Беш-Сары",
};

export function filterUsers(users: CrmUser[], search: string, role: "all" | CrmRole) {
  const normalizedSearch = search.trim().toLowerCase();

  return users.filter((user) => {
    const matchesRole = role === "all" || user.role === role;
    const matchesSearch =
      !normalizedSearch ||
      [user.name, user.login, user.position].some((field) => field.toLowerCase().includes(normalizedSearch));

    return matchesRole && matchesSearch;
  });
}

export function generatePassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const symbols = "!@#$%";
  const password = Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  return `${password}${symbols[Math.floor(Math.random() * symbols.length)]}`;
}
