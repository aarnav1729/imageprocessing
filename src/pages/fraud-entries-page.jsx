import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function createManualSideState() {
  return {
    query: "",
    loading: false,
    error: "",
    application: null,
    images: [],
    selectedImage: "",
  };
}

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

export default function FraudEntriesPage({ state, setState, rows, onExport, onDecision, onCreatePair }) {
  const [createOpen, setCreateOpen] = useState(false);
  const serialCount = state.rows.filter((row) => row.bucket === "serial").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge variant="danger" className="mb-2 w-fit">
                Confirmed negligence
              </Badge>
              <CardTitle className="text-base">Confirmed negligence pairs</CardTitle>
              <CardDescription>Reviewed pairs stay here. Manual creation uses asset previews before save.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Create pair
              </Button>
              <Button size="sm" variant="outline" onClick={() => onExport("filtered")}>
                <Download className="h-3.5 w-3.5" />
                Export filtered
              </Button>
              <Button size="sm" variant="outline" onClick={() => onExport("all")}>
                <Download className="h-3.5 w-3.5" />
                Export all
              </Button>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-[1.3fr,repeat(2,minmax(0,0.8fr))]">
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
              value={state.bucket}
              onChange={(value) => setState((current) => ({ ...current, bucket: value }))}
            >
              <option value="all">All buckets</option>
              <option value="serial">Serial pairs</option>
              <option value="nonserial">No-serial pairs</option>
            </FilterSelect>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            <Input
              placeholder="Pair side A"
              value={state.pairLeft}
              onChange={(event) => setState((current) => ({ ...current, pairLeft: event.target.value }))}
            />
            <Input
              placeholder="Pair side B"
              value={state.pairRight}
              onChange={(event) => setState((current) => ({ ...current, pairRight: event.target.value }))}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Confirmed pairs" value={state.rows.length} />
            <Metric label="Visible pairs" value={rows.length} />
            <Metric label="Serial pairs" value={state.bucket === "nonserial" ? 0 : serialCount} />
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
                  No confirmed negligence pairs match the current filters.
                </div>
              ) : (
                rows.map((flag, index) => (
                  <motion.div
                    key={flag._id || `${flag.imageA}-${flag.imageB}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                  >
                    <ConfirmedPairCard flag={flag} onDecision={onDecision} />
                  </motion.div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ManualPairDialog open={createOpen} onOpenChange={setCreateOpen} onCreatePair={onCreatePair} />
    </div>
  );
}

function ConfirmedPairCard({ flag, onDecision }) {
  const severityVariant = flag.severity === "high" ? "danger" : "warning";
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="danger">Negligence</Badge>
            <Badge variant={severityVariant}>{flag.severity === "high" ? "High confidence" : "Suspicious confidence"}</Badge>
            <Badge variant="ghost">{flag.bucket}</Badge>
            <Badge variant="primary">{flag.score}%</Badge>
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
          <Button size="sm" variant="outline" onClick={() => onDecision(flag._id, "no")}>
            Mark clear
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecision(flag._id, "pending")}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualPairDialog({ open, onOpenChange, onCreatePair }) {
  const [sideA, setSideA] = useState(createManualSideState);
  const [sideB, setSideB] = useState(createManualSideState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (open) return;
    setSideA(createManualSideState());
    setSideB(createManualSideState());
    setSubmitting(false);
    setSubmitError("");
  }, [open]);

  async function loadSide(side, setSide) {
    const query = side.query.trim();
    if (!query) {
      setSide((current) => ({ ...current, error: "Enter an application number" }));
      return;
    }

    setSide((current) => ({
      ...current,
      loading: true,
      error: "",
      application: null,
      images: [],
      selectedImage: "",
    }));

    try {
      const data = await fetchJson(`/api/applications/by-number/${encodeURIComponent(query)}`);
      const images = Array.isArray(data?.images) ? data.images : [];
      if (!images.length) {
        setSide((current) => ({
          ...current,
          loading: false,
          application: data.application || null,
          error: "No assets found for this application",
        }));
        return;
      }

      setSide((current) => ({
        ...current,
        loading: false,
        application: data.application || null,
        images,
        selectedImage: images[0],
      }));
    } catch (error) {
      setSide((current) => ({
        ...current,
        loading: false,
        error: error.message,
        application: null,
        images: [],
        selectedImage: "",
      }));
    }
  }

  async function submitPair() {
    if (!sideA.application || !sideB.application || !sideA.selectedImage || !sideB.selectedImage) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      await onCreatePair({
        appNoA: sideA.application.applicationNo,
        appNoB: sideB.application.applicationNo,
        imageA: sideA.selectedImage,
        imageB: sideB.selectedImage,
      });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function swapSides() {
    setSideA(sideB);
    setSideB(sideA);
  }

  const readyToSubmit =
    Boolean(sideA.application) &&
    Boolean(sideB.application) &&
    Boolean(sideA.selectedImage) &&
    Boolean(sideB.selectedImage) &&
    !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1180px)] flex-col overflow-hidden p-0">
        <DialogHeader className="gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>Create negligence pair</DialogTitle>
              <DialogDescription>Load two applications, preview their asset images, choose one image per side, then save.</DialogDescription>
            </div>
            <Button size="sm" variant="outline" type="button" onClick={swapSides}>
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Swap
            </Button>
          </div>
        </DialogHeader>

        <div className="grid flex-1 gap-4 overflow-auto p-4 lg:grid-cols-2">
          <ManualPairSide
            label="Side A"
            side={sideA}
            setSide={setSideA}
            onLoad={() => loadSide(sideA, setSideA)}
          />
          <ManualPairSide
            label="Side B"
            side={sideB}
            setSide={setSideB}
            onLoad={() => loadSide(sideB, setSideB)}
          />
        </div>

        <div className="border-t border-border bg-secondary/30 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">Submission</div>
              <div className="text-[11px] text-muted-foreground">
                Saving creates or updates the pair, marks it as negligence, and pushes it into this confirmed list immediately.
              </div>
              {submitError ? <div className="text-[11px] text-destructive">{submitError}</div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" type="button" disabled={!readyToSubmit} onClick={submitPair}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {submitting ? "Saving" : "Create pair"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManualPairSide({ label, side, setSide, onLoad }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-foreground">{label}</div>
            <div className="text-[11px] text-muted-foreground">Search an application number and load its asset folder.</div>
          </div>
          {side.application ? <Badge variant="success">Loaded</Badge> : <Badge variant="ghost">Idle</Badge>}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Application number"
            value={side.query}
            onChange={(event) =>
              setSide({
                ...createManualSideState(),
                query: event.target.value,
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onLoad();
              }
            }}
          />
          <Button size="sm" type="button" variant="outline" disabled={side.loading} onClick={onLoad}>
            {side.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Load
          </Button>
        </div>

        {side.error ? <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">{side.error}</div> : null}

        {side.application ? (
          <div className="rounded-lg border border-border bg-secondary/35 px-3 py-2">
            <div className="text-sm font-medium text-foreground">{side.application.applicationNo}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{side.application.beneficiaryName || "No beneficiary"}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{side.application.sanctionName || "No sanction"}</div>
          </div>
        ) : null}

        <div className="grid max-h-[360px] gap-3 overflow-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {side.images.map((image) => {
            const selected = side.selectedImage === image;
            return (
              <button
                key={image}
                className={cn(
                  "overflow-hidden rounded-lg border text-left transition",
                  selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                )}
                type="button"
                onClick={() => setSide((current) => ({ ...current, selectedImage: image }))}
              >
                <img alt={image} className="h-28 w-full object-cover" loading="lazy" src={`/assets/${image}`} />
                <div className="space-y-1 border-t border-border px-2.5 py-2">
                  <div className="truncate text-[11px] font-medium text-foreground">{image.split("/").pop()}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{image}</div>
                </div>
              </button>
            );
          })}
          {!side.loading && !side.images.length ? (
            <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-6 text-center text-[11px] text-muted-foreground md:col-span-2 xl:col-span-3">
              No preview loaded yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ImagePanel({ title, subtitle, time, gps, src }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/50">
      <img alt={title} className="h-60 w-full object-cover" loading="lazy" src={src} />
      <div className="space-y-1 border-t border-border px-3 py-2">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        <div className="text-[10px] text-muted-foreground">
          {gps ? `GPS ${gps[0].toFixed(5)}, ${gps[1].toFixed(5)}` : "GPS none"}
        </div>
        <div className="text-[10px] text-muted-foreground">{time || "Time unknown"}</div>
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

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
