import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle } from "lucide-react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { trackContactSubmit } from "../lib/analytics";

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const inputClass =
  "w-full bg-transparent border border-white/40 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white/80 transition-colors";

function validate(data: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim()) errors.name = "Il nome è obbligatorio";
  if (!data.email.trim()) errors.email = "L'email è obbligatoria";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    errors.email = "Inserisci un'email valida";
  if (!data.subject.trim()) errors.subject = "L'oggetto è obbligatorio";
  if (!data.message.trim()) errors.message = "Il messaggio è obbligatorio";
  return errors;
}

export default function Contact() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setServerError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, captchaToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore durante l'invio");
      trackContactSubmit(true);
      setSuccess(true);
    } catch (err) {
      trackContactSubmit(false);
      setServerError(
        err instanceof Error ? err.message : "Errore durante l'invio"
      );
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: "rgba(30, 20, 64, 0.6)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--border-hairline)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-white hover:bg-white/20 border border-white/30"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Contatti</h1>
                <p className="text-xs text-gray-300">Scrivici un messaggio</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {success ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <CheckCircle className="w-16 h-16 text-green-400" />
            <h2 className="text-2xl font-bold text-white">Messaggio inviato!</h2>
            <p className="text-gray-300">
              Grazie per averci contattato. Ti risponderemo il prima possibile.
            </p>
            <Button
              variant="ghost"
              className="mt-4 text-white border border-white/30 hover:bg-white/20"
              onClick={() => navigate("/")}
            >
              Torna alla home
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              Hai bisogno di aiuto?
            </h2>
            <p className="text-gray-300 mb-8">
              Compila il form e ti risponderemo al più presto.
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Il tuo nome"
                  className={inputClass}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-400">{errors.name}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="la.tua@email.com"
                  className={inputClass}
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-400">{errors.email}</p>
                )}
              </div>

              {/* Oggetto */}
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Oggetto
                </label>
                <input
                  type="text"
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  placeholder="Di cosa si tratta?"
                  className={inputClass}
                />
                {errors.subject && (
                  <p className="mt-1 text-sm text-red-400">{errors.subject}</p>
                )}
              </div>

              {/* Messaggio */}
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Messaggio
                </label>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Scrivi qui il tuo messaggio..."
                  rows={6}
                  className={inputClass + " resize-none"}
                />
                {errors.message && (
                  <p className="mt-1 text-sm text-red-400">{errors.message}</p>
                )}
              </div>

              {serverError && (
                <p className="text-sm text-red-400">{serverError}</p>
              )}

              <HCaptcha
                ref={captchaRef}
                sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY || "0e58d15a-5430-43b0-9e82-61d411021070"}
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
                theme="dark"
              />

              <Button
                type="submit"
                disabled={loading || !captchaToken}
                className="w-full bg-white text-purple-900 hover:bg-gray-100 font-semibold py-2 disabled:opacity-50"
              >
                {loading ? "Invio in corso…" : "Invia messaggio"}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
