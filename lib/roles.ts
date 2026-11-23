export type AppRole = "admin" | "manager" | "member" | "guest" | "friend";

export const APP_ROLES: AppRole[] = ["admin", "manager", "member", "guest", "friend"];

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "RL",
  member: "Raider",
  guest: "Invitado",
  friend: "Compañeros",
};

export const ROLE_BG: Record<string, string> = {
  admin: "color-mix(in srgb, var(--color-epic) 20%, transparent)",
  manager: "color-mix(in srgb, var(--color-danger) 18%, transparent)",
  member: "color-mix(in srgb, var(--color-warning) 18%, transparent)",
  guest: "color-mix(in srgb, var(--color-secondary) 18%, transparent)",
  friend: "var(--color-blood)",
};

export const ROLE_TEXT: Record<string, string> = {
  admin: "var(--color-epic)",
  manager: "var(--color-danger)",
  member: "var(--color-warning)",
  guest: "var(--color-secondary)",
  friend: "#ffe8e8",
};

export const ROLE_BG_IMAGE: Record<string, string | undefined> = {
  friend:
    "linear-gradient(135deg, var(--color-blood-deep) 0%, var(--color-blood) 55%, var(--color-danger) 100%)",
};
