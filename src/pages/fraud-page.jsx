import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Download, PauseCircle, PlayCircle, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function FraudPage({
  cvStatus,
  state,
  setState,
  rows,
  progress,
  running,
  controls,
  setControls,
  onRun,
  onStop,
  onClear,
  onExport,
  onDecision,
}) {
  const summaryRows = state.bucket === "all" ? state.allRows : state.allRows.filter((row) => row.bucket === state.bucket);
  const serialCount = state.allRows.filter((row) => row.bucket === "serial").length;
  const nonSerialCount = state.allRows.filter((row) => row.bucket === "nonserial").length;
  const reviewedCount = summaryRows.filter((row) => row.markedFraud === "yes" || row.markedFraud === "no").length;
  const pendingCount = summaryRows.filter((row) => row.markedFraud === "pending").length;
  const negligenceCount = summaryRows.filter((row) => row.markedFraud === "yes").length;
  const clearCount = summaryRows.filter((row) => row.markedFraud === "no").length;
  const reviewPercent = summaryRows.length ? (reviewedCount / summaryRows.length) * 100 : 0;
  const savingIds = new Set(state.savingIds || []);

  useEffect(() => {
    if (!state.restoredId) return;
    document.getElementById(`fraud-pair-${state.restoredId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [rows, state.restoredId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge variant="primary" className="mb-2 w-fit">
                Pair detector
              </Badge>
              <CardTitle className="text-base">Pair-only negligence review</CardTitle>
              <CardDescription>Old OpenCV logic, server assets, no grouped case mapping.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onRun} disabled={cvStatus !== "ready" || running}>
                <PlayCircle className="h-3.5 w-3.5" />
                Run detection
              </Button>
              <Button variant="outline" onClick={onStop} disabled={!running}>
                <PauseCircle className="h-3.5 w-3.5" />
                Stop
              </Button>
              <Button variant="outline" onClick={() => onExport("filtered")}>
                <Download className="h-3.5 w-3.5" />
                Export filtered
              </Button>
              <Button variant="outline" onClick={() => onExport("all")}>
                <Download className="h-3.5 w-3.5" />
                Export all
              </Button>
              <Button variant="outline" onClick={onClear}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear flags
              </Button>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-[1.2fr,repeat(3,minmax(0,0.7fr))]">
            <Input
              placeholder="Search app, beneficiary, sanction"
              value={state.search}
              onChange={(event) => setState((current) => ({ ...current, search: event.target.value }))}
            />
            <FilterSelect
              value={state.severity}
              onChange={(value) => setState((current) => ({ ...current, severity: value }))}
            >
              <option value="">All severities</option>
              <option value="high">High</option>
              <option value="medium">Suspicious</option>
            </FilterSelect>
            <FilterSelect
              value={state.markedFraud}
              onChange={(value) => setState((current) => ({ ...current, markedFraud: value }))}
            >
              <option value="pending">Pending only</option>
              <option value="">All decisions</option>
              <option value="yes">Negligence only</option>
              <option value="no">Clear only</option>
            </FilterSelect>
            <FilterSelect
              value={state.bucket}
              onChange={(value) => setState((current) => ({ ...current, bucket: value }))}
            >
              <option value="all">All buckets</option>
              <option value="serial">Serial pairs</option>
              <option value="nonserial">No-serial pairs</option>
            </FilterSelect>
          </div>

          <div className="grid gap-2 lg:grid-cols-3">
            <FilterSelect
              value={String(controls.resizeTo)}
              onChange={(value) => setControls((current) => ({ ...current, resizeTo: Number(value) }))}
            >
              <option value="500">Resize 500px</option>
              <option value="700">Resize 700px</option>
            </FilterSelect>
            <FilterSelect
              value={String(controls.maxFeatures)}
              onChange={(value) => setControls((current) => ({ ...current, maxFeatures: Number(value) }))}
            >
              <option value="400">400 features</option>
              <option value="800">800 features</option>
              <option value="1200">1200 features</option>
              <option value="1500">1500 features</option>
            </FilterSelect>
            <FilterSelect
              value={String(controls.gpsRadius)}
              onChange={(value) => setControls((current) => ({ ...current, gpsRadius: Number(value) }))}
            >
              <option value="30">GPS 30m</option>
              <option value="50">GPS 50m</option>
              <option value="100">GPS 100m</option>
            </FilterSelect>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress ? <ProgressPanel progress={progress} /> : null}
          <ReviewProgress
            total={summaryRows.length}
            reviewed={reviewedCount}
            pending={pendingCount}
            negligence={negligenceCount}
            cleared={clearCount}
            percent={reviewPercent}
            visible={rows.length}
            decisionFilter={state.markedFraud}
          />

          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Matched pairs" value={summaryRows.length} />
            <Metric label="Remaining queue" value={pendingCount} />
            <Metric label="Serial pairs" value={serialCount} />
            <Metric label="No-serial pairs" value={nonSerialCount} />
          </div>

          <Tabs value={state.bucket} onValueChange={(value) => setState((current) => ({ ...current, bucket: value }))}>
            <TabsList>
              <TabsTrigger value="all">All pairs</TabsTrigger>
              <TabsTrigger value="serial">Serial</TabsTrigger>
              <TabsTrigger value="nonserial">No serial</TabsTrigger>
            </TabsList>
            <TabsContent value={state.bucket} className="mt-4 space-y-3">
              {!rows.length ? (
                <div className="rounded-xl border border-dashed border-border bg-white/60 p-8 text-center text-sm text-muted-foreground">
                  No stored pair flags match the current filters.
                </div>
              ) : (
                rows.map((flag, index) => (
                  <motion.div
                    key={flag._id || `${flag.imageA}-${flag.imageB}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                  >
                    <PairCard
                      flag={flag}
                      onDecision={onDecision}
                      restored={state.restoredId === flag._id}
                      saving={savingIds.has(flag._id)}
                    />
                  </motion.div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function PairCard({ flag, onDecision, restored, saving }) {
  const severityVariant = flag.severity === "high" ? "danger" : "warning";
  return (
    <Card
      className={`overflow-hidden transition-all ${restored ? "ring-2 ring-danger/40 shadow-[0_0_0_6px_rgba(165,58,79,0.08)]" : ""}`}
      id={`fraud-pair-${flag._id}`}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={severityVariant}>{flag.severity === "high" ? "Confirmed negligence" : "Suspicious"}</Badge>
            <Badge variant="ghost">{flag.bucket}</Badge>
            <Badge variant="primary">{flag.score}%</Badge>
            <DecisionBadge value={flag.markedFraud} />
            {saving ? <Badge variant="warning">Saving...</Badge> : null}
            {restored ? <Badge variant="danger">Save failed</Badge> : null}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {flag.inliers} inliers · {flag.goodMatches} good · {flag.rawMatches} raw
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr,64px,1fr]">
          <ImagePanel
            title={flag.appIdA}
            subtitle={`${flag.sanctionA || "Unmapped"} · ${flag.beneficiaryA || "Unknown"}`}
            time={flag.timeA}
            gps={flag.gpsA}
            src={flag.imageUrlA || `/assets/${flag.imageA}`}
          />
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-secondary/60 py-4">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <div className="text-[10px] text-muted-foreground">{flag.gpsDist == null ? "No GPS" : `${Math.round(flag.gpsDist)}m`}</div>
          </div>
          <ImagePanel
            title={flag.appIdB}
            subtitle={`${flag.sanctionB || "Unmapped"} · ${flag.beneficiaryB || "Unknown"}`}
            time={flag.timeB}
            gps={flag.gpsB}
            src={flag.imageUrlB || `/assets/${flag.imageB}`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(flag.reasons || []).map((reason) => (
            <Badge key={reason} variant="ghost">
              {reason.replaceAll("_", " ")}
            </Badge>
          ))}
          {flag.homoValid ? <Badge variant="primary">valid homography</Badge> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="destructive" disabled={saving} onClick={() => onDecision(flag._id, "yes")}>
            Mark negligence
          </Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => onDecision(flag._id, "no")}>
            Mark clear
          </Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => onDecision(flag._id, "pending")}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImagePanel({ title, subtitle, time, gps, src }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/50">
      <img alt={title} className="h-60 w-full object-cover" loading="lazy" src={src} />
      <div className="space-y-1 border-t border-border px-3 py-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        <div className="text-[10px] text-muted-foreground">
          {gps ? `GPS ${gps[0].toFixed(5)}, ${gps[1].toFixed(5)}` : "GPS none"}
        </div>
        <div className="text-[10px] text-muted-foreground">{time || "Time unknown"}</div>
      </div>
    </div>
  );
}

function ProgressPanel({ progress }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{progress.phase}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {progress.imagesLoaded} images · {progress.pairsDone} pairs · {progress.flagsFound} flags
          </div>
        </div>
        <div className="text-sm font-medium text-primary">{Math.round(progress.percent)}%</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#d9e4f2]">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(progress.percent)}%` }} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">ETA {progress.eta}</div>
    </div>
  );
}

function ReviewProgress({ total, reviewed, pending, negligence, cleared, percent, visible, decisionFilter }) {
  const visibleLabel =
    decisionFilter === "pending"
      ? `${pending} remaining in queue`
      : decisionFilter === "yes"
        ? `${visible} negligence pairs visible`
        : decisionFilter === "no"
          ? `${visible} clear pairs visible`
          : `${visible} pairs visible`;
  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Review completion</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {reviewed} reviewed of {total} matched pairs
            {total ? ` · ${visibleLabel}` : ""}
          </div>
        </div>
        <div className="text-sm font-medium text-primary">{Math.round(percent)}%</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#d9e4f2]">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(percent)}%` }} />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <ReviewStat label="Reviewed" value={reviewed} tone="primary" />
        <ReviewStat label="Pending" value={pending} tone="muted" />
        <ReviewStat label="Negligence" value={negligence} tone="danger" />
        <ReviewStat label="Clear" value={cleared} tone="success" />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function DecisionBadge({ value }) {
  if (value === "yes") return <Badge variant="danger">Negligence</Badge>;
  if (value === "no") return <Badge variant="success">Clear</Badge>;
  return <Badge variant="ghost">Pending</Badge>;
}

function ReviewStat({ label, value, tone }) {
  const tones = {
    primary: "bg-[#edf4ff] text-[#214a8a]",
    muted: "bg-[#eef2f7] text-[#5b6a7d]",
    danger: "bg-[#fff0f3] text-[#a53a4f]",
    success: "bg-[#edf9f2] text-[#25734e]",
  };

  return (
    <div className="rounded-lg border border-border/80 bg-white/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-sm font-semibold">{value}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{label}</span>
      </div>
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
