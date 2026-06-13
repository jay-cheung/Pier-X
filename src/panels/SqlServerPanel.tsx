import { useMemo, useState } from "react";
import { Play, Plug, RefreshCw, Table2, Unplug } from "lucide-react";
import type { QueryExecutionResult, TabState } from "../lib/types";
import { effectiveSshTarget } from "../lib/types";
import * as cmd from "../lib/commands";
import type { SqlServerOverview } from "../lib/commands";
import { useI18n } from "../i18n/useI18n";
import { localizeError } from "../i18n/localizeMessage";
import { DB_KIND_META } from "../lib/rightToolMeta";
import Select from "../components/Select";
import PanelHeader from "../components/PanelHeader";

// Functional v1 SQL Server client. Unlike the MySQL / PostgreSQL panels
// it is not yet wired into the saved-credential / SSH-tunnel flow — it
// connects directly to the entered host:port (default the tab's SSH host
// on 1433). Saved-credential + auto-tunnel integration, schema tree, and
// inline grid editing are tracked follow-ups; this covers connect →
// browse tables → run T-SQL → view results end-to-end.

type Props = { tab: TabState | null };

type Form = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

const META = DB_KIND_META.sqlserver;

function storageKey(host: string) {
  return `pier-x:mssql:${host || "local"}`;
}

