import type { Dictionary } from "../locales";

export const auth = {
  "auth.tagline": {
    ko: "PostgreSQL 모니터링 플랫폼",
    en: "PostgreSQL monitoring platform",
    uz: "PostgreSQL monitoring platformasi",
  },
  "auth.login": { ko: "로그인", en: "Log in", uz: "Kirish" },
  "auth.signup": {
    ko: "계정 만들기",
    en: "Create account",
    uz: "Hisob yaratish",
  },
  "auth.setup": {
    ko: "첫 관리자 계정 만들기",
    en: "Create the first admin",
    uz: "Birinchi admin yaratish",
  },
  "auth.setupSubmit": {
    ko: "관리자 만들기",
    en: "Create admin",
    uz: "Admin yaratish",
  },
  "auth.email": { ko: "이메일", en: "Email", uz: "Email" },
  "auth.password": { ko: "비밀번호", en: "Password", uz: "Parol" },
  "auth.passwordHint": {
    ko: "8자 이상",
    en: "At least 8 characters",
    uz: "Kamida 8 belgi",
  },
  "auth.toSignup": {
    ko: "계정이 없으신가요? 가입하기",
    en: "No account yet? Sign up",
    uz: "Hisobingiz yo'qmi? Ro'yxatdan o'ting",
  },
  "auth.toSetup": {
    ko: "처음 설치하셨나요? 첫 관리자 계정 만들기",
    en: "First run? Create the first admin",
    uz: "Birinchi marta ishga tushiryapsizmi? Birinchi admin yaratish",
  },
  "auth.toLogin": {
    ko: "이미 계정이 있으신가요? 로그인",
    en: "Already have an account? Log in",
    uz: "Allaqachon hisobingiz bormi? Kirish",
  },
  "auth.loginFailed": {
    ko: "로그인 실패",
    en: "Login failed",
    uz: "Kirish muvaffaqiyatsiz",
  },
  "auth.signupFailed": {
    ko: "가입 실패",
    en: "Sign-up failed",
    uz: "Ro'yxatdan o'tish muvaffaqiyatsiz",
  },
  "auth.cannotLogin": {
    ko: "로그인할 수 없나요?",
    en: "Can't log in?",
    uz: "Kira olmadingizmi?",
  },
  "auth.firstRunHint": {
    ko: '처음 실행하는 경우 아래의 "첫 관리자 계정 만들기"를 누르세요',
    en: 'If this is the first run, press "Create the first admin" below',
    uz: 'Agar bu birinchi marta ishga tushirilayotgan bo\'lsa, pastdagi "Birinchi admin yaratish" tugmasini bosing',
  },
} satisfies Dictionary;
