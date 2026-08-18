import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Lock, Mail } from "lucide-react";
import { Card, Input, Button, useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";

export default function LoginPage() {
  const { login, registerFirst } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [mode, setMode] = useState<"login" | "setup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await registerFirst(email, password);
      }
      navigate("/");
    } catch (err) {
      const message = (err as Error).message;

      if (mode === "login") {
        toast({
          type: "info",
          title: "Kira olmadingizmi?",
          message:
            'Agar bu birinchi marta ishga tushirilayotgan bo\'lsa, pastdagi "Birinchi admin yaratish" tugmasini bosing',
        });
      }
      toast({
        type: "error",
        title:
          mode === "login"
            ? "Kirish muvaffaqiyatsiz"
            : "Ro'yxatdan o'tish muvaffaqiyatsiz",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center mb-3">
            <Database size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-primary">PG Insight</h1>
          <p className="text-xs text-muted mt-1">
            PostgreSQL monitoring platformasi
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-sm font-semibold text-primary">
              {mode === "login" ? "Kirish" : "Birinchi admin yaratish"}
            </h2>

            <Input
              label="Email"
              type="email"
              icon={<Mail size={14} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
            <Input
              label="Parol"
              type="password"
              icon={<Lock size={14} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "setup" ? "Kamida 8 belgi" : "••••••••"}
              minLength={mode === "setup" ? 8 : undefined}
              required
            />

            <Button type="submit" variant="primary" fullWidth loading={loading}>
              {mode === "login" ? "Kirish" : "Admin yaratish"}
            </Button>

            <button
              type="button"
              onClick={() =>
                setMode((m) => (m === "login" ? "setup" : "login"))
              }
              className="w-full text-xs text-muted hover:text-brand-500 transition-colors text-center"
            >
              {mode === "login"
                ? "Birinchi marta ishga tushiryapsizmi? Birinchi admin yaratish"
                : "Allaqachon hisobingiz bormi? Kirish"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
