// ============================================================
// Imitation de Cloudflare D1 (et R2) pour les tests, sans réseau.
// La base est une vraie base SQLite en mémoire (module node:sqlite),
// créée avec les fichiers de migrations/ : on teste le vrai schéma.
// ============================================================
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = Record<string, unknown>;
const renvoieDesLignes = (sql: string) => /^\s*(SELECT|WITH|PRAGMA)\b|\bRETURNING\b/i.test(sql);

class Requete {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new Requete(this.db, this.sql, params);
  }
  private args() {
    return this.params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p)) as SQLInputValue[];
  }
  /** Exécute et renvoie un résultat au format D1. */
  executer() {
    const st = this.db.prepare(this.sql);
    if (renvoieDesLignes(this.sql)) {
      const results = st.all(...this.args()).map((r) => ({ ...r }) as Row);
      return { success: true, results, meta: { changes: results.length } };
    }
    const info = st.run(...this.args());
    return { success: true, results: [] as Row[], meta: { changes: Number(info.changes) } };
  }
  async first<T = Row>(col?: string): Promise<T | null> {
    const r = this.executer().results[0];
    if (!r) return null;
    return (col ? r[col] : r) as T;
  }
  async all<T = Row>() {
    return this.executer() as unknown as { success: true; results: T[]; meta: { changes: number } };
  }
  async run() {
    return this.executer();
  }
}

export function creerD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON'); // comme D1
  const dossier = join(import.meta.dirname, '..', 'migrations');
  for (const f of readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(dossier, f), 'utf8'));
  const d1 = {
    prepare: (sql: string) => new Requete(db, sql),
    // Comme D1 : toutes les requêtes réussissent ou aucune
    async batch(reqs: Requete[]) {
      db.exec('BEGIN');
      try {
        const res = reqs.map((r) => r.executer());
        db.exec('COMMIT');
        return res;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
  return { d1: d1 as unknown as D1Database, sqlite: db };
}

/** Imitation minimale d'un bucket R2 (stockage en mémoire). */
export function creerR2() {
  const objets = new Map<string, { data: Uint8Array; type: string }>();
  const r2 = {
    objets,
    async put(key: string, value: ArrayBuffer | Uint8Array | string, opts?: { httpMetadata?: { contentType?: string } }) {
      const data = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value as ArrayBuffer);
      objets.set(key, { data, type: opts?.httpMetadata?.contentType ?? 'application/octet-stream' });
      return { key, size: data.length };
    },
    async get(key: string) {
      const o = objets.get(key);
      if (!o) return null;
      return { body: new Blob([o.data as BlobPart]).stream(), size: o.data.length, httpMetadata: { contentType: o.type }, arrayBuffer: async () => o.data.buffer };
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objets.delete(k);
    },
    async list({ prefix = '', cursor }: { prefix?: string; cursor?: string } = {}) {
      const tout = [...objets.keys()].filter((k) => k.startsWith(prefix)).sort();
      const debut = cursor ? Number(cursor) : 0;
      const page = tout.slice(debut, debut + 2); // petites pages pour tester la pagination
      const truncated = debut + 2 < tout.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(debut + 2) : undefined };
    },
  };
  return r2;
}