export default function SqlServerPanel({ tab }: Props) {
  const { t } = useI18n();
  const fmt = (e: unknown) => localizeError(e, t);
  const sshHost = tab ? effectiveSshTarget(tab)?.host ?? "" : "";

  const [form, setForm] = useState<Form>(() => {
    const def: Form = {
      host: sshHost || "127.0.0.1",
      port: "1433",
      user: "sa",
      password: "",
      database: "",
    };
    try {
      const raw = localStorage.getItem(storageKey(sshHost));
      if (raw) return { ...def, ...JSON.parse(raw), password: "" };
    } catch {
      /* ignore malformed cache */
    }
    return def;
  });

  const [overview, setOverview] = useState<SqlServerOverview | null>(null);
  const [results, setResults] = useState<QueryExecutionResult | null>(null);
  const [sql, setSql] = useState("SELECT @@VERSION;");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const baseParams = () => ({
    host: form.host.trim(),
    port: Number.parseInt(form.port, 10) || 1433,
    user: form.user.trim(),
    password: form.password,
  });

  const persist = (f: Form) => {
    try {
      localStorage.setItem(
        storageKey(sshHost),
        JSON.stringify({ host: f.host, port: f.port, user: f.user, database: f.database }),
      );
    } catch {
      /* best-effort */
    }
  };

  const setField = (k: keyof Form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function connect(database?: string) {
    setBusy(true);
    setError("");
    try {
      const ov = await cmd.mssqlOverview({
        ...baseParams(),
        database: database ?? (form.database.trim() || null),
      });
      setOverview(ov);
      setForm((f) => {
        const nf = { ...f, database: ov.currentDatabase };
        persist(nf);
        return nf;
      });
    } catch (e) {
      setError(fmt(e));
      setOverview(null);
    } finally {
      setBusy(false);
    }
  }

  async function run(text?: string) {
    const q = (text ?? sql).trim();
    if (!q) return;
    setBusy(true);
    setError("");
    try {
      setResults(await cmd.mssqlExecute({ ...baseParams(), database: form.database.trim() || null, sql: q }));
    } catch (e) {
      setError(fmt(e));
    } finally {
      setBusy(false);
    }
  }

  function openTable(schema: string, name: string) {
    const q = `SELECT TOP 100 * FROM [${schema}].[${name}];`;
    setSql(q);
    void run(q);
  }

  function disconnect() {
    setOverview(null);
    setResults(null);
    setError("");
  }

  const dbOptions = useMemo(
    () => (overview?.databases ?? []).map((d) => ({ value: d, label: d })),
    [overview],
  );

  // ── Connect form ──────────────────────────────────────────────────
  if (!overview) {
    return (
      <div className="mssql-connect">
        <div className="mssql-connect__card">
          <div className="mssql-connect__title mono">
            <META.icon size={14} /> {META.label}
          </div>
          <div className="mssql-connect__sub">{t(META.splashSubtitle)}</div>
          <div className="mssql-form">
            <label className="field">
              <span className="field-label">{t("Host")}</span>
              <input
                className="field-input is-mono"
                value={form.host}
                onChange={(e) => setField("host", e.target.value)}
                placeholder="127.0.0.1"
              />
            </label>
            <label className="field mssql-form__port">
              <span className="field-label">{t("Port")}</span>
              <input
                className="field-input is-mono"
                value={form.port}
                onChange={(e) => setField("port", e.target.value)}
                placeholder="1433"
              />
            </label>
            <label className="field">
              <span className="field-label">{t("User")}</span>
              <input
                className="field-input is-mono"
                value={form.user}
                onChange={(e) => setField("user", e.target.value)}
                placeholder="sa"
              />
            </label>
            <label className="field">
              <span className="field-label">{t("Password")}</span>
              <input
                className="field-input is-mono"
                type="password"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void connect();
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">{t("Database")}</span>
              <input
                className="field-input is-mono"
                value={form.database}
                onChange={(e) => setField("database", e.target.value)}
                placeholder={t("(default)")}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn is-primary"
            disabled={busy || !form.host.trim() || !form.user.trim()}
            onClick={() => void connect()}
          >
            <Plug size={13} /> {busy ? t("Connecting…") : t("Connect")}
          </button>
          {error && <div className="status-note mono status-note--error">{error}</div>}
          <div className="mssql-connect__hint">
            {t("Connects directly to the address above (TLS off). For tunnel-only hosts, forward the port and use 127.0.0.1.")}
          </div>
        </div>
      </div>
    );
  }

  // ── Connected shell ───────────────────────────────────────────────
  return (
    <div className="mssql-panel">
      <PanelHeader
        icon={META.icon}
        title={META.label}
        meta={`${form.user}@${form.host}`}
        actions={
          <>
            <button
              type="button"
              className="btn is-ghost is-compact"
              title={t("Refresh")}
              onClick={() => void connect(form.database)}
              disabled={busy}
            >
              <RefreshCw size={11} />
            </button>
            <button
              type="button"
              className="btn is-ghost is-compact"
              title={t("Disconnect")}
              onClick={disconnect}
            >
              <Unplug size={11} />
            </button>
          </>
        }
      />
      <div className="mssql-body">
        <aside className="mssql-side">
          <div className="mssql-side__db">
            <Select
              value={form.database}
              onChange={(v) => {
                setField("database", v);
                void connect(v);
              }}
              items={dbOptions}
              mono
            />
          </div>
          <div className="mssql-side__tables">
            {overview.tables.length === 0 && (
              <div className="empty-note">{t("No tables.")}</div>
            )}
            {overview.tables.map((tbl) => (
              <button
                key={`${tbl.schema}.${tbl.name}`}
                type="button"
                className="mssql-table-row mono"
                title={`${tbl.schema}.${tbl.name}`}
                onClick={() => openTable(tbl.schema, tbl.name)}
              >
                <Table2 size={11} />
                <span className="mssql-table-row__name">{tbl.name}</span>
                <span className="mssql-table-row__schema">{tbl.schema}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="mssql-main">
          <div className="mssql-editor">
            <textarea
              className="mssql-editor__ta mono"
              value={sql}
              spellCheck={false}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void run();
                }
              }}
            />
            <div className="mssql-editor__bar">
              <button
                type="button"
                className="btn is-primary is-compact"
                disabled={busy}
                onClick={() => void run()}
              >
                <Play size={11} /> {t("Run")}
              </button>
              <span className="mssql-editor__hint">⌘⏎</span>
              {error && <span className="status-note mono status-note--error">{error}</span>}
            </div>
          </div>
          <div className="mssql-results">
            {results ? (
              <div className="data-table-wrap ux-selectable">
                <table className="data-table">
                  <thead>
                    <tr>
                      {results.columns.map((c, i) => (
                        <th key={i}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mssql-results__foot">
                  {t("{n} rows", { n: String(results.rows.length) })}
                  {results.truncated ? ` · ${t("truncated")}` : ""}
                  {` · ${results.elapsedMs} ms`}
                </div>
              </div>
            ) : (
              <div className="empty-note">{t("Run a query to see results.")}</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
