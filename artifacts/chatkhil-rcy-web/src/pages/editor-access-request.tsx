import { useState } from "react";
import { useSubmitEditorAccessRequest } from "@workspace/api-client-react";
import { Eye, EyeOff } from "lucide-react";

type Lang = "bn" | "en";
const text = (lang: Lang, bn: string, en: string) => (lang === "bn" ? bn : en);

export default function EditorAccessRequestForm({ lang }: { lang: Lang }) {
  const submitRequest = useSubmitEditorAccessRequest();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(false);
    submitRequest.mutate(
      { data: { email: email.trim().toLowerCase(), password } },
      {
        onSuccess: () => {
          setPassword("");
          setSubmitted(true);
        },
        onError: () => setError(true),
      },
    );
  };

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="editor-access-request-form"
        className="w-full rounded-full border border-rose-200 px-5 py-3 text-sm font-bold text-[#8F0A1F] transition hover:bg-rose-50"
        data-testid="button-toggle-editor-request"
      >
        {text(lang, open ? "আবেদন বন্ধ করুন" : "Editor অ্যাক্সেসের আবেদন করুন", open ? "Close request form" : "Request editor access")}
      </button>
      {open && (
        <section id="editor-access-request-form" className="mt-4 rounded-2xl border border-rose-100 bg-white p-5 sm:p-6">
          <h3 className="text-lg font-extrabold text-[#30131a]">{text(lang, "Editor অ্যাক্সেসের আবেদন", "Request editor access")}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">{text(lang, "ইমেইল ও পাসওয়ার্ড দিন। Super Admin আবেদন পর্যালোচনা করবেন; অনুমোদন হলে এই তথ্য দিয়ে সাইন ইন করতে পারবেন।", "Enter your email and password. A Super Admin will review the request; if approved, these details will let you sign in.")}</p>
          {submitted ? (
            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status" data-testid="editor-request-submitted">{text(lang, "আবেদন গৃহীত হয়েছে। অনুমোদনের পর এই ইমেইল ও পাসওয়ার্ড দিয়ে সাইন ইন করুন।", "Request received. If approved, sign in with this email and password.")}</p>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-stone-700">{text(lang, "ইমেইল", "Email")}
                <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-rose-200 px-3 py-3" data-testid="input-editor-request-email" />
              </label>
              <label className="block text-sm font-semibold text-stone-700">{text(lang, "পাসওয়ার্ড (কমপক্ষে ১২ অক্ষর)", "Password (at least 12 characters)")}
                <span className="relative mt-2 block">
                  <input type={showPassword ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-rose-200 px-3 py-3 pr-12" data-testid="input-editor-request-password" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={text(lang, showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান", showPassword ? "Hide password" : "Show password")} aria-pressed={showPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-[#8F0A1F]" data-testid="button-toggle-editor-request-password">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{text(lang, "আবেদন জমা হয়নি। আবার চেষ্টা করুন।", "Could not submit the request. Please try again.")}</p>}
              <button type="submit" disabled={submitRequest.isPending} className="w-full rounded-full bg-[#C8102E] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" data-testid="button-submit-editor-request">{submitRequest.isPending ? text(lang, "জমা হচ্ছে…", "Submitting…") : text(lang, "আবেদন জমা দিন", "Submit request")}</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
