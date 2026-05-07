function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development") as
    | "development"
    | "production"
    | "test",
  PORT: Number(optional("PORT", "3000")),
  DATABASE_URL: required("DATABASE_URL"),

  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: required("BETTER_AUTH_URL"),

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",

  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  RESEND_FROM: optional("RESEND_FROM", "onboarding@resend.dev"),

  FRONTEND_ORIGINS: (
    process.env.FRONTEND_ORIGINS ??
    process.env.FRONTEND_ORIGIN ??
    "http://localhost:5173"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Comma-separated CIDRs that bypass DB ip_allowlist (use for bootstrap only)
  ADMIN_IP_BOOTSTRAP: process.env.ADMIN_IP_BOOTSTRAP ?? "",

  // Comma-separated CIDRs of trusted reverse proxies. Forwarded IP headers
  // (cf-connecting-ip, x-real-ip, x-forwarded-for) are honored only when the
  // direct peer IP is in this list. Empty (default) means never trust them.
  TRUSTED_PROXY_CIDRS: (process.env.TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Initial admin email — first user to register/login with this email is auto-promoted
  INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL ?? "",
};

export const isProd = env.NODE_ENV === "production";
