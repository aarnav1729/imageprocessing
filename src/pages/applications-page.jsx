import { motion } from "framer-motion";
import { Camera, ChevronLeft, ChevronRight, Download, FileWarning, FilterX, MessageSquareText, PanelTopOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ApplicationsPage({ sanctions, stats, state, setState, onViewImages, onRectify, onExport }) {
  const remarkCount = state.rows.filter((application) => Boolean(String(application.remarks || "").trim())).length;
  const imageBackedCount = state.rows.filter((application) => application.hasImages).length;
  const activeSanction = sanctions.find((sanction) => sanction._id === state.sanctionId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Application queue</CardTitle>
              <CardDescription>Review records as cards, with stronger notes, larger evidence access, and faster rectification.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <QueueToggle
                value={state.queue}
                onChange={(queue) =>
                  setState((current) => ({
                    ...current,
                    queue,
                    fraudMarked:
                      queue === "reviewed" && current.fraudMarked === "pending"
                        ? ""
                        : queue === "active" && (current.fraudMarked === "yes" || current.fraudMarked === "no")
                          ? ""
                          : current.fraudMarked,
                    page: 1,
                  }))
                }
              />
              <Button size="sm" variant="outline" onClick={() => onExport("filtered")}>
                <Download className="h-3.5 w-3.5" />
                Export filtered
              </Button>
              <Button size="sm" variant="outline" onClick={() => onExport("all")}>
                <Download className="h-3.5 w-3.5" />
                Export all
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    queue: "active",
                    page: 1,
                    limit: 100,
                    search: "",
                    sanctionId: "",
                    status: "mismatch",
                    fraudMarked: "",
                    hasImages: "",
                  }))
                }
              >
                <FilterX className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-[1.3fr,repeat(5,minmax(0,0.78fr))]">
            <Input
              placeholder="Search beneficiary, application, remarks"
              value={state.search}
              onChange={(event) => setState((current) => ({ ...current, search: event.target.value, page: 1 }))}
            />
            <FilterSelect
              value={state.sanctionId}
              onChange={(value) => setState((current) => ({ ...current, sanctionId: value, page: 1 }))}
            >
              <option value="">All sanctions</option>
              {sanctions.map((sanction) => (
                <option key={sanction._id} value={sanction._id}>
                  {sanction.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              value={state.status}
              onChange={(value) => setState((current) => ({ ...current, status: value, page: 1 }))}
            >
              <option value="">All status</option>
              <option value="match">Match</option>
              <option value="mismatch">Mismatch</option>
            </FilterSelect>
            <FilterSelect
              value={state.fraudMarked}
              onChange={(value) =>
                setState((current) => ({
                  ...current,
                  fraudMarked: value,
                  queue:
                    current.queue === "active" && (value === "yes" || value === "no")
                      ? "reviewed"
                      : current.queue === "reviewed" && value === "pending"
                        ? "active"
                        : current.queue,
                  page: 1,
                }))
              }
            >
              <option value="">All negligence state</option>
              <option value="pending">Pending</option>
              <option value="yes">Negligence</option>
              <option value="no">Clear</option>
            </FilterSelect>
            <FilterSelect
              value={state.hasImages}
              onChange={(value) => setState((current) => ({ ...current, hasImages: value, page: 1 }))}
            >
              <option value="">All asset state</option>
              <option value="true">Has images</option>
              <option value="false">No images</option>
            </FilterSelect>
            <FilterSelect
              value={String(state.limit)}
              onChange={(value) => setState((current) => ({ ...current, limit: Number(value), page: 1 }))}
            >
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
              <option value="200">200 per page</option>
              <option value="500">500 per page</option>
            </FilterSelect>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <QueueMetric label="Database total" value={stats.totalApps} />
            <QueueMetric label="Filtered total" value={state.total} />
            <QueueMetric label="Rows on page" value={state.rows.length} />
            <QueueMetric label="With remarks" value={remarkCount} />
            <QueueMetric label="With assets" value={imageBackedCount} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterPill label={`Queue: ${capitalize(state.queue)}`} />
            <FilterPill label={`Status: ${state.status ? capitalize(state.status) : "All"}`} />
            <FilterPill label={`Negligence: ${state.fraudMarked ? capitalize(state.fraudMarked) : "All"}`} />
            <FilterPill label={`Assets: ${state.hasImages ? (state.hasImages === "true" ? "Has images" : "No images") : "All"}`} />
            <FilterPill label={`Sanction: ${activeSanction?.name || "All"}`} />
            <FilterPill label={`Page size: ${state.limit}`} />
            {state.search ? <FilterPill label={`Search: ${state.search}`} /> : null}
          </div>

          <div className="max-h-[70vh] space-y-3 overflow-auto pr-1 scroll-slim">
            {!state.loading && !state.rows.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-white/70 p-10 text-center text-sm text-muted-foreground">
                No applications match the current queue and filters.
              </div>
            ) : (
              state.rows.map((application, index) => (
                <motion.div
                  key={application._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <ApplicationCard application={application} onRectify={onRectify} onViewImages={onViewImages} />
                </motion.div>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {state.total} rows · page {state.page} of {Math.max(state.pages, 1)}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={state.page <= 1}
                onClick={() => setState((current) => ({ ...current, page: current.page - 1 }))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={state.page >= state.pages}
                onClick={() => setState((current) => ({ ...current, page: current.page + 1 }))}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationCard({ application, onRectify, onViewImages }) {
  const remarks = String(application.remarks || "").trim();
  const previewImages = (application.images || []).slice(0, 3);

  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card/95 p-4 shadow-card surface-glow transition"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_32%),linear-gradient(120deg,rgba(255,255,255,0.55),rgba(237,244,255,0.14),transparent_70%)] opacity-0 transition duration-300 group-hover:opacity-100" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold tracking-tight text-foreground">{application.applicationNo}</div>
            <StatusBadge value={application.status} />
            <FraudBadge value={application.fraudMarked} />
            <Badge variant={application.hasImages ? "success" : "ghost"}>
              {application.images?.length || 0} asset{application.images?.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-foreground">{application.beneficiaryName || "No beneficiary"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Sanction: {application.sanctionName || "Unassigned"}</span>
            <span>Queue state: {application.fraudMarked === "pending" ? "Needs review" : "Responded"}</span>
          </div>
        </div>

        <div className="relative flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!application.hasImages} onClick={() => onViewImages(application)}>
            <Camera className="h-3.5 w-3.5" />
            Open gallery
          </Button>
          <Button size="sm" onClick={() => onRectify(application)}>
            <FileWarning className="h-3.5 w-3.5" />
            Rectify
          </Button>
        </div>
      </div>

      <div className="relative mt-4 grid gap-3 xl:grid-cols-[1.3fr,0.7fr]">
        <RemarksPanel remarks={remarks} />
        <AssetPreviewPanel application={application} previewImages={previewImages} onViewImages={onViewImages} />
      </div>
    </motion.div>
  );
}

function RemarksPanel({ remarks }) {
  if (!remarks) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-secondary/35 p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <MessageSquareText className="h-3.5 w-3.5" />
          Remarks
        </div>
        <div className="mt-2 text-sm text-muted-foreground">No remarks were provided for this record.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#f0d8a0] bg-[#fff8e8] p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#8c5b00]">
        <MessageSquareText className="h-3.5 w-3.5" />
        Remarks
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-[#6c4700]">{remarks}</div>
    </div>
  );
}

function AssetPreviewPanel({ application, previewImages, onViewImages }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <PanelTopOpen className="h-3.5 w-3.5" />
            Asset preview
          </div>
          <div className="mt-1 text-sm text-foreground">
            {application.hasImages ? "Larger gallery opens from here." : "No assets linked to this record."}
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={!application.hasImages} onClick={() => onViewImages(application)}>
          View all
        </Button>
      </div>

      {application.hasImages ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {previewImages.map((image) => (
            <button
              key={image}
              className="overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-primary/40"
              onClick={() => onViewImages(application)}
              type="button"
            >
              <img alt={image} className="h-24 w-full object-cover" loading="lazy" src={`/assets/${image}`} />
              <div className="truncate border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground">{image.split("/").pop()}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-card/60 px-3 py-6 text-center text-sm text-muted-foreground">
          Image scan has not linked any assets yet.
        </div>
      )}
    </div>
  );
}

function QueueToggle({ value, onChange }) {
  const options = [
    { value: "active", label: "Active" },
    { value: "all", label: "All" },
    { value: "reviewed", label: "Reviewed" },
  ];

  return (
    <div className="flex items-center rounded-lg border border-border bg-secondary p-1">
      {options.map((option) => (
        <button
          key={option.value}
          className={`rounded-md px-3 py-1.5 text-[11px] transition ${
            value === option.value ? "bg-background text-foreground" : "text-muted-foreground"
          }`}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function QueueMetric({ label, value }) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      className="rounded-xl border border-border bg-secondary/60 p-4 transition"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </motion.div>
  );
}

function FilterPill({ label }) {
  return (
    <div className="rounded-full border border-border bg-white/75 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
      {label}
    </div>
  );
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function StatusBadge({ value }) {
  if (value === "mismatch") return <Badge variant="warning">Mismatch</Badge>;
  if (value === "match") return <Badge variant="success">Match</Badge>;
  return <Badge variant="ghost">Unknown</Badge>;
}

function FraudBadge({ value }) {
  if (value === "yes") return <Badge variant="danger">Negligence</Badge>;
  if (value === "no") return <Badge variant="success">Clear</Badge>;
  return <Badge variant="ghost">Pending</Badge>;
}

function capitalize(value) {
  if (!value) return "";
  if (value === "yes") return "Negligence";
  if (value === "no") return "Clear";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
