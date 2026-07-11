"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { CrmRole, CrmUser, CrmUserUpdate } from "@/src/fsd/entities/user";
import { ROLE_LABELS } from "@/src/fsd/entities/user";
import { AppShell } from "@/src/fsd/widgets/app-shell";
import { AuthRequired, StatusPanel } from "@/src/fsd/shared/ui/status";
import { useToast } from "@/src/fsd/shared/ui/toast";
import { getErrorText, isUnauthorizedError } from "@/src/fsd/shared/lib/errors";
import { deleteCrmUser, getCrmUsers, updateCrmUser } from "../api/users-access-api";
import { BRANCHES, PERMISSIONS, filterUsers, generatePassword } from "../model/users-access-model";
import styles from "./users-access-page.module.css";

const roles = Object.keys(ROLE_LABELS) as CrmRole[];
const EMPTY_USERS: CrmUser[] = [];
const branchEntries = Object.entries(BRANCHES);
const permissionEntries = Object.entries(PERMISSIONS);

function UserEditor({
  user,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  user: CrmUser;
  onSave: (id: string, payload: CrmUserUpdate) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [form, setForm] = useState<CrmUserUpdate>({
    name: user.name,
    login: user.login,
    position: user.position,
    salary: user.salary,
    role: user.role,
    branches: user.branches.length ? user.branches : [branchEntries[0][0]],
    permissions: user.permissions,
    active: user.active,
  });
  const [password, setPassword] = useState("");

  const setField = <K extends keyof CrmUserUpdate>(field: K, value: CrmUserUpdate[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleValue = (field: "branches" | "permissions", value: string) => {
    setForm((current) => {
      const values = current[field];
      return {
        ...current,
        [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      };
    });
  };

  const handleSave = () => {
    onSave(user.id, {
      ...form,
      password: password.trim() || undefined,
    });
  };

  const handleDelete = () => {
    if (window.confirm(`Удалить сотрудника ${user.name || user.login}?`)) {
      onDelete(user.id);
    }
  };

  return (
    <section className={styles.editor}>
      <div className={styles.editorHeader}>
        <div>
          <h2>{user.name || "Сотрудник"}</h2>
          <span>{user.login}</span>
        </div>
        <div className={styles.editorActions}>
          <button className={styles.secondaryButton} onClick={handleDelete} disabled={deleting || saving}>
            Удалить
          </button>
          <button className={styles.primaryButton} onClick={handleSave} disabled={saving || deleting}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>

      <div className={styles.formGrid}>
        <label>
          Имя
          <input value={form.name} onChange={(event) => setField("name", event.target.value)} />
        </label>
        <label>
          Логин
          <input value={form.login} onChange={(event) => setField("login", event.target.value)} />
        </label>
        <label>
          Должность
          <input value={form.position} onChange={(event) => setField("position", event.target.value)} />
        </label>
        <label>
          Оклад
          <input
            type="number"
            min="0"
            value={form.salary}
            onChange={(event) => setField("salary", Number(event.target.value))}
          />
        </label>
        <label>
          Роль
          <select value={form.role} onChange={(event) => setField("role", event.target.value as CrmRole)}>
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.activeToggle}>
          <input type="checkbox" checked={form.active} onChange={(event) => setField("active", event.target.checked)} />
          Активен
        </label>
        <label>
          Новый пароль
          <div className={styles.passwordRow}>
            <input value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" onClick={() => setPassword(generatePassword())}>
              Сгенерировать
            </button>
          </div>
        </label>
      </div>

      <div className={styles.checkColumns}>
        <fieldset>
          <legend>Филиалы</legend>
          {branchEntries.map(([branch, label]) => (
            <label key={branch} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={form.branches.includes(branch)}
                onChange={() => toggleValue("branches", branch)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Разрешенные разделы</legend>
          <div className={styles.sectionsGrid}>
            {permissionEntries.map(([permission, label]) => (
              <label key={permission} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.permissions.includes(permission)}
                  onChange={() => toggleValue("permissions", permission)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

export function UsersAccessPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | CrmRole>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["crm-users"],
    queryFn: getCrmUsers,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CrmUserUpdate }) => updateCrmUser(id, payload),
    onSuccess: async (updatedUser) => {
      showToast({ tone: "success", title: "Сотрудник сохранен" });
      setSelectedId(updatedUser.id);
      await queryClient.invalidateQueries({ queryKey: ["crm-users"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCrmUser,
    onSuccess: async () => {
      showToast({ tone: "success", title: "Сотрудник удален" });
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["crm-users"] });
    },
  });

  const users = usersQuery.data ?? EMPTY_USERS;
  const filteredUsers = useMemo(() => filterUsers(users, search, role), [users, search, role]);
  const selectedUser = users.find((user) => user.id === selectedId) ?? filteredUsers[0] ?? null;

  useEffect(() => {
    if (usersQuery.error && !isUnauthorizedError(usersQuery.error)) {
      showToast({ tone: "error", title: "Не удалось загрузить сотрудников", description: getErrorText(usersQuery.error) });
    }
  }, [showToast, usersQuery.error]);

  useEffect(() => {
    if (saveMutation.error) {
      showToast({ tone: "error", title: "Не удалось сохранить сотрудника", description: getErrorText(saveMutation.error) });
    }
  }, [saveMutation.error, showToast]);

  useEffect(() => {
    if (deleteMutation.error) {
      showToast({ tone: "error", title: "Не удалось удалить сотрудника", description: getErrorText(deleteMutation.error) });
    }
  }, [deleteMutation.error, showToast]);

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1>Сотрудники и доступ</h1>
            <p>Управление учетными записями, ролями, филиалами и разрешениями.</p>
          </div>
        </header>

        {usersQuery.isLoading ? <StatusPanel title="Загрузка сотрудников" description="Получаем список из CRM." /> : null}
        {usersQuery.error && isUnauthorizedError(usersQuery.error) ? <AuthRequired /> : null}

        {!usersQuery.isLoading && !usersQuery.error ? (
          <div className={styles.grid}>
            <section className={styles.listPanel}>
              <div className={styles.filters}>
                <input
                  placeholder="Поиск по имени, логину, должности"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select value={role} onChange={(event) => setRole(event.target.value as "all" | CrmRole)}>
                  <option value="all">Все роли</option>
                  {roles.map((roleName) => (
                    <option key={roleName} value={roleName}>
                      {ROLE_LABELS[roleName]}
                    </option>
                  ))}
                </select>
              </div>

              {filteredUsers.length === 0 ? (
                <StatusPanel title="Сотрудники не найдены" description="Измените поиск или фильтр роли." />
              ) : (
                <div className={styles.userList}>
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      className={`${styles.userRow} ${selectedUser?.id === user.id ? styles.selected : ""}`}
                      onClick={() => setSelectedId(user.id)}
                    >
                      <strong>{user.name || user.login}</strong>
                      <span>{user.position || "Без должности"}</span>
                      <small>{ROLE_LABELS[user.role]}</small>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedUser ? (
              <UserEditor
                key={selectedUser.id}
                user={selectedUser}
                saving={saveMutation.isPending}
                deleting={deleteMutation.isPending}
                onSave={(id, payload) => saveMutation.mutate({ id, payload })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
