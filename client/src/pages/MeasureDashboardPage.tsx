import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowRight,
  CalendarClock,
  FileText,
  LayoutDashboard,
  Plus,
  Trash2,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { InsightsDashboard } from "@/components/InsightsDashboard";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { scheduleDescription } from "@shared/insights";
import { toast } from "sonner";
import AnalyticsPage from "./AnalyticsPage";
import "@/styles/insights.css";

function Reports({ organizationId }: { organizationId: number }) {
  const reports = trpc.insights.list.useQuery(
    { organizationId },
    { refetchInterval: 15000 }
  );
  const options = trpc.insights.options.useQuery({ organizationId });
  const archive = trpc.insights.archive.useMutation();
  const pause = trpc.insights.pause.useMutation();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const rows =
    reports.data?.filter(
      r =>
        r.config.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "scheduled" && r.config.schedule.enabled) ||
          (filter === "attention" &&
            (!!r.scheduleError ||
              r.latest?.status === "failed" ||
              r.latest?.status === "partial" ||
              r.latest?.deliveryState === "failed")))
    ) ?? [];
  return (
    <section className="insight-library">
      <div className="insight-library-filters">
        <div className="insight-filter-pills">
          {[
            ["all", "All reports"],
            ["scheduled", "Scheduled"],
            ["attention", "Needs attention"],
          ].map(([id, label]) => (
            <button
              aria-pressed={filter === id}
              key={id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          aria-label="Search reports"
          placeholder="Search reports…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {reports.isLoading ? (
        <p role="status">Loading reports…</p>
      ) : reports.error ? (
        <p role="alert" className="insight-notice">
          Reports could not be loaded.{" "}
          <button onClick={() => reports.refetch()}>Try again</button>
        </p>
      ) : !rows.length ? (
        <div className="insight-results-empty">
          <FileText size={42} />
          <h2>
            {reports.data?.length
              ? "No reports match these filters"
              : "Your reporting workspace starts here"}
          </h2>
          <p>
            Build a report, schedule it, and add the most useful views to your
            dashboards.
          </p>
          <Button asChild>
            <Link href="/app/analytics/studio">
              <Plus size={16} />
              Create report
            </Link>
          </Button>
        </div>
      ) : (
        <div className="insight-report-cards">
          {rows.map(r => (
            <article className="insight-report-card" key={r.id}>
              <div className="insight-section-title">
                <span className="insight-badge">
                  {r.config.schedule.enabled ? "Scheduled" : "On demand"}
                </span>
                {r.latest && (
                  <span
                    className="insight-status"
                    data-status={r.latest.status}
                  >
                    {r.latest.status}
                  </span>
                )}
              </div>
              <h2>{r.config.name}</h2>
              <p>
                {r.config.description ||
                  `${r.config.connectionIds.length} source(s) · ${r.config.metrics.length} selected metrics`}
              </p>
              <div className="insight-report-schedule">
                <CalendarClock size={17} />
                <div>
                  {scheduleDescription(r.config)}
                  {r.nextRunAtMs && (
                    <small>
                      Next:{" "}
                      {new Date(r.nextRunAtMs).toLocaleString(undefined, {
                        timeZone: r.config.timezone,
                      })}
                    </small>
                  )}
                </div>
              </div>
              {r.scheduleError && (
                <p className="insight-stale">{r.scheduleError}</p>
              )}
              <p className="insight-caption">
                {r.latest
                  ? `Last run: ${new Date(r.latest.createdAtMs).toLocaleString()} · Email: ${r.latest.deliveryState === "disabled" ? "Not requested" : r.latest.deliveryState}`
                  : "Not run yet"}
              </p>
              {r.latest?.deliveryError && (
                <p className="insight-stale">{r.latest.deliveryError}</p>
              )}
              <footer>
                {r.config.schedule.enabled && options.data?.canEdit && (
                  <Button
                    variant="ghost"
                    disabled={pause.isPending}
                    onClick={async () => {
                      try {
                        await pause.mutateAsync({
                          organizationId,
                          id: r.id,
                          revision: r.revision,
                        });
                        await Promise.all([
                          utils.insights.list.invalidate(),
                          utils.insights.dashboardData.invalidate(),
                        ]);
                        toast.success("Schedule paused");
                      } catch (e) {
                        toast.error(
                          e instanceof Error
                            ? e.message
                            : "Could not pause schedule."
                        );
                      }
                    }}
                  >
                    Pause schedule
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link
                    href={`/app/analytics/studio?id=${r.id}${r.latest ? `&run=${r.latest.id}` : ""}`}
                  >
                    Open report
                    <ArrowRight size={16} />
                  </Link>
                </Button>
                {options.data?.canEdit && (
                  <button
                    aria-label={`Archive ${r.config.name}`}
                    className="insight-icon"
                    disabled={archive.isPending}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Archive “${r.config.name}” and stop its schedule? Its dashboard widgets will show it as unavailable.`
                        )
                      )
                        return;
                      try {
                        await archive.mutateAsync({
                          organizationId,
                          id: r.id,
                          revision: r.revision,
                        });
                        await Promise.all([
                          utils.insights.list.invalidate(),
                          utils.insights.dashboardData.invalidate(),
                        ]);
                        toast.success("Report archived and schedule stopped");
                      } catch (e) {
                        toast.error(
                          e instanceof Error
                            ? e.message
                            : "Could not archive report."
                        );
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function Measure() {
  const { organizationId } = useWorkspace();
  const [path] = useLocation();
  const reports = path.endsWith("/reports");
  if (!organizationId) return null;
  return (
    <>
      <PageHeader
        eyebrow="Measure"
        title={reports ? "Saved reports" : "Performance, in perspective."}
        description={
          reports
            ? "Your report definitions, schedules, and run history in one place."
            : "Build your view of performance. Turn your most useful insights into a routine."
        }
        action={
          <Button asChild>
            <Link href="/app/analytics/studio">
              <Plus size={16} />
              New report
            </Link>
          </Button>
        }
      />
      <nav className="insight-page-nav" aria-label="Measure views">
        <Link
          href="/app/analytics"
          aria-current={!reports ? "page" : undefined}
        >
          <LayoutDashboard size={16} />
          Dashboard
        </Link>
        <Link
          href="/app/analytics/reports"
          aria-current={reports ? "page" : undefined}
        >
          <FileText size={16} />
          Saved reports
        </Link>
        <Link href="/app/analytics/advertising">
          Advertising detail
          <ArrowRight size={14} />
        </Link>
        <Link href="/app/analytics/social">
          Social detail
          <ArrowRight size={14} />
        </Link>
      </nav>
      {reports ? (
        <Reports key={organizationId} organizationId={organizationId} />
      ) : (
        <InsightsDashboard
          key={organizationId}
          organizationId={organizationId}
          surface="measure"
        />
      )}
    </>
  );
}
export default function MeasureDashboardPage() {
  // Previously shared scoped analytics URLs retain their original meaning.
  const tab = new URLSearchParams(useSearch()).get("tab");
  if (tab === "social" || tab === "advertising") return <AnalyticsPage />;
  return (
    <WorkspaceGate>
      <Measure />
    </WorkspaceGate>
  );
}
