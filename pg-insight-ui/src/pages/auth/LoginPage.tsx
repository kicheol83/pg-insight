import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Lock, Mail } from "lucide-react";
import { Card, Input, Button, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { authApi } from "@/api/auth-endpoints";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export default function LoginPage() {
  const { login, registerFirst, signup } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();

  const [mode, setMode] = useState<"login" | "setup" | "signup">("login");
  const [signupEnabled, setSignupEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authApi
      .config()
      .then((c) => setSignupEnabled(c.signupEnabled))
      .catch(() => setSignupEnabled(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "signup") {
        await signup(email, password);
      } else {
        await registerFirst(email, password);
      }
      navigate("/");
    } catch (err) {
      const message = (err as Error).message;

      if (mode === "login" && !signupEnabled) {
        toast({
          type: "info",
          title: t("auth.cannotLogin"),
          message: t("auth.firstRunHint"),
        });
      }
      toast({
        type: "error",
        title:
          mode === "login" ? t("auth.loginFailed") : t("auth.signupFailed"),
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center mb-3">
            <Database size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-primary">PG Insight</h1>
          <p className="text-xs text-muted mt-1">{t("auth.tagline")}</p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-sm font-semibold text-primary">
              {mode === "login"
                ? t("auth.login")
                : mode === "signup"
                  ? t("auth.signup")
                  : t("auth.setup")}
            </h2>

            <Input
              label={t("auth.email")}
              type="email"
              icon={<Mail size={14} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
            <Input
              label={t("auth.password")}
              type="password"
              icon={<Lock size={14} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === "login" ? "••••••••" : t("auth.passwordHint")
              }
              minLength={mode === "login" ? undefined : 8}
              maxLength={mode === "login" ? undefined : 72}
              required
            />

            <Button type="submit" variant="primary" fullWidth loading={loading}>
              {mode === "login"
                ? t("auth.login")
                : mode === "signup"
                  ? t("auth.signup")
                  : t("auth.setupSubmit")}
            </Button>

            {signupEnabled && mode === "login" && (
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="w-full text-xs text-muted hover:text-brand-500 transition-colors text-center"
              >
                {t("auth.toSignup")}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setMode((m) => (m === "login" ? "setup" : "login"))
              }
              hidden={signupEnabled && mode === "login"}
              className="w-full text-xs text-muted hover:text-brand-500 transition-colors text-center"
            >
              {mode === "login" ? t("auth.toSetup") : t("auth.toLogin")}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
