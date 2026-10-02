import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminUsersQueryKey,
  useDeleteAdminUser,
  useGetAdminUsers,
} from "@workspace/api-client-react";
import { Search, ShieldCheck, Trash2, Users } from "lucide-react";

type Lang = "bn" | "en";

const text = (lang: Lang, bn: string, en: string) => (lang === "bn" ? bn : en);

export default function AdminUsersPage({
  lang,
  currentEmail,
}: {
  lang: Lang;
  currentEmail: string;
}) {
  const queryClient = useQueryClient();
  const usersQuery = useGetAdminUsers();
  const deleteUser = useDeleteAdminUser();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const accounts = (usersQuery.data ?? []).filter(
    (account) => account.role === "editor" || account.role === "super_admin",
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visibleAccounts = accounts.filter((account) =>
    `${account.email} ${account.role}`.toLowerCase().includes(normalizedSearch),
  );
  const editorAccounts = accounts.filter((account) => account.role === "editor");
  const visibleEditors = visibleAccounts.filter(
    (account) => account.role === "editor" && account.email !== currentEmail,
  );
  const selectedEditors = selected.filter((selectedEmail) =>
    editorAccounts.some((account) => account.email === selectedEmail),
  );
  const allVisibleEditorsSelected =
    visibleEditors.length > 0 &&
    visibleEditors.every((account) => selected.includes(account.email));

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });

  const toggleEditor = (selectedEmail: string) => {
    setSelected((current) =>
      current.includes(selectedEmail)
        ? current.filter((value) => value !== selectedEmail)
        : [...current, selectedEmail],
    );
  };

  const toggleVisibleEditors = () => {
    const visibleEmails = visibleEditors.map((account) => account.email);
    setSelected((current) =>
      allVisibleEditorsSelected
        ? current.filter((value) => !visibleEmails.includes(value))
        : [...new Set([...current, ...visibleEmails])],
    );
  };

  const deleteSelectedEditors = async () => {
    if (selectedEditors.length === 0) return;
    const confirmed = window.confirm(
      text(
        lang,
        `এই Editor অ্যাকাউন্টগুলো মুছে ফেলবেন?\n${selectedEditors.join(", ")}\nতাদের সেশনও বন্ধ হবে।`,
        `Delete these Editor accounts?\n${selectedEditors.join(", ")}\nTheir sessions will also be revoked.`,
      ),
    );
    if (!confirmed) return;

    setMessage("");
    const results = await Promise.allSettled(
      selectedEditors.map((accountEmail) => deleteUser.mutateAsync({ email: accountEmail })),
    );
    const deletedEmails = selectedEditors.filter(
      (_, index) => results[index]?.status === "fulfilled",
    );
    setSelected((current) => current.filter((value) => !deletedEmails.includes(value)));
    if (deletedEmails.length > 0) await refreshUsers();

    const failedCount = results.length - deletedEmails.length;
    setMessage(
      failedCount === 0
        ? text(
            lang,
            `${deletedEmails.length}টি Editor অ্যাকাউন্ট মুছে ফেলা হয়েছে।`,
            `Deleted ${deletedEmails.length} Editor account(s).`,
          )
        : text(
            lang,
            `${deletedEmails.length}টি মুছে গেছে, ${failedCount}টি মুছে ফেলা যায়নি।`,
            `Deleted ${deletedEmails.length}; ${failedCount} account(s) could not be deleted.`,
          ),
    );
  };

  if (usersQuery.isLoading) {
    return (
      <div className="animate-pulse space-y-4" aria-label="Loading admin accounts">
        <div className="h-10 w-64 rounded-xl bg-rose-100" />
        <div className="h-48 rounded-2xl bg-rose-100" />
        <div className="h-72 rounded-2xl bg-rose-100" />
      </div>
    );
  }

  if (usersQuery.isError) {
    return (
      <section className="rounded-2xl border border-rose-100 bg-white p-7" role="alert">
        <h1 className="text-xl font-extrabold text-[#8F0A1F]">
          {text(lang, "অ্যাকাউন্ট লোড করা যায়নি", "Could not load admin accounts")}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {text(
            lang,
            "শুধু Super Admin এই তালিকা দেখতে পারেন। সেশন যাচাই করে আবার চেষ্টা করুন।",
            "Only Super Admins can view this list. Check your session and try again.",
          )}
        </p>
        <button
          type="button"
          onClick={() => usersQuery.refetch()}
          className="mt-5 rounded-full bg-[#C8102E] px-4 py-2.5 text-sm font-bold text-white"
          data-testid="button-retry-admin-users"
        >
          {text(lang, "আবার চেষ্টা করুন", "Try again")}
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">{text(lang, "অ্যাকাউন্ট নিয়ন্ত্রণ", "ACCESS CONTROL")}</div>
          <h1 className="display mt-2 text-3xl font-extrabold">
            {text(lang, "অ্যাডমিন অ্যাকাউন্ট", "Admin accounts")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {text(
              lang,
              "এখানে শুধু সাইট পরিচালনার অ্যাকাউন্ট দেখা যাবে—আবেদনকারী বা সাধারণ ভিজিটর নয়।",
              "Only site staff accounts appear here—not applicants or public visitors.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm">
          <Users size={17} className="text-[#C8102E]" />
          <span className="font-bold">{accounts.length}</span>
          <span className="text-stone-500">{text(lang, "টি অ্যাকাউন্ট", "accounts")}</span>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-rose-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 p-4 sm:p-5">
          <div>
            <h2 className="font-extrabold">{text(lang, "স্টাফ অ্যাকাউন্ট", "Staff accounts")}</h2>
            <p className="mt-1 text-xs text-stone-500">
              {text(lang, "Editor অ্যাকাউন্ট বেছে মুছে ফেলুন।", "Select Editor accounts to delete.")}
            </p>
          </div>
          <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-3 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={text(lang, "ইমেইল খুঁজুন", "Search email")}
              className="w-full rounded-xl border border-rose-100 py-2.5 pl-9 pr-3 text-sm"
              data-testid="input-admin-user-search"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fffafa] px-4 py-3 sm:px-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
            <input
              type="checkbox"
              checked={allVisibleEditorsSelected}
              onChange={toggleVisibleEditors}
              disabled={visibleEditors.length === 0}
              className="h-4 w-4 accent-[#C8102E]"
              data-testid="checkbox-select-visible-editors"
            />
            {text(lang, "দেখানো Editor নির্বাচন করুন", "Select visible Editors")}
          </label>
          <button
            type="button"
            onClick={deleteSelectedEditors}
            disabled={selectedEditors.length === 0 || deleteUser.isPending}
            className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-40"
            data-testid="button-delete-selected-editors"
          >
            <Trash2 size={14} />
            {text(lang, "নির্বাচিত Editor মুছুন", "Delete selected Editors")}
            {selectedEditors.length > 0 && ` (${selectedEditors.length})`}
          </button>
        </div>

        {message && (
          <p
            className="border-b border-rose-100 bg-rose-50/60 px-5 py-3 text-sm text-[#8F0A1F]"
            role="status"
            data-testid="admin-users-message"
          >
            {message}
          </p>
        )}

        {visibleAccounts.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-500">
            {text(lang, "কোনো অ্যাডমিন অ্যাকাউন্ট মেলেনি।", "No admin accounts found.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-rose-50 text-xs text-stone-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <span className="sr-only">{text(lang, "নির্বাচন", "Select")}</span>
                  </th>
                  <th className="px-4 py-3 font-semibold">{text(lang, "ইমেইল", "Email")}</th>
                  <th className="px-4 py-3 font-semibold">{text(lang, "ভূমিকা", "Role")}</th>
                  <th className="px-4 py-3 font-semibold">{text(lang, "যোগ দিয়েছেন", "Added")}</th>
                  <th className="px-4 py-3 font-semibold">{text(lang, "অ্যাক্সেস", "Access")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {visibleAccounts.map((account) => {
                  const isEditor = account.role === "editor";
                  const isCurrentUser = account.email === currentEmail;
                  return (
                    <tr key={account.email} data-testid={`admin-user-row-${account.email}`}>
                      <td className="px-4 py-4">
                        {isEditor ? (
                          <input
                            type="checkbox"
                            checked={selected.includes(account.email)}
                            onChange={() => toggleEditor(account.email)}
                            disabled={isCurrentUser}
                            aria-label={`${text(lang, "Editor নির্বাচন করুন", "Select Editor")} ${account.email}`}
                            className="h-4 w-4 accent-[#C8102E]"
                            data-testid={`checkbox-admin-user-${account.email}`}
                          />
                        ) : (
                          <ShieldCheck size={17} className="text-[#C8102E]" aria-label="Super Admin" />
                        )}
                      </td>
                      <td className="px-4 py-4 font-semibold">{account.email}</td>
                      <td className="px-4 py-4">
                        {isEditor ? (
                          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700">
                            Editor
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-[#8F0A1F]">
                            Super Admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-stone-500">
                        {new Date(account.createdAt).toLocaleDateString(
                          lang === "bn" ? "bn-BD" : "en-BD",
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-stone-500">
                        {isCurrentUser
                          ? text(lang, "আপনি", "You")
                          : isEditor
                            ? text(lang, "কনটেন্ট ও আবেদন", "Content & applications")
                            : text(lang, "পূর্ণ নিয়ন্ত্রণ", "Full control")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}