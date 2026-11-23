"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { classColor } from "@/lib/wow-classes";
import { cascadeStyle } from "@/lib/cascade";
import { readJsonBody } from "@/lib/read-json";

interface SimRow {
  id: string;
  provider: "raidbots" | "qelive";
  metricType: "dps" | "hps";
  importedAt: string;
  characterId: string;
  characterName: string;
  characterClass: string | null;
  characterRealmName: string | null;
  characterRealmSlug: string;
  specName: string | null;
  specIconUrl: string | null;
  userId: string;
  userName: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  raidbots: "Raidbots Droptimizer",
  qelive: "QE Live",
};

function characterRealm(realmName: string | null, realmSlug: string): string {
  return realmName ? realmName.replace(/\s+/g, "") : realmSlug;
}

function SpecEntry({ sim, onDelete, deleting }: { sim: SimRow; onDelete: () => void; deleting: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-flex items-center gap-1.5"
        title={`${PROVIDER_LABEL[sim.provider]} · importado ${new Date(sim.importedAt).toLocaleDateString("es-CL")}`}
      >
        {sim.specIconUrl && <img src={sim.specIconUrl} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0" />}
        <span className="text-xs text-ink-muted whitespace-nowrap">{sim.specName ?? PROVIDER_LABEL[sim.provider]}</span>
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        title="Borrar esta simulación"
        aria-label="Borrar esta simulación"
        className="p-0.5 rounded text-ink-faint hover:text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface)] transition-colors disabled:opacity-50"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </span>
  );
}

interface CharacterGroup {
  characterId: string;
  characterName: string;
  characterClass: string | null;
  characterRealmName: string | null;
  characterRealmSlug: string;
  sims: SimRow[];
}

interface UserGroup {
  userId: string;
  userName: string;
  characters: CharacterGroup[];
  simCount: number;
}

function groupByUser(sims: SimRow[]): UserGroup[] {
  const users = new Map<string, UserGroup>();
  for (const sim of sims) {
    if (!users.has(sim.userId)) {
      users.set(sim.userId, { userId: sim.userId, userName: sim.userName, characters: [], simCount: 0 });
    }
    const user = users.get(sim.userId)!;
    user.simCount += 1;
    let character = user.characters.find((c) => c.characterId === sim.characterId);
    if (!character) {
      character = {
        characterId: sim.characterId,
        characterName: sim.characterName,
        characterClass: sim.characterClass,
        characterRealmName: sim.characterRealmName,
        characterRealmSlug: sim.characterRealmSlug,
        sims: [],
      };
      user.characters.push(character);
    }
    character.sims.push(sim);
  }
  const groups = Array.from(users.values());
  groups.forEach((u) => u.characters.sort((a, b) => a.characterName.localeCompare(b.characterName)));
  return groups.sort((a, b) => a.userName.localeCompare(b.userName));
}

function CharacterRow({
  character,
  onDeleteSim,
  deletingId,
}: {
  character: CharacterGroup;
  onDeleteSim: (sim: SimRow) => void;
  deletingId: string | null;
}) {
  const lastImportedAt = character.sims.reduce(
    (latest, s) => (s.importedAt > latest ? s.importedAt : latest),
    character.sims[0].importedAt
  );
  const color = classColor(character.characterClass);
  return (
    <div
      className="balance-row grid items-center gap-4 rounded-lg px-3.5 py-2.5"
      style={{ gridTemplateColumns: "minmax(180px, 300px) 1fr auto", borderLeft: `3px solid ${color}` }}
    >
      <span className="text-sm font-medium truncate" style={{ color }}>
        {character.characterName}
        <span className="text-ink-faint font-normal">-{characterRealm(character.characterRealmName, character.characterRealmSlug)}</span>
      </span>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {character.sims.map((sim, idx) => (
          <span key={sim.id} className="inline-flex items-center gap-2.5">
            {idx > 0 && <span className="text-ink-faint text-micro">·</span>}
            <SpecEntry sim={sim} onDelete={() => onDeleteSim(sim)} deleting={deletingId === sim.id} />
          </span>
        ))}
      </div>
      <span className="text-xs text-ink-faint justify-self-end whitespace-nowrap">
        {new Date(lastImportedAt).toLocaleDateString("es-CL")}
      </span>
    </div>
  );
}

export default function SimsAdminPanel() {
  const confirm = useConfirm();
  const [sims, setSims] = useState<SimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    fetch("/api/admin/wishlist/sims")
      .then((r) => r.json())
      .then((data) => setSims(data.sims ?? []))
      .catch(() => setError("No se pudieron cargar las simulaciones."))
      .finally(() => setLoading(false));
  }, []);

  async function deleteSim(sim: SimRow) {
    const label = `${sim.characterName}-${characterRealm(sim.characterRealmName, sim.characterRealmSlug)}${sim.specName ? ` (${sim.specName})` : ""}`;
    const confirmed = await confirm(`¿Borrar el droptimizer de ${label}? Esta acción no se puede deshacer.`, {
      title: "Borrar simulación",
      confirmLabel: "Borrar",
      danger: true,
    });
    if (!confirmed) return;
    setDeletingId(sim.id);
    setError("");
    const res = await fetch(`/api/admin/wishlist/sims/${sim.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const data = await readJsonBody(res).catch(() => ({}));
      setError(data.error || "No se pudo borrar la simulación.");
      return;
    }
    setSims((prev) => prev.filter((s) => s.id !== sim.id));
  }

  async function deleteAll() {
    if (sims.length === 0) return;
    const confirmed = await confirm(
      `¿Borrar las ${sims.length} simulaciones subidas por todo el guild? Esta acción no se puede deshacer.`,
      { title: "Borrar todas las simulaciones", confirmLabel: "Borrar todo", danger: true }
    );
    if (!confirmed) return;
    setDeletingAll(true);
    setError("");
    const res = await fetch("/api/admin/wishlist/sims", { method: "DELETE" });
    setDeletingAll(false);
    if (!res.ok) {
      const data = await readJsonBody(res).catch(() => ({}));
      setError(data.error || "No se pudieron borrar las simulaciones.");
      return;
    }
    setSims([]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-ink-muted text-sm">
          {loading
            ? "Cargando..."
            : `${sims.length} simulaci${sims.length === 1 ? "ón" : "ones"} subida${sims.length === 1 ? "" : "s"}`}
        </p>
        <button onClick={deleteAll} disabled={loading || sims.length === 0 || deletingAll} className="btn btn-danger">
          <Trash2 className="w-3.5 h-3.5" />
          {deletingAll ? "Borrando..." : "Borrar todas"}
        </button>
      </div>

      {error && (
        <p className="text-sm mb-3" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {loading ? null : sims.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-ink-muted text-sm">No hay ninguna simulación subida todavía.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupByUser(sims).map((user, userIdx) => (
            <div key={user.userId} className="card p-4 cascade-item" style={cascadeStyle(userIdx)}>
              <div
                className="flex items-baseline justify-between gap-3 pb-2.5 mb-2.5 border-b"
                style={{ borderColor: "var(--color-surface-2)" }}
              >
                <span className="font-heading font-semibold text-ink">{user.userName}</span>
                <span className="text-xs text-ink-faint shrink-0">
                  {user.simCount} simulaci{user.simCount === 1 ? "ón" : "ones"}
                </span>
              </div>
              <div className="space-y-1.5">
                {user.characters.map((character) => (
                  <CharacterRow key={character.characterId} character={character} onDeleteSim={deleteSim} deletingId={deletingId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
