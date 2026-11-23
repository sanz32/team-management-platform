"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Trash2, RotateCcw, UsersRound } from "lucide-react";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { cascadeStyle } from "@/lib/cascade";
import { ROLE_LABEL, ROLE_BG, ROLE_TEXT, ROLE_BG_IMAGE, APP_ROLES } from "@/lib/roles";
import IconAction from "../../components/IconAction";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";
import LoadingState from "@/app/components/LoadingState";

interface Member {
  id: string;
  discord_username: string | null;
  nickname: string | null;
  avatar_url: string | null;
  app_role: string;
  binance_id?: string | null;
  removed_at?: string | null;
}

function sortByName(list: Member[]): Member[] {
  return [...list].sort((a, b) =>
    (a.discord_username ?? "").localeCompare(b.discord_username ?? "")
  );
}

function isAdminOnlyRole(role: string): boolean {
  return role === "admin" || role === "friend";
}

const LOCKED_FOR_MANAGER_HINT = "Solo un admin puede gestionar a este miembro";

export default function MiembrosClient({
  canManage,
  isAdmin,
  ownUserId,
}: {
  canManage: boolean;
  isAdmin: boolean;
  ownUserId: string | null;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [removedMembers, setRemovedMembers] = useState<Member[]>([]);
  const [showRemoved, setShowRemoved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [binanceDrafts, setBinanceDrafts] = useState<Record<string, string>>({});

  async function load() {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/members");
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo cargar la lista de miembros.");
        return;
      }
      setMembers(data.members ?? []);
      setRemovedMembers(data.removedMembers ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  useRefetchOnReturn(load);

  if (!canManage) {
    return <p className="text-ink-faint text-sm text-center py-16">No tienes acceso a esta pantalla.</p>;
  }

  const filtered = members.filter((m) => {
    const name = (m.nickname ?? m.discord_username ?? "").toLowerCase();
    return name.includes(search.trim().toLowerCase());
  });

  async function changeRole(member: Member, newRole: string) {
    if (newRole === member.app_role) return;

    const isSelf = member.id === ownUserId;
    const name = member.nickname ?? member.discord_username ?? "este miembro";
    const fromLabel = ROLE_LABEL[member.app_role] ?? member.app_role;
    const toLabel = ROLE_LABEL[newRole] ?? newRole;

    let message = `¿Cambiar el rol de ${name} de "${fromLabel}" a "${toLabel}"?`;
    if (newRole === "admin") {
      message +=
        " Le vas a dar acceso TOTAL de administrador, incluyendo esta misma pantalla de gestión de roles.";
    } else if (member.app_role === "admin") {
      message += " Le vas a QUITAR el acceso de administrador.";
    }
    if (isSelf) {
      message += " Ojo: te estás cambiando el rol A TI MISMO.";
    }

    const risky = newRole === "admin" || member.app_role === "admin" || isSelf;
    const confirmed = await confirm(message, {
      title: "Cambiar rol",
      confirmLabel: "Cambiar rol",
      danger: risky,
    });
    if (!confirmed) return;

    setSavingId(member.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_role: newRole }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo cambiar el rol.");
        toast.error("No se pudo cambiar el rol", data.error || undefined);
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === member.id ? data.member : m)));
      toast.success(`${name} ahora es ${toLabel}`);
    } finally {
      setSavingId(null);
    }
  }

  async function saveBinanceId(member: Member, value: string) {
    const trimmed = value.trim();
    if (trimmed === (member.binance_id ?? "")) {
      setBinanceDrafts((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
      return;
    }

    setSavingId(member.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ binance_id: trimmed || null }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el Binance ID.");
        toast.error("No se pudo guardar el Binance ID", data.error || undefined);
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === member.id ? data.member : m)));
      toast.success("Binance ID guardado");
    } finally {
      setSavingId(null);
      setBinanceDrafts((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    }
  }

  async function removeMember(member: Member) {
    const name = member.nickname ?? member.discord_username ?? "este miembro";
    const confirmed = await confirm(
      `¿Eliminar a ${name}? Pierde el acceso al portal de inmediato -- si tiene una sesión abierta, se le cierra sola en su próxima acción, sin esperar a que él mismo cierre sesión. Sus personajes, balance y el resto de su historial se conservan intactos: puedes restaurarlo cuando quieras desde "Miembros eliminados".`,
      { title: "Eliminar miembro", confirmLabel: "Eliminar", danger: true }
    );
    if (!confirmed) return;

    setSavingId(member.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/members/${member.id}`, { method: "DELETE" });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar al miembro.");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      setRemovedMembers((prev) => sortByName([...prev, data.member]));
    } finally {
      setSavingId(null);
    }
  }

  async function restoreMember(member: Member) {
    setSavingId(member.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/members/${member.id}/restore`, { method: "POST" });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo restaurar al miembro.");
        return;
      }
      setRemovedMembers((prev) => prev.filter((m) => m.id !== member.id));
      setMembers((prev) => sortByName([...prev, data.member]));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Gestión"
        icon={UsersRound}
        title="Miembros"
        description="Cambia el rol de cada integrante del guild -- Admin, RL o Raider -- y su Binance ID para Pagos."
      />

      {error && (
        <div
          className="text-sm rounded-xl p-4 mb-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar miembro..."
        className="input w-full max-w-sm px-3 py-2 text-sm mb-5"
      />

      {loading ? (
        <LoadingState
          variant="cards"
          count={9}
          gridClassName="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {filtered.map((m, index) => {
            const name = m.nickname ?? m.discord_username ?? "—";
            const lockedForManager = !isAdmin && isAdminOnlyRole(m.app_role);
            const assignableRoles =
              isAdmin || lockedForManager ? APP_ROLES : APP_ROLES.filter((r) => !isAdminOnlyRole(r));
            return (
              <div key={m.id} className="card px-4 py-3 cascade-item" style={cascadeStyle(index)}>
                <div className="flex items-center justify-between gap-4 mb-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {name}
                      {m.id === ownUserId && <span className="text-ink-faint font-normal"> (tú)</span>}
                    </p>
                    {m.nickname && m.discord_username && m.nickname !== m.discord_username && (
                      <p className="text-ink-faint text-xs truncate">{m.discord_username}</p>
                    )}
                  </div>
                  {m.id !== ownUserId && (
                    <IconAction
                      icon={Trash2}
                      label={lockedForManager ? LOCKED_FOR_MANAGER_HINT : "Eliminar miembro"}
                      onClick={() => removeMember(m)}
                      disabled={savingId === m.id || lockedForManager}
                      className="hover:text-[color:var(--color-danger)] shrink-0"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={binanceDrafts[m.id] ?? m.binance_id ?? ""}
                    onChange={(e) => setBinanceDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    onBlur={(e) => saveBinanceId(m, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    disabled={savingId === m.id}
                    placeholder="ID de Binance"
                    title="Binance ID (para Pagos)"
                    className="input px-2.5 py-1.5 text-xs flex-1 min-w-[110px]"
                  />
                  <span
                    className="pill shrink-0"
                    style={{
                      backgroundColor: ROLE_BG[m.app_role],
                      backgroundImage: ROLE_BG_IMAGE[m.app_role],
                      color: ROLE_TEXT[m.app_role],
                    }}
                  >
                    {ROLE_LABEL[m.app_role] ?? m.app_role}
                  </span>
                  <select
                    value={m.app_role}
                    onChange={(e) => changeRole(m, e.target.value)}
                    disabled={savingId === m.id || lockedForManager}
                    title={lockedForManager ? LOCKED_FOR_MANAGER_HINT : undefined}
                    className="input px-2.5 py-1.5 text-xs w-28 shrink-0"
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full text-ink-faint text-xs text-center py-10">Sin resultados.</p>
          )}
        </div>
      )}

      {!loading && removedMembers.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowRemoved((v) => !v)}
            aria-expanded={showRemoved}
            className="flex items-center gap-2 text-sm text-ink-faint hover:text-ink transition-colors"
          >
            <ChevronDown
              className="w-4 h-4 transition-transform duration-200"
              style={{ transform: showRemoved ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            Miembros eliminados ({removedMembers.length})
          </button>

          {showRemoved && (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 mt-4">
              {removedMembers.map((m, index) => {
                const name = m.nickname ?? m.discord_username ?? "—";
                const lockedForManager = !isAdmin && isAdminOnlyRole(m.app_role);
                return (
                  <div
                    key={m.id}
                    className="card flex items-center justify-between gap-4 px-4 py-3 cascade-item opacity-70"
                    style={cascadeStyle(index)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{name}</p>
                      {m.nickname && m.discord_username && m.nickname !== m.discord_username && (
                        <p className="text-ink-faint text-xs truncate">{m.discord_username}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className="pill"
                        style={{
                          backgroundColor: ROLE_BG[m.app_role],
                          backgroundImage: ROLE_BG_IMAGE[m.app_role],
                          color: ROLE_TEXT[m.app_role],
                        }}
                      >
                        {ROLE_LABEL[m.app_role] ?? m.app_role}
                      </span>
                      <IconAction
                        icon={RotateCcw}
                        label={lockedForManager ? LOCKED_FOR_MANAGER_HINT : "Restaurar miembro"}
                        onClick={() => restoreMember(m)}
                        disabled={savingId === m.id || lockedForManager}
                        className="hover:text-[color:var(--color-success)]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
