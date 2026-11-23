type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  private updatePatch: Row | null = null;
  private insertRows: Row[] | null = null;
  private conflictCols: string[] = [];
  private ignoreDuplicates = false;
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode = false;
  private nextId = 0;

  constructor(private rows: Row[]) {}

  select(cols?: string) {
    void cols;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((row) => row[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((row) => vals.includes(row[col]));
    return this;
  }
  ilike(col: string, val: unknown) {
    const pattern = String(val).toLowerCase();
    this.filters.push((row) => String(row[col] ?? "").toLowerCase() === pattern);
    return this;
  }
  not(col: string, operator: string, val: unknown) {
    if (operator === "is" && val === null) {
      this.filters.push((row) => row[col] !== null && row[col] !== undefined);
    } else {
      this.filters.push((row) => row[col] !== val);
    }
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push((row) => (row[col] as string) >= (val as string));
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push((row) => (row[col] as string) <= (val as string));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle() {
    this.singleMode = true;
    return this;
  }
  single() {
    this.singleMode = true;
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.updatePatch = patch;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.conflictCols = opts?.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : [];
    this.ignoreDuplicates = opts?.ignoreDuplicates ?? false;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  private matching(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  then<T1 = { data: unknown; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    let result: Row[];

    if (this.mode === "update") {
      const matched = this.matching();
      for (const row of matched) Object.assign(row, this.updatePatch);
      result = matched;
    } else if (this.mode === "insert") {
      const inserted = this.insertRows!.map((r) => ({
        id: (r.id as string) ?? `fake-${this.nextId++}`,
        ...r,
      }));
      this.rows.push(...inserted);
      result = inserted;
    } else if (this.mode === "upsert") {
      const touched: Row[] = [];
      for (const incoming of this.insertRows!) {
        const existing = this.conflictCols.length
          ? this.rows.find((row) => this.conflictCols.every((col) => row[col] === incoming[col]))
          : undefined;
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, incoming);
          touched.push(existing);
        } else {
          const inserted = { id: (incoming.id as string) ?? `fake-${this.nextId++}`, ...incoming };
          this.rows.push(inserted);
          touched.push(inserted);
        }
      }
      result = touched;
    } else if (this.mode === "delete") {
      const matched = this.matching();
      const matchedSet = new Set(matched);
      const remaining = this.rows.filter((r) => !matchedSet.has(r));
      this.rows.length = 0;
      this.rows.push(...remaining);
      result = matched;
    } else {
      result = this.matching();
      if (this.orderCol) {
        const col = this.orderCol;
        result = [...result].sort((a, b) => {
          const av = a[col] as string | number;
          const bv = b[col] as string | number;
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return this.orderAsc ? cmp : -cmp;
        });
      }
      if (this.limitN !== null) result = result.slice(0, this.limitN);
      if (this.rangeFrom !== null) result = result.slice(this.rangeFrom, (this.rangeTo ?? result.length) + 1);
    }

    const payload = this.singleMode ? { data: result[0] ?? null, error: null } : { data: result, error: null };
    return Promise.resolve(payload).then(onfulfilled, onrejected ?? undefined);
  }
}

export function createFakeSupabase(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }

  return {
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      return new FakeQueryBuilder(tables[table]);
    },
    _tables: tables,
  };
}
