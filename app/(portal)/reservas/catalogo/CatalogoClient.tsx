"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarPlus, Check, ClipboardPaste, CopyPlus, ListChecks, Plus, Store, Trash2, Pencil, X, Ticket } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";
import LoadingState from "@/app/components/LoadingState";
import SectionToggle from "@/app/components/SectionToggle";
import SegmentedToggle from "@/app/components/SegmentedToggle";
import IconAction from "@/app/components/IconAction";
import DateField from "@/app/components/DateField";
import { useToast } from "@/app/components/ToastProvider";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { readJsonBody } from "@/lib/read-json";
import { cascadeStyle } from "@/lib/cascade";
import { parseBoostCatalog, parseBoostSchedule } from "@/lib/boost-import";
import { suggestTemplates, type TemplateSuggestion } from "@/lib/boost-slot-templates";
import { boostSyncHealth, formatSinceSync } from "@/lib/boost-sync-health";
import {
  boostSchedulingWindow,
  formatGold,
  isWithinSchedulingWindow,
  remainingCapacity,
  type BoostCategory,
} from "@/lib/boost";

interface Offer {
  id: string;
  category: BoostCategory;
  group_label: string;
  title_en: string;
  title_es: string;
  description_en: string | null;
  description_es: string | null;
  price_gold: number;
  badge: string | null;
  image_url: string | null;
  is_active: boolean;
}

interface Slot {
  id: string;
  scheduled_at: string;
  difficulty: BoostCategory;
  label: string | null;
  capacity: number;
  booked_count: number;
  local_hold_count: number;
  is_active: boolean;
  boost_slot_offers?: { offer_id: string }[];
}

const CATEGORY_LABEL: Record<BoostCategory, string> = {
  normal: "Normal",
  heroic: "Heroico",
  mythic: "Mítico",
};

const EMPTY_OFFER = {
  category: "heroic" as BoostCategory,
  group_label: "",
  title_en: "",
  title_es: "",
  description_en: "",
  description_es: "",
  price_gold: "",
  badge: "",
};

type OfferForm = typeof EMPTY_OFFER;

const EMPTY_SLOT = {
  scheduled_at: "",
  difficulty: "heroic" as BoostCategory,
  label: "",
  capacity: "5",
  booked_count: "0",
};

type SlotForm = typeof EMPTY_SLOT;

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-label text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-micro text-ink-faint">{hint}</span>}
    </label>
  );
}

function SlotFormFields({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  editing,
  minDate,
  maxDate,
  windowEndLabel,
}: {
  form: SlotForm;
  setForm: (form: SlotForm) => void;
  onSave: () => void;
  onCancel?: () => void;
  saving: boolean;
  editing: boolean;
  minDate: string;
  maxDate: string;
  windowEndLabel: string;
}) {
  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Field
          label="Fecha y hora"
          hint={`En tu hora local. Solo esta semana y la siguiente (hasta el ${windowEndLabel})`}
        >
          <DateField
            mode="datetime"
            value={form.scheduled_at}
            onChange={(v) => setForm({ ...form, scheduled_at: v })}
            placeholder="Elige día y hora"
            minDate={minDate}
            maxDate={maxDate}
          />
        </Field>
        <Field label="Dificultad">
          <select
            className="input px-3 py-2 text-sm"
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value as BoostCategory })}
          >
            {(Object.keys(CATEGORY_LABEL) as BoostCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cupo total">
          <input
            className="input px-3 py-2 text-sm font-data"
            inputMode="numeric"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
        </Field>
        <Field label="Cupos vendidos en la plataforma" hint="Solo los cerrados por fuera de la web. Las reservas de la tienda se cuentan solas.">
          <input
            className="input px-3 py-2 text-sm font-data"
            inputMode="numeric"
            value={form.booked_count}
            onChange={(e) => setForm({ ...form, booked_count: e.target.value })}
          />
        </Field>
        <Field label="Etiqueta" hint="Ej. SAVED 2x 6/8 + 6x 8/8 Heroic">
          <input
            className="input px-3 py-2 text-sm"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            <X className="w-3.5 h-3.5" />
            Cancelar
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear horario"}
        </button>
      </div>
    </>
  );
}

