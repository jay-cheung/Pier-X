import type { TabState } from "../lib/types";
import { useI18n } from "../i18n/useI18n";
import { DB_KIND_META } from "../lib/rightToolMeta";

// Placeholder shell for InfluxDB. As a time-series store its browse model
// (buckets / measurements over the HTTP API) differs from the relational
// grid, so it will get its own client surface rather than reusing the SQL
// result grid — tracked as a follow-up after the SQL Server driver lands.
type Props = { tab: TabState | null };

export default function InfluxPanel(_props: Props) {
  const { t } = useI18n();
  const meta = DB_KIND_META.influx;
  const Icon = meta.icon;
  return (
    <div className="panel-section panel-section--empty">
      <div className="panel-section__title mono">
        <Icon size={12} /> {meta.label}
      </div>
      <div className="status-note mono">
        {t("InfluxDB support is planned — time-series browsing is on the roadmap.")}
      </div>
    </div>
  );
}