function ContenidosDelHorario({
  slot,
  offers,
  onGuardado,
}: {
  slot: Slot;
  offers: Offer[];
  onGuardado: () => void;
}) {
  const toast = useToast();
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set((slot.boost_slot_offers ?? []).map((c) => c.offer_id))
  );
  const [guardando, setGuardando] = useState(false);

  const candidatos = useMemo(
    () => offers.filter((o) => o.category === slot.difficulty && o.is_active),
    [offers, slot.difficulty]
  );

  function alternar(id: string) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  async function guardar() {
    setGuardando(true);
    const res = await fetch(`/api/admin/reservas/slots/${slot.id}/contents`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerIds: [...seleccion] }),
    });
    const data = await readJsonBody(res);
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo guardar", data.error || "Inténtalo de nuevo.");
      return;
    }
    toast.success(
      seleccion.size > 0 ? "Contenidos guardados" : "Run sin contenidos",
      seleccion.size > 0
        ? `${seleccion.size} paquete(s) a la venta en esta run.`
        : "Sin contenidos no se publica en la tienda."
    );
    onGuardado();
  }

  return (
    <div className="card p-4 mt-1.5" style={{ borderColor: "var(--color-secondary)" }}>
      <p className="text-label text-ink-muted">
        Qué se vende en esta run ({CATEGORY_LABEL[slot.difficulty]})
      </p>

      {candidatos.length === 0 ? (
        <p className="text-meta text-ink-muted mt-2">
          No hay paquetes activos de {CATEGORY_LABEL[slot.difficulty]} en el catálogo. Carga uno en la
          pestaña Paquetes y vuelve acá.
        </p>
      ) : (
        <div
          className="grid gap-1.5 mt-2.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}
        >
          {candidatos.map((offer) => {
            const marcado = seleccion.has(offer.id);
            return (
              <button
                key={offer.id}
                type="button"
                onClick={() => alternar(offer.id)}
                aria-pressed={marcado}
                className="balance-row flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left"
                style={marcado ? { borderColor: "var(--color-primary)" } : undefined}
              >
                <span
                  className="w-4 h-4 rounded shrink-0 flex items-center justify-center mt-0.5"
                  style={{
                    border: `1px solid ${marcado ? "var(--color-primary)" : "var(--color-line-strong)"}`,
                    backgroundColor: marcado ? "var(--color-primary)" : "transparent",
                  }}
                >
                  {marcado && <Check className="w-3 h-3" style={{ color: "#1a0d00" }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm text-ink block">{offer.title_en}</span>
                  {(offer.description_es || offer.description_en) && (
                    <span className="text-micro text-ink-faint block mt-0.5 line-clamp-2">
                      {offer.description_es || offer.description_en}
                    </span>
                  )}
                </span>
                <span
                  className="font-data text-sm whitespace-nowrap mt-0.5"
                  style={{ color: "var(--color-gold)" }}
                >
                  {formatGold(offer.price_gold, "es")}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-3.5">
        <p className="text-micro text-ink-faint">
          {seleccion.size === 0
            ? "Sin contenidos, esta run no se publica en la tienda."
            : `${seleccion.size} de ${candidatos.length} marcados.`}
        </p>
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar contenidos"}
        </button>
      </div>
    </div>
  );
}

interface ImportPreview {
  cantidad: number;
  chips: string[];
  warnings: string[];
}

function PanelImportar({
  endpoint,
  previa: hacerPrevia,
  ayuda,
  nota,
  unidad,
  onImportado,
}: {
  endpoint: string;
  previa: (texto: string) => ImportPreview;
  ayuda: string;
  nota: string;
  unidad: string;
  onImportado: () => void;
}) {
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const previa = useMemo(() => (texto.trim() ? hacerPrevia(texto) : null), [texto, hacerPrevia]);

  async function importar() {
    setGuardando(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto }),
    });
    const data = await readJsonBody(res);
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo importar", data.error || "Inténtalo de nuevo.");
      return;
    }
    toast.success(
      "Importado",
      `${data.creados} nuevos, ${data.actualizados} actualizados, ${data.sinCambios} sin cambios.`
    );
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      toast.info("Con avisos", data.warnings[0]);
    }
    setTexto("");
    onImportado();
  }

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-surface-2)" }}>
      <p className="text-meta text-ink-muted mb-3 max-w-[70ch]">{ayuda}</p>
      <textarea
        className="input px-3 py-2 text-sm font-data w-full"
        rows={8}
        value={texto}
        placeholder="Pega acá lo copiado…"
        onChange={(e) => setTexto(e.target.value)}
      />

      {previa && (
        <div className="mt-3">
          {previa.cantidad === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              No se reconoció nada en ese texto.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                <span className="font-data" style={{ color: "var(--color-success)" }}>
                  {previa.cantidad}
                </span>{" "}
                {unidad}:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {previa.chips.map((chip) => (
                  <span key={chip} className="pill pill-common">
                    {chip}
                  </span>
                ))}
              </div>
            </>
          )}

          {previa.warnings.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {previa.warnings.map((w) => (
                <li key={w} className="text-meta" style={{ color: "var(--color-warning)" }}>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-4">
        <p className="text-micro text-ink-faint max-w-[46ch]">{nota}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={importar}
          disabled={guardando || !previa || previa.cantidad === 0}
        >
          {guardando ? "Importando…" : "Importar"}
        </button>
      </div>
    </div>
  );
}

function contarPor<T>(items: T[], clave: (item: T) => string): string[] {
  const conteo: Record<string, number> = {};
  for (const item of items) {
    const k = clave(item);
    conteo[k] = (conteo[k] ?? 0) + 1;
  }
  return Object.entries(conteo).map(([k, n]) => `${k}: ${n}`);
}

function previaCatalogo(texto: string): ImportPreview {
  const { offers, warnings } = parseBoostCatalog(texto);
  return {
    cantidad: offers.length,
    chips: contarPor(offers, (o) => `${o.groupLabel} · ${CATEGORY_LABEL[o.category]}`),
    warnings,
  };
}

function previaAgenda(texto: string): ImportPreview {
  const { slots, warnings } = parseBoostSchedule(texto);
  return {
    cantidad: slots.length,
    chips: contarPor(slots, (s) =>
      new Date(s.scheduledAt).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })
    ),
    warnings,
  };
}

function OfferFormFields({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  editing,
}: {
  form: OfferForm;
  setForm: (form: OfferForm) => void;
  onSave: () => void;
  onCancel?: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Field label="Dificultad">
          <select
            className="input px-3 py-2 text-sm"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as BoostCategory })}
          >
            {(Object.keys(CATEGORY_LABEL) as BoostCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grupo" hint="Ej. VIP, ATP & FP">
          <input
            className="input px-3 py-2 text-sm"
            value={form.group_label}
            onChange={(e) => setForm({ ...form, group_label: e.target.value })}
          />
        </Field>
        <Field label="Precio en oro">
          <input
            className="input px-3 py-2 text-sm font-data"
            inputMode="numeric"
            value={form.price_gold}
            onChange={(e) => setForm({ ...form, price_gold: e.target.value })}
          />
        </Field>
        <Field label="Etiqueta" hint="Casi siempre vacía. HOT se ignora: lo pone sola la oferta del día">
          <input
            className="input px-3 py-2 text-sm"
            value={form.badge}
            onChange={(e) => setForm({ ...form, badge: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Field label="Título (inglés)" hint="Es el idioma por defecto de la tienda">
          <input
            className="input px-3 py-2 text-sm"
            value={form.title_en}
            onChange={(e) => setForm({ ...form, title_en: e.target.value })}
          />
        </Field>
        <Field label="Título (español)" hint="Si lo dejas vacío se usa el inglés">
          <input
            className="input px-3 py-2 text-sm"
            value={form.title_es}
            onChange={(e) => setForm({ ...form, title_es: e.target.value })}
          />
        </Field>
        <Field label="Descripción (inglés)">
          <textarea
            className="input px-3 py-2 text-sm"
            rows={2}
            value={form.description_en}
            onChange={(e) => setForm({ ...form, description_en: e.target.value })}
          />
        </Field>
        <Field label="Descripción (español)">
          <textarea
            className="input px-3 py-2 text-sm"
            rows={2}
            value={form.description_es}
            onChange={(e) => setForm({ ...form, description_es: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            <X className="w-3.5 h-3.5" />
            Cancelar
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear paquete"}
        </button>
      </div>
    </>
  );
}

export default function CatalogoClient({ canWipe }: { canWipe: boolean }) {
  const toast = useToast();

  const [schedulingWindow] = useState(() => boostSchedulingWindow());
  const windowEndLabel = schedulingWindow.end.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const windowMinDate = toLocalInput(schedulingWindow.start.toISOString()).slice(0, 10);
  const windowMaxDate = toLocalInput(schedulingWindow.end.toISOString()).slice(0, 10);
  const confirm = useConfirm();

  const [tab, setTab] = useState<"paquetes" | "horarios">("paquetes");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [offerForm, setOfferForm] = useState<OfferForm>(EMPTY_OFFER);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [editOfferForm, setEditOfferForm] = useState<OfferForm>(EMPTY_OFFER);
  const [savingOffer, setSavingOffer] = useState(false);

  const [slotFormOpen, setSlotFormOpen] = useState(false);
  const [slotForm, setSlotForm] = useState<SlotForm>(EMPTY_SLOT);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editSlotForm, setEditSlotForm] = useState<SlotForm>(EMPTY_SLOT);
  const [configurandoSlotId, setConfigurandoSlotId] = useState<string | null>(null);
  const [savingSlot, setSavingSlot] = useState(false);
  const [aplicandoPlantilla, setAplicandoPlantilla] = useState(false);
  const [vaciando, setVaciando] = useState<"paquetes" | "horarios" | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [guildHour, setGuildHour] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [offersRes, slotsRes] = await Promise.all([
      fetch("/api/admin/reservas/offers"),
      fetch("/api/admin/reservas/slots"),
    ]);
    const [offersData, slotsData] = await Promise.all([readJsonBody(offersRes), readJsonBody(slotsRes)]);
    setLoading(false);
    setLoadedAt(Date.now());
    if (!offersRes.ok || !slotsRes.ok) {
      setError(offersData.error || slotsData.error || "No se pudo cargar el catálogo.");
      return;
    }
    setError("");
    setOffers(offersData.offers ?? []);
    setSlots(slotsData.slots ?? []);
    setSyncedAt(typeof slotsData.syncedAt === "string" ? slotsData.syncedAt : null);
    setGuildHour(typeof slotsData.guildHour === "number" ? slotsData.guildHour : null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const recargar = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  const sync = useMemo(
    () =>
      loadedAt && guildHour != null
        ? boostSyncHealth({ syncedAt }, new Date(loadedAt), guildHour)
        : null,
    [syncedAt, guildHour, loadedAt]
  );

  async function vaciar(tipo: "paquetes" | "horarios") {
    const esPaquetes = tipo === "paquetes";
    const cuantos = esPaquetes ? offers.length : slots.length;
    if (cuantos === 0) {
      toast.info(esPaquetes ? "No hay paquetes" : "No hay horarios", "No queda nada que borrar.");
      return;
    }

    const conReservas = esPaquetes ? 0 : slots.filter((s) => s.local_hold_count > 0).length;
    const ok = await confirm(
      esPaquetes
        ? `Se borran los ${cuantos} paquetes y la tienda queda sin nada que vender hasta que vuelvas a importar el catálogo. Las reservas ya recibidas no se pierden: cada una guarda su propio título y precio.`
        : `Se borran las ${cuantos} runs agendadas${
            conReservas > 0
              ? `, incluidas ${conReservas} con cupos apartados por reservas de la tienda`
              : ""
          }. Las reservas ya recibidas no se pierden: cada una guarda su horario y su paquete. Si el script de sincronización está corriendo, volverá a traer la agenda de la plataforma.`,
      {
        title: esPaquetes ? "¿Vaciar el catálogo?" : "¿Vaciar la agenda?",
        confirmLabel: esPaquetes ? "Borrar los paquetes" : "Borrar los horarios",
        danger: true,
      }
    );
    if (!ok) return;

    setVaciando(tipo);
    try {
      const res = await fetch(esPaquetes ? "/api/admin/reservas/offers" : "/api/admin/reservas/slots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "TODOS" }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        toast.error("No se pudo vaciar", data.error || "Inténtalo de nuevo.");
        return;
      }
      const n = Number(data.deleted ?? 0);
      toast.success(
        esPaquetes ? `${n} paquete${n === 1 ? "" : "s"} borrado${n === 1 ? "" : "s"}` : `${n} horario${n === 1 ? "" : "s"} borrado${n === 1 ? "" : "s"}`,
        esPaquetes ? "La tienda quedó sin paquetes." : "La agenda quedó vacía."
      );
      recargar();
    } catch {
      toast.error("No se pudo vaciar", "Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setVaciando(null);
    }
  }

  const sugerencias = useMemo(() => {
    if (!loadedAt) return new Map<string, TemplateSuggestion>();
    return suggestTemplates(
      slots.map((slot) => ({
        id: slot.id,
        difficulty: slot.difficulty,
        label: slot.label,
        scheduledAt: slot.scheduled_at,
        offerIds: (slot.boost_slot_offers ?? []).map((o) => o.offer_id),
      })),
      new Date(loadedAt)
    );
  }, [slots, loadedAt]);

  async function aplicarPlantillas(slotIds: string[] | null) {
    setAplicandoPlantilla(true);
    try {
      const res = await fetch("/api/admin/reservas/slots/apply-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotIds ? { slotIds } : {}),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        toast.error("No se pudo copiar", data.error || "Intenta de nuevo.");
        return;
      }
      const n = Number(data.applied ?? 0);
      if (n === 0) {
        toast.info("Nada que copiar", "Ninguna de esas runs tiene una igual ya configurada.");
        return;
      }
      toast.success(
        n === 1 ? "1 run publicada" : `${n} runs publicadas`,
        "Se les copiaron los contenidos de una run igual. Revisa que sea lo que vendes en ellas."
      );
      recargar();
    } catch {
      toast.error("No se pudo copiar", "Revisa la conexión e intenta de nuevo.");
    } finally {
      setAplicandoPlantilla(false);
    }
  }

  function startEditOffer(offer: Offer) {
    setEditingOfferId(offer.id);
    setEditOfferForm({
      category: offer.category,
      group_label: offer.group_label ?? "",
      title_en: offer.title_en,
      title_es: offer.title_es ?? "",
      description_en: offer.description_en ?? "",
      description_es: offer.description_es ?? "",
      price_gold: String(offer.price_gold),
      badge: offer.badge ?? "",
    });
  }

  function cancelEditOffer() {
    setEditingOfferId(null);
    setEditOfferForm(EMPTY_OFFER);
  }

  async function persistOffer(form: OfferForm, id: string | null) {
    if (!form.title_en.trim()) {
      toast.error("Falta el título", "El título en inglés es el que ve la tienda por defecto.");
      return;
    }
    const price = Number(form.price_gold);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Precio inválido", "El precio va en oro, solo números.");
      return;
    }

    setSavingOffer(true);
    const res = await fetch(id ? `/api/admin/reservas/offers/${id}` : "/api/admin/reservas/offers", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, price_gold: price }),
    });
    const data = await readJsonBody(res);
    setSavingOffer(false);
    if (!res.ok) {
      toast.error("No se pudo guardar", data.error || "Inténtalo de nuevo.");
      return;
    }
    toast.success(id ? "Paquete actualizado" : "Paquete creado");
    if (id) {
      cancelEditOffer();
    } else {
      setOfferForm(EMPTY_OFFER);
      setOfferFormOpen(false);
    }
    recargar();
  }

  async function toggleOffer(offer: Offer) {
    const res = await fetch(`/api/admin/reservas/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !offer.is_active }),
    });
    const data = await readJsonBody(res);
    if (!res.ok) {
      toast.error("No se pudo cambiar", data.error || "Inténtalo de nuevo.");
      return;
    }
    setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, is_active: !o.is_active } : o)));
    toast.success(offer.is_active ? "Paquete oculto de la tienda" : "Paquete visible en la tienda");
  }

  async function deleteOffer(offer: Offer) {
    const ok = await confirm(`¿Borrar "${offer.title_en}" del catálogo?`, {
      title: "Borrar paquete",
      confirmLabel: "Borrar",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/reservas/offers/${offer.id}`, { method: "DELETE" });
    const data = await readJsonBody(res);
    if (!res.ok) {
      toast.error("No se pudo borrar", data.error || "Inténtalo de nuevo.");
      return;
    }
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    toast.success("Paquete borrado", "Las reservas que ya lo eligieron conservan su copia.");
  }

  function startEditSlot(slot: Slot) {
    setEditingSlotId(slot.id);
    setEditSlotForm({
      scheduled_at: toLocalInput(slot.scheduled_at),
      difficulty: slot.difficulty,
      label: slot.label ?? "",
      capacity: String(slot.capacity),
      booked_count: String(slot.booked_count),
    });
  }

  function cancelEditSlot() {
    setEditingSlotId(null);
    setEditSlotForm(EMPTY_SLOT);
  }

  async function persistSlot(form: SlotForm, id: string | null) {
    if (!form.scheduled_at) {
      toast.error("Falta la fecha", "Elige el día y la hora de la run.");
      return;
    }
    const capacity = Number(form.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) {
      toast.error("Cupo inválido", "Tiene que ser 1 o más.");
      return;
    }
    const bookedCount = Number(form.booked_count);
    if (!Number.isFinite(bookedCount) || bookedCount < 0) {
      toast.error("Cupos vendidos inválidos", "Tiene que ser 0 o más.");
      return;
    }
    const apartados = id ? (slots.find((s) => s.id === id)?.local_hold_count ?? 0) : 0;
    if (bookedCount + apartados > capacity) {
      toast.error(
        "No entra en el cupo",
        apartados > 0
          ? `Quedarían ${bookedCount + apartados} ocupados (${bookedCount} vendidos + ${apartados} apartados por reservas) sobre ${capacity}.`
          : "Sube el cupo total o baja los vendidos."
      );
      return;
    }
    if (!isWithinSchedulingWindow(new Date(form.scheduled_at))) {
      toast.error(
        "Fuera de las dos semanas",
        `Solo se agenda en la semana en curso y la siguiente, hasta el ${windowEndLabel}.`
      );
      return;
    }

    setSavingSlot(true);
    const res = await fetch(id ? `/api/admin/reservas/slots/${id}` : "/api/admin/reservas/slots", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        difficulty: form.difficulty,
        label: form.label,
        capacity,
        booked_count: bookedCount,
      }),
    });
    const data = await readJsonBody(res);
    setSavingSlot(false);
    if (!res.ok) {
      toast.error("No se pudo guardar", data.error || "Inténtalo de nuevo.");
      return;
    }
    toast.success(id ? "Horario actualizado" : "Horario creado");
    if (id) {
      cancelEditSlot();
    } else {
      setSlotForm(EMPTY_SLOT);
      setSlotFormOpen(false);
    }
    recargar();
  }

  async function toggleSlot(slot: Slot) {
    const res = await fetch(`/api/admin/reservas/slots/${slot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !slot.is_active }),
    });
    const data = await readJsonBody(res);
    if (!res.ok) {
      toast.error("No se pudo cambiar", data.error || "Inténtalo de nuevo.");
      return;
    }
    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, is_active: !s.is_active } : s)));
  }

  async function deleteSlot(slot: Slot) {
    const ok = await confirm("¿Borrar este horario de la tienda?", {
      title: "Borrar horario",
      confirmLabel: "Borrar",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/reservas/slots/${slot.id}`, { method: "DELETE" });
    const data = await readJsonBody(res);
    if (!res.ok) {
      toast.error("No se pudo borrar", data.error || "Inténtalo de nuevo.");
      return;
    }
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    toast.success("Horario borrado");
  }

  return (
    <div className="portal-container is-wide">
      <PageHeader
        eyebrow="Ventas"
        icon={Store}
        title="Catálogo de boosts"
        description="Lo que ve un comprador en la tienda: los paquetes con su precio en oro y las runs agendadas con su cupo."
        actions={
          <Link href="/reservas" className="btn btn-secondary">
            <Ticket className="w-3.5 h-3.5" />
            Ver reservas
          </Link>
        }
      />

      {error && (
        <p className="text-sm mb-3" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <div className="mb-4">
        <SegmentedToggle
          ariaLabel="Qué administrar"
          value={tab}
          onChange={setTab}
          options={[
            { value: "paquetes", label: "Paquetes", sublabel: loading ? undefined : `${offers.length}` },
            { value: "horarios", label: "Horarios", sublabel: loading ? undefined : `${slots.length}` },
          ]}
        />
      </div>

      {tab === "paquetes" && (
      <>
      <section className="card p-4 mb-4">
        <SectionToggle
          icon={Plus}
          title="Agregar paquete"
          hint="Título, descripción y precio en oro, en los dos idiomas"
          open={offerFormOpen}
          onToggle={() => setOfferFormOpen((v) => !v)}
        />
        {offerFormOpen && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-surface-2)" }}>
            <OfferFormFields
              form={offerForm}
              setForm={setOfferForm}
              onSave={() => persistOffer(offerForm, null)}
              saving={savingOffer}
              editing={false}
            />
          </div>
        )}
      </section>

      <section className="card p-4 mb-4">
        <SectionToggle
          icon={ClipboardPaste}
          title="Importar desde la plataforma"
          hint="Pega el catálogo copiado y se cargan todos los paquetes de una"
          open={importOpen}
          onToggle={() => setImportOpen((v) => !v)}
          color="var(--color-success)"
        />
        {importOpen && (
          <PanelImportar
            endpoint="/api/admin/reservas/offers/import"
            previa={previaCatalogo}
            unidad="paquete(s) reconocido(s)"
            ayuda="Abre el catálogo en la plataforma, selecciona todo (Ctrl+A), copia y pega acá. Se reconocen el grupo, la dificultad, el título, la descripción y el precio de cada paquete."
            nota="Los paquetes que ya existen se actualizan (precio, descripción y etiqueta); no se duplican. Las traducciones al español que hayas cargado a mano no se tocan."
            onImportado={recargar}
          />
        )}
      </section>

      <div className="section-rule" />
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <p className="section-eyebrow">Tienda</p>
          <h2 className="section-title">Paquetes</h2>
        </div>
        {!loading && (
          <div className="flex items-center gap-3">
            <p className="text-meta text-ink-muted">
              {offers.filter((o) => o.is_active).length} visibles de {offers.length}
            </p>
            {canWipe && offers.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost text-meta"
                disabled={vaciando !== null}
                onClick={() => vaciar("paquetes")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {vaciando === "paquetes" ? "Borrando…" : "Borrar todos"}
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <LoadingState variant="rows" count={4} />
      ) : offers.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-ink-muted text-sm">Todavía no hay ningún paquete cargado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 mb-8">
          {offers.map((offer, index) => {
            const editing = editingOfferId === offer.id;
            return (
              <div key={offer.id} className="cascade-item" style={cascadeStyle(index)}>
                <div
                  className="balance-row grid items-center gap-3 rounded-lg px-3.5 py-2.5"
                  style={{ gridTemplateColumns: "auto minmax(0, 1fr) auto auto auto" }}
                >
                  <span className="pill pill-common">{CATEGORY_LABEL[offer.category]}</span>
                  <span className="min-w-0">
                    <span className="text-sm text-ink block truncate">
                      {offer.title_en}
                      {offer.badge && <span className="pill pill-accent ml-2">{offer.badge}</span>}
                    </span>
                    <span className="text-micro text-ink-faint block truncate">{offer.group_label}</span>
                  </span>
                  <span className="font-data text-sm whitespace-nowrap" style={{ color: "var(--color-gold)" }}>
                    {formatGold(offer.price_gold, "es")}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleOffer(offer)}
                    className={offer.is_active ? "pill pill-success" : "pill pill-common"}
                    title={offer.is_active ? "Visible en la tienda. Click para ocultar" : "Oculto. Click para mostrar"}
                  >
                    {offer.is_active ? "Visible" : "Oculto"}
                  </button>
                  <span className="flex items-center gap-1">
                    <IconAction
                      icon={editing ? X : Pencil}
                      label={editing ? "Cerrar edición" : "Editar paquete"}
                      onClick={() => (editing ? cancelEditOffer() : startEditOffer(offer))}
                    />
                    <IconAction icon={Trash2} label="Borrar paquete" className="hover:text-[color:var(--color-danger)]" onClick={() => deleteOffer(offer)} />
                  </span>
                </div>

                {editing && (
                  <div
                    className="card p-4 mt-1.5"
                    style={{ borderColor: "var(--color-primary)" }}
                  >
                    <OfferFormFields
                      form={editOfferForm}
                      setForm={setEditOfferForm}
                      onSave={() => persistOffer(editOfferForm, offer.id)}
                      onCancel={cancelEditOffer}
                      saving={savingOffer}
                      editing
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      </>
      )}

      {tab === "horarios" && (
      <>
      <section className="card p-4 mb-4">
        <SectionToggle
          icon={CalendarPlus}
          title="Agregar horario"
          hint="Una run agendada, con su dificultad y su cupo"
          open={slotFormOpen}
          onToggle={() => setSlotFormOpen((v) => !v)}
          color="var(--color-secondary)"
        />
        {slotFormOpen && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-surface-2)" }}>
            <SlotFormFields
              form={slotForm}
              setForm={setSlotForm}
              onSave={() => persistSlot(slotForm, null)}
              saving={savingSlot}
              editing={false}
              minDate={windowMinDate}
              maxDate={windowMaxDate}
              windowEndLabel={windowEndLabel}
            />
          </div>
        )}
      </section>

      <section className="card p-4 mb-4">
        <SectionToggle
          icon={ClipboardPaste}
          title="Importar desde la plataforma"
          hint="Pega la tabla de horarios y se agenda todo de una"
          open={importOpen}
          onToggle={() => setImportOpen((v) => !v)}
          color="var(--color-success)"
        />
        {importOpen && (
          <PanelImportar
            endpoint="/api/admin/reservas/slots/import"
            previa={previaAgenda}
            unidad="run(s) reconocida(s)"
            ayuda="Abre la tabla de horarios en la plataforma, selecciona todo (Ctrl+A), copia y pega acá. Se leen la fecha, la hora (del Este), la raid, los cupos y la dificultad de cada fila."
            nota="Las runs que ya están agendadas se actualizan (cupo y vendidos); no se duplican. Solo se importan las de GG y dentro de las dos semanas. Las nuevas entran SIN publicar: falta marcar qué se vende en cada una."
            onImportado={recargar}
          />
        )}
      </section>

      <div className="section-rule" />
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <p className="section-eyebrow">Agenda</p>
          <h2 className="section-title">Horarios</h2>
        </div>
        {!loading && (
          <div className="flex items-center gap-3">
            <p className="text-meta text-ink-muted">
              Todo lo que viene · las pasadas se borran solas
            </p>
            {canWipe && slots.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost text-meta"
                disabled={vaciando !== null}
                onClick={() => vaciar("horarios")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {vaciando === "horarios" ? "Borrando…" : "Borrar todos"}
              </button>
            )}
          </div>
        )}
      </div>

      {!loading && sync && (sync.state === "caido" || sync.state === "desconocido") && (
        <div
          className="card p-3.5 mb-3 flex flex-wrap items-center gap-2"
          style={{ borderColor: "var(--color-danger)" }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--color-danger)" }} />
          <p className="text-sm text-ink">
            {sync.state === "desconocido" ? (
              <>
                <span className="font-semibold">La agenda no se está sincronizando.</span>{" "}
                <span className="text-ink-muted">
                  Nunca llegó una sincronización: abre la plataforma en el navegador con el script
                  instalado para que los cupos se actualicen solos.
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">
                  La agenda no se sincroniza {formatSinceSync(sync.minutesSinceSync)}.
                </span>{" "}
                <span className="text-ink-muted">
                  Los cupos que ve un comprador pueden estar vencidos. Revisa que la pestaña de la
                  plataforma siga abierta y con sesión.
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {!loading && sugerencias.size > 0 && (
        <div
          className="card p-3.5 mb-3 flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "var(--color-warning)" }}
        >
          <p className="text-sm text-ink">
            <span className="font-semibold">
              {sugerencias.size === 1
                ? "1 run sin publicar"
                : `${sugerencias.size} runs sin publicar`}
            </span>
            <span className="text-ink-muted">
              {" "}
              tienen otra igual ya configurada. Puedes copiarle los contenidos.
            </span>
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={aplicandoPlantilla}
            onClick={() => aplicarPlantillas(null)}
          >
            {aplicandoPlantilla
              ? "Copiando…"
              : `Copiar en ${sugerencias.size === 1 ? "la run" : `las ${sugerencias.size}`}`}
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState variant="rows" count={3} />
      ) : slots.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-ink-muted text-sm">
            No hay ninguna run agendada. Sin horarios, la tienda muestra los paquetes pero nadie puede anotarse a una run.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {slots.map((slot, index) => {
            const left = remainingCapacity(slot.capacity, slot.booked_count, slot.local_hold_count);
            const ocupados = slot.booked_count + slot.local_hold_count;
            const past = new Date(slot.scheduled_at).getTime() < loadedAt;
            const editing = editingSlotId === slot.id;
            const configurando = configurandoSlotId === slot.id;
            const contenidos = (slot.boost_slot_offers ?? []).length;
            const sugerencia = sugerencias.get(slot.id);
            const publicada = slot.is_active && !past && contenidos > 0;
            return (
              <div key={slot.id} className="cascade-item" style={cascadeStyle(index)}>
                <div
                  className="balance-row grid items-center gap-3 rounded-lg px-3.5 py-2.5"
                  style={{ gridTemplateColumns: "auto auto minmax(0, 1fr) auto auto auto" }}
                >
                  <span className="pill pill-common">{CATEGORY_LABEL[slot.difficulty]}</span>
                  <span className="font-data text-sm text-ink whitespace-nowrap">
                    {new Date(slot.scheduled_at).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <span className="text-meta text-ink-muted truncate">
                    {slot.label ?? "Sin etiqueta"}
                    {contenidos === 0 ? (
                      <span className="pill pill-warning ml-2">Sin contenidos</span>
                    ) : (
                      <span className="pill pill-common ml-2">
                        {contenidos} contenido{contenidos === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <span
                    className={left === 0 ? "pill pill-common" : "pill pill-info"}
                    title={
                      slot.local_hold_count > 0
                        ? `${ocupados} de ${slot.capacity} ocupados: ${slot.booked_count} vendidos en la plataforma + ${slot.local_hold_count} apartados por reservas de la tienda. Quedan ${left}.`
                        : `${ocupados} de ${slot.capacity} vendidos en la plataforma. Quedan ${left}.`
                    }
                  >
                    {ocupados}/{slot.capacity}
                    {slot.local_hold_count > 0 && (
                      <span className="text-ink-faint"> · {slot.local_hold_count} apart.</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSlot(slot)}
                    className={publicada ? "pill pill-success" : "pill pill-common"}
                    title={
                      past
                        ? "Ya pasó: no se ofrece aunque esté activo"
                        : contenidos === 0
                          ? "No se publica: primero marca qué se vende en esta run"
                          : slot.is_active
                            ? "Visible. Click para ocultar"
                            : "Oculto. Click para mostrar"
                    }
                  >
                    {past ? "Pasado" : contenidos === 0 ? "Sin publicar" : slot.is_active ? "Visible" : "Oculto"}
                  </button>
                  <span className="flex items-center gap-1">
                    {sugerencia && (
                      <IconAction
                        icon={CopyPlus}
                        label={`Copiar ${
                          sugerencia.offerIds.length === 1
                            ? "el contenido"
                            : `los ${sugerencia.offerIds.length} contenidos`
                        } de la run igual del ${new Date(
                          sugerencia.sourceScheduledAt
                        ).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`}
                        className="text-[color:var(--color-warning)]"
                        onClick={() => aplicarPlantillas([slot.id])}
                      />
                    )}
                    <IconAction
                      icon={ListChecks}
                      label={configurando ? "Cerrar contenidos" : "Elegir qué se vende"}
                      className={contenidos === 0 ? "text-[color:var(--color-warning)]" : undefined}
                      onClick={() => setConfigurandoSlotId(configurando ? null : slot.id)}
                    />
                    <IconAction
                      icon={editing ? X : Pencil}
                      label={editing ? "Cerrar edición" : "Editar horario"}
                      onClick={() => (editing ? cancelEditSlot() : startEditSlot(slot))}
                    />
                    <IconAction icon={Trash2} label="Borrar horario" className="hover:text-[color:var(--color-danger)]" onClick={() => deleteSlot(slot)} />
                  </span>
                </div>

                {editing && (
                  <div className="card p-4 mt-1.5" style={{ borderColor: "var(--color-secondary)" }}>
                    <SlotFormFields
                      form={editSlotForm}
                      setForm={setEditSlotForm}
                      onSave={() => persistSlot(editSlotForm, slot.id)}
                      onCancel={cancelEditSlot}
                      saving={savingSlot}
                      editing
                      minDate={windowMinDate}
                      maxDate={windowMaxDate}
                      windowEndLabel={windowEndLabel}
                    />
                  </div>
                )}

                {configurando && (
                  <ContenidosDelHorario
                    slot={slot}
                    offers={offers}
                    onGuardado={() => {
                      setConfigurandoSlotId(null);
                      recargar();
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}
