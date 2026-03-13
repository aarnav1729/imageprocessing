import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronsLeft, ChevronsRight, FileSpreadsheet, FolderSearch2, ImageIcon, LayoutDashboard, ShieldAlert, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { runPairFraudDetection } from "@/lib/fraud-engine";
import { cn, downloadBlob, formatDate, toCsv } from "@/lib/utils";

const DashboardPage = lazy(() => import("@/pages/dashboard-page"));
const SanctionsPage = lazy(() => import("@/pages/sanctions-page"));
const ApplicationsPage = lazy(() => import("@/pages/applications-page"));
const FraudEntriesPage = lazy(() => import("@/pages/fraud-entries-page"));
const FraudPage = lazy(() => import("@/pages/fraud-page"));
const AssetsPage = lazy(() => import("@/pages/assets-page"));

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", hint: "Overview", icon: LayoutDashboard },
  { id: "sanctions", label: "Sanctions", hint: "Intake", icon: FileSpreadsheet },
  { id: "applications", label: "Applications", hint: "Queue", icon: FolderSearch2 },
  { id: "fraud-entries", label: "Negligence Entries", hint: "Confirmed pairs", icon: ShieldX },
  { id: "fraud", label: "Negligence", hint: "Pair review", icon: ShieldAlert },
  { id: "assets", label: "Assets", hint: "Health", icon: ImageIcon },
];

const INITIAL_STATS = {
  sanctions: 0,
  totalApps: 0,
  matchApps: 0,
  mismatchApps: 0,
  totalFlags: 0,
  confirmedFraud: 0,
  pendingReview: 0,
  appsWithImages: 0,
  rectCount: 0,
};

function buildApplicationParams(state, search) {
  const params = new URLSearchParams({
    queue: state.queue,
    page: String(state.page),
    limit: "50",
  });
  if (search) params.set("search", search);
  if (state.sanctionId) params.set("sanctionId", state.sanctionId);
  if (state.status) params.set("status", state.status);
  if (state.fraudMarked) params.set("fraudMarked", state.fraudMarked);
  if (state.hasImages) params.set("hasImages", state.hasImages);
  return params;
}

function buildFraudParams(state, search) {
  const params = new URLSearchParams();
  if (state.markedFraud) params.set("markedFraud", state.markedFraud);
  if (state.severity) params.set("severity", state.severity);
  if (search) params.set("search", search);
  return params;
}

function buildFlaggedEntryParams(state, search) {
  const params = new URLSearchParams({ markedFraud: "yes" });
  if (state.severity) params.set("severity", state.severity);
  if (search) params.set("search", search);
  return params;
}

async function apiJson(path, options) {
  const response = await fetch(path, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function statusVariant(status) {
  if (status === "ready") return "success";
  if (status === "error") return "danger";
  return "warning";
}

function OpenCvBadge({ status }) {
  const label = status === "ready" ? "OpenCV ready" : status === "error" ? "OpenCV failed" : "OpenCV loading";
  return <Badge variant={statusVariant(status)}>{label}</Badge>;
}

function DbBadge({ status }) {
  const label = status === "ready" ? "API connected" : status === "error" ? "Server offline" : "Checking API";
  return <Badge variant={statusVariant(status)}>{label}</Badge>;
}

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("pg.sidebar") === "collapsed");
  const [dbStatus, setDbStatus] = useState("checking");
  const [cvStatus, setCvStatus] = useState("loading");
  const [stats, setStats] = useState(INITIAL_STATS);
  const [sanctions, setSanctions] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [appState, setAppState] = useState({
    queue: "active",
    page: 1,
    pages: 0,
    total: 0,
    rows: [],
    loading: false,
    search: "",
    sanctionId: "",
    status: "",
    fraudMarked: "",
    hasImages: "",
  });
  const [flaggedEntryState, setFlaggedEntryState] = useState({
    rows: [],
    loading: false,
    search: "",
    severity: "",
    bucket: "all",
    pairLeft: "",
    pairRight: "",
  });
  const [fraudState, setFraudState] = useState({
    rows: [],
    loading: false,
    search: "",
    severity: "",
    markedFraud: "pending",
    bucket: "all",
  });
  const [fraudControls, setFraudControls] = useState({
    maxFeatures: 800,
    gpsRadius: 50,
    resizeTo: 500,
  });
  const [fraudProgress, setFraudProgress] = useState(null);
  const [fraudRunning, setFraudRunning] = useState(false);
  const [assetScan, setAssetScan] = useState({ loading: false, data: null });
  const [imageDialog, setImageDialog] = useState({ open: false, title: "", images: [] });
  const [rectifyDialog, setRectifyDialog] = useState({
    open: false,
    application: null,
    loading: false,
    submitting: false,
    comment: "",
    attachment: null,
    items: [],
  });
  const stopScanRef = useRef(false);

  const deferredAppSearch = useDeferredValue(appState.search);
  const deferredFlaggedSearch = useDeferredValue(flaggedEntryState.search);
  const deferredFraudSearch = useDeferredValue(fraudState.search);

  function filterFlaggedPairRows(rows, state) {
    const left = state.pairLeft.trim().toLowerCase();
    const right = state.pairRight.trim().toLowerCase();

    return rows.filter((row) => {
      if (state.bucket !== "all" && row.bucket !== state.bucket) return false;

      const appA = String(row.appIdA || "").toLowerCase();
      const appB = String(row.appIdB || "").toLowerCase();

      if (left && right) {
        const direct = appA.includes(left) && appB.includes(right);
        const reverse = appA.includes(right) && appB.includes(left);
        return direct || reverse;
      }

      if (left) return appA.includes(left) || appB.includes(left);
      if (right) return appA.includes(right) || appB.includes(right);
      return true;
    });
  }

  useEffect(() => {
    localStorage.setItem("pg.sidebar", sidebarCollapsed ? "collapsed" : "open");
  }, [sidebarCollapsed]);

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      try {
        await apiJson("/api/stats");
        if (cancelled) return;
        setDbStatus("ready");
      } catch {
        if (cancelled) return;
        setDbStatus("error");
      }
    }

    checkConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    function markReady() {
      if (!cancelled) setCvStatus("ready");
    }

    if (window.cv?.getBuildInformation) {
      markReady();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector('script[data-opencv="true"]');
    const onLoad = () => {
      if (window.cv?.getBuildInformation) markReady();
      else if (window.cv) window.cv.onRuntimeInitialized = markReady;
    };
    const onError = () => {
      if (!cancelled) setCvStatus("error");
    };

    if (existing) {
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      onLoad();
      return () => {
        cancelled = true;
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
      };
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;
    script.dataset.opencv = "true";
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    if (dbStatus !== "ready") {
      setDashboardLoading(false);
      return;
    }

    let cancelled = false;
    setDashboardLoading(true);

    async function loadMeta() {
      try {
        const [statsData, sanctionsData] = await Promise.all([apiJson("/api/stats"), apiJson("/api/sanctions")]);
        if (cancelled) return;
        setStats(statsData);
        setSanctions(sanctionsData);
      } catch {
        if (!cancelled) setDbStatus("error");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [dbStatus]);

  useEffect(() => {
    if (dbStatus !== "ready") return;
    let cancelled = false;

    async function loadApplications() {
      setAppState((current) => ({ ...current, loading: true }));
      try {
        const params = buildApplicationParams(appState, deferredAppSearch.trim());
        const data = await apiJson(`/api/applications?${params.toString()}`);
        if (cancelled) return;
        setAppState((current) => ({
          ...current,
          rows: data.applications,
          total: data.total,
          pages: data.pages,
          page: data.page,
          loading: false,
        }));
      } catch {
        if (!cancelled) {
          setAppState((current) => ({ ...current, rows: [], total: 0, pages: 0, loading: false }));
          setDbStatus("error");
        }
      }
    }

    loadApplications();
    return () => {
      cancelled = true;
    };
  }, [
    dbStatus,
    appState.page,
    appState.queue,
    appState.sanctionId,
    appState.status,
    appState.fraudMarked,
    appState.hasImages,
    deferredAppSearch,
  ]);

  useEffect(() => {
    if (dbStatus !== "ready") return;
    let cancelled = false;

    async function loadFlaggedEntries() {
      setFlaggedEntryState((current) => ({ ...current, loading: true }));
      try {
        const params = buildFlaggedEntryParams(flaggedEntryState, deferredFlaggedSearch.trim());
        const rows = await apiJson(`/api/fraud-flags?${params.toString()}`);
        if (cancelled) return;
        setFlaggedEntryState((current) => ({
          ...current,
          rows,
          loading: false,
        }));
      } catch {
        if (!cancelled) {
          setFlaggedEntryState((current) => ({ ...current, rows: [], loading: false }));
          setDbStatus("error");
        }
      }
    }

    loadFlaggedEntries();
    return () => {
      cancelled = true;
    };
  }, [dbStatus, flaggedEntryState.severity, deferredFlaggedSearch]);

  useEffect(() => {
    if (dbStatus !== "ready") return;
    let cancelled = false;

    async function loadFraudFlags() {
      setFraudState((current) => ({ ...current, loading: true }));
      try {
        const params = buildFraudParams(fraudState, deferredFraudSearch.trim());
        const flags = await apiJson(`/api/fraud-flags?${params.toString()}`);
        if (cancelled) return;
        setFraudState((current) => ({ ...current, rows: flags, loading: false }));
      } catch {
        if (!cancelled) {
          setFraudState((current) => ({ ...current, rows: [], loading: false }));
          setDbStatus("error");
        }
      }
    }

    loadFraudFlags();
    return () => {
      cancelled = true;
    };
  }, [dbStatus, fraudState.markedFraud, fraudState.severity, deferredFraudSearch]);

  async function refreshMeta() {
    if (dbStatus !== "ready") return;
    const [statsData, sanctionsData] = await Promise.all([apiJson("/api/stats"), apiJson("/api/sanctions")]);
    setStats(statsData);
    setSanctions(sanctionsData);
  }

  async function refreshApplications() {
    const params = buildApplicationParams(appState, deferredAppSearch.trim());
    const data = await apiJson(`/api/applications?${params.toString()}`);
    setAppState((current) => ({
      ...current,
      rows: data.applications,
      total: data.total,
      pages: data.pages,
      page: data.page,
      loading: false,
    }));
  }

  async function refreshFlaggedEntries() {
    const params = buildFlaggedEntryParams(flaggedEntryState, deferredFlaggedSearch.trim());
    const rows = await apiJson(`/api/fraud-flags?${params.toString()}`);
    setFlaggedEntryState((current) => ({
      ...current,
      rows,
      loading: false,
    }));
  }

  async function refreshFlaggedEntriesForState(nextState) {
    const params = buildFlaggedEntryParams(nextState, String(nextState.search || "").trim());
    const rows = await apiJson(`/api/fraud-flags?${params.toString()}`);
    setFlaggedEntryState((current) => ({
      ...current,
      ...nextState,
      rows,
      loading: false,
    }));
  }

  async function refreshFraud() {
    const params = buildFraudParams(fraudState, deferredFraudSearch.trim());
    const flags = await apiJson(`/api/fraud-flags?${params.toString()}`);
    setFraudState((current) => ({ ...current, rows: flags, loading: false }));
  }

  async function handleSanctionUpload(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    for (const file of list) {
      const form = new FormData();
      form.append("file", file);
      await apiJson("/api/upload-sanction", { method: "POST", body: form });
    }
    await Promise.all([refreshMeta(), refreshApplications(), refreshFlaggedEntries()]);
    setActiveView("sanctions");
  }

  async function handleDeleteSanction(id) {
    await apiJson(`/api/sanctions/${id}`, { method: "DELETE" });
    await Promise.all([refreshMeta(), refreshApplications(), refreshFlaggedEntries()]);
  }

  function openImages(application) {
    setImageDialog({
      open: true,
      title: application.applicationNo,
      images: (application.images || []).map((path) => ({ src: `/assets/${path}`, label: path.split("/").pop() })),
    });
  }

  async function openRectify(application) {
    setRectifyDialog({
      open: true,
      application,
      loading: true,
      submitting: false,
      comment: "",
      attachment: null,
      items: [],
    });
    const items = await apiJson(`/api/rectifications/${application.applicationNo}`);
    setRectifyDialog((current) => ({ ...current, items, loading: false }));
  }

  async function submitRectification() {
    if (!rectifyDialog.application || !rectifyDialog.attachment) return;
    setRectifyDialog((current) => ({ ...current, submitting: true }));
    const form = new FormData();
    form.append("comment", rectifyDialog.comment);
    form.append("attachment", rectifyDialog.attachment);
    await apiJson(`/api/rectify/${rectifyDialog.application._id}`, {
      method: "POST",
      body: form,
    });
    const items = await apiJson(`/api/rectifications/${rectifyDialog.application.applicationNo}`);
    setRectifyDialog((current) => ({
      ...current,
      items,
      submitting: false,
      comment: "",
      attachment: null,
    }));
    await refreshMeta();
  }

  async function handleApplicationExport(mode) {
    const exportState =
      mode === "all"
        ? { ...appState, queue: "all", page: 1, search: "", sanctionId: "", status: "", fraudMarked: "", hasImages: "" }
        : { ...appState, page: 1 };
    const params = buildApplicationParams(exportState, mode === "all" ? "" : deferredAppSearch.trim());
    params.set("limit", "5000");
    const data = await apiJson(`/api/applications?${params.toString()}`);
    const rows = data.applications.map((application) => ({
      applicationNo: application.applicationNo,
      beneficiary: application.beneficiaryName,
      sanction: application.sanctionName,
      status: application.status,
      fraudMarked: application.fraudMarked,
      hasImages: application.hasImages,
      remarks: application.remarks || "",
    }));
    downloadBlob(
      mode === "all" ? "applications-all.csv" : "applications-filtered.csv",
      toCsv(rows),
      "text/csv"
    );
  }

  async function handleFlaggedEntryExport(mode) {
    const rows =
      mode === "all"
        ? await apiJson("/api/fraud-flags?markedFraud=yes")
        : visibleFlaggedEntryRows;
    const filteredRows = mode === "all" ? rows : filterFlaggedPairRows(rows, flaggedEntryState);
    const csvRows = filteredRows.map((flag) => ({
      severity: flag.severity,
      decision: flag.markedFraud,
      score: flag.score,
      appIdA: flag.appIdA,
      appIdB: flag.appIdB,
      sanctionA: flag.sanctionA,
      sanctionB: flag.sanctionB,
      beneficiaryA: flag.beneficiaryA,
      beneficiaryB: flag.beneficiaryB,
      bucket: flag.bucket,
      gpsDist: flag.gpsDist == null ? "" : Math.round(flag.gpsDist),
      inliers: flag.inliers,
      goodMatches: flag.goodMatches,
      reasons: (flag.reasons || []).join(";"),
      imageA: flag.imageA,
      imageB: flag.imageB,
    }));
    downloadBlob(
      mode === "all" ? "negligence-pairs-all.csv" : "negligence-pairs-filtered.csv",
      toCsv(csvRows),
      "text/csv"
    );
  }

  const visibleFlaggedEntryRows = useMemo(() => {
    return filterFlaggedPairRows(flaggedEntryState.rows, flaggedEntryState);
  }, [
    flaggedEntryState.rows,
    flaggedEntryState.bucket,
    flaggedEntryState.pairLeft,
    flaggedEntryState.pairRight,
  ]);

  const visibleFraudRows = useMemo(() => {
    return fraudState.rows.filter((row) => {
      if (fraudState.bucket === "all") return true;
      return row.bucket === fraudState.bucket;
    });
  }, [fraudState.rows, fraudState.bucket]);

  async function handleFraudExport(mode) {
    let rows;
    if (mode === "all") {
      rows = await apiJson("/api/fraud-flags");
    } else {
      rows = visibleFraudRows;
    }
    const csvRows = rows.map((flag) => ({
      severity: flag.severity,
      decision: flag.markedFraud,
      score: flag.score,
      appIdA: flag.appIdA,
      appIdB: flag.appIdB,
      sanctionA: flag.sanctionA,
      sanctionB: flag.sanctionB,
      beneficiaryA: flag.beneficiaryA,
      beneficiaryB: flag.beneficiaryB,
      bucket: flag.bucket,
      gpsDist: flag.gpsDist == null ? "" : Math.round(flag.gpsDist),
      inliers: flag.inliers,
      goodMatches: flag.goodMatches,
      reasons: (flag.reasons || []).join(";"),
      imageA: flag.imageA,
      imageB: flag.imageB,
    }));
    downloadBlob(mode === "all" ? "negligence-all.csv" : "negligence-filtered.csv", toCsv(csvRows), "text/csv");
  }

  async function handleFlagDecision(id, decision) {
    await apiJson(`/api/fraud-flags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markedFraud: decision }),
    });
    await Promise.all([refreshFraud(), refreshApplications(), refreshFlaggedEntries(), refreshMeta()]);
  }

  async function handleCreateFlaggedPair(payload) {
    const result = await apiJson("/api/fraud-flags/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const nextState = {
      ...flaggedEntryState,
      search: "",
      severity: "",
      bucket: "all",
      pairLeft: payload.appNoA,
      pairRight: payload.appNoB,
    };

    await Promise.all([
      refreshFraud(),
      refreshApplications(),
      refreshFlaggedEntriesForState(nextState),
      refreshMeta(),
    ]);

    return result;
  }

  async function handleClearFraudFlags() {
    await apiJson("/api/fraud-flags", { method: "DELETE" });
    await Promise.all([refreshFraud(), refreshApplications(), refreshFlaggedEntries(), refreshMeta()]);
  }

  async function handleRunFraud() {
    if (cvStatus !== "ready" || fraudRunning) return;
    stopScanRef.current = false;
    setFraudRunning(true);
    setFraudProgress({
      phase: "Preparing scan",
      percent: 0,
      imagesLoaded: 0,
      pairsDone: 0,
      flagsFound: 0,
      eta: "—",
    });
    try {
      const imageEntries = await apiJson("/api/all-image-list");
      const result = await runPairFraudDetection({
        imageEntries,
        maxFeatures: fraudControls.maxFeatures,
        gpsRadius: fraudControls.gpsRadius,
        resizeTo: fraudControls.resizeTo,
        onProgress: setFraudProgress,
        shouldStop: () => stopScanRef.current,
      });

      if (result.flags.length) {
        await apiJson("/api/fraud-flags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flags: result.flags, clearAll: true }),
        });
      } else {
        await apiJson("/api/fraud-flags", { method: "DELETE" });
      }
      await Promise.all([refreshFraud(), refreshApplications(), refreshFlaggedEntries(), refreshMeta()]);
      setActiveView("fraud");
    } catch (error) {
      if (error.message !== "SCAN_STOPPED") {
        // no-op: keep progress state visible for user context
      }
    } finally {
      setFraudRunning(false);
    }
  }

  async function handleScanAssets() {
    setAssetScan({ loading: true, data: assetScan.data });
    try {
      const data = await apiJson("/api/scan-assets");
      setAssetScan({ loading: false, data });
      await Promise.all([refreshApplications(), refreshFlaggedEntries(), refreshMeta()]);
    } catch {
      setAssetScan({ loading: false, data: null });
      setDbStatus("error");
    }
  }

  const currentPage = useMemo(() => {
    const commonProps = {
      sanctions,
      stats,
      loading: dashboardLoading,
    };

    switch (activeView) {
      case "sanctions":
        return (
          <SanctionsPage
            sanctions={sanctions}
            onUpload={handleSanctionUpload}
            onDelete={handleDeleteSanction}
          />
        );
      case "applications":
        return (
          <ApplicationsPage
            sanctions={sanctions}
            state={appState}
            setState={setAppState}
            onViewImages={openImages}
            onRectify={openRectify}
            onExport={handleApplicationExport}
          />
        );
      case "fraud-entries":
        return (
          <FraudEntriesPage
            state={flaggedEntryState}
            setState={setFlaggedEntryState}
            rows={visibleFlaggedEntryRows}
            onExport={handleFlaggedEntryExport}
            onDecision={handleFlagDecision}
            onCreatePair={handleCreateFlaggedPair}
          />
        );
      case "fraud":
        return (
          <FraudPage
            cvStatus={cvStatus}
            state={fraudState}
            setState={setFraudState}
            rows={visibleFraudRows}
            progress={fraudProgress}
            running={fraudRunning}
            controls={fraudControls}
            setControls={setFraudControls}
            onRun={handleRunFraud}
            onStop={() => {
              stopScanRef.current = true;
            }}
            onClear={handleClearFraudFlags}
            onExport={handleFraudExport}
            onDecision={handleFlagDecision}
          />
        );
      case "assets":
        return <AssetsPage scanState={assetScan} onScan={handleScanAssets} />;
      default:
        return <DashboardPage {...commonProps} onNavigate={setActiveView} />;
    }
  }, [
    activeView,
    sanctions,
    stats,
    dashboardLoading,
    appState,
    flaggedEntryState,
    cvStatus,
    fraudState,
    visibleFlaggedEntryRows,
    visibleFraudRows,
    fraudProgress,
    fraudRunning,
    fraudControls,
    assetScan,
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 panel-grid opacity-30" />
      <div className="relative flex min-h-screen">
        <aside
          className={cn(
            "hidden border-r border-border/80 bg-white/90 px-3 py-4 backdrop-blur xl:flex xl:flex-col",
            sidebarCollapsed ? "w-[76px]" : "w-[240px]"
          )}
        >
          <div className="mb-4 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-[#f3f7fc] text-sm font-semibold text-[#173459]">
              PG
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Ops Console</div>
                <div className="text-sm font-semibold">PanelGuard</div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <motion.button
                  key={item.id}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                    active
                      ? "border-[#c7daf7] bg-[#edf4ff] text-[#15335f]"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground">{item.hint}</div>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-auto space-y-3 px-2">
            {!sidebarCollapsed && (
              <div className="rounded-xl border border-border/70 bg-secondary/70 p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Queue model</div>
                <div className="mt-1 text-xs text-foreground">Negligence review is now pair-based again. Active applications stay clean.</div>
              </div>
            )}
            <Button
              variant="outline"
              size="icon"
              className="w-full rounded-xl"
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Negligence Operations</div>
                <div className="mt-1 text-sm font-semibold">
                  {NAV_ITEMS.find((item) => item.id === activeView)?.label || "PanelGuard"}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <DbBadge status={dbStatus} />
                <OpenCvBadge status={cvStatus} />
              </div>
            </div>
            {dbStatus === "error" && (
              <div className="border-t border-[#efcfd6] bg-[#fff3f5] px-4 py-2 text-xs text-[#9f3c50]">
                <div className="mx-auto flex max-w-[1600px] items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Server connection failed. Start `node server.cjs` before using the console.</span>
                </div>
              </div>
            )}
          </header>

          <div className="mx-auto max-w-[1600px] px-4 py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <Suspense fallback={<PageFallback />}>{currentPage}</Suspense>
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 pb-5 pt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span>PanelGuard</span>
            <span>Server-backed review</span>
            <span>Pair-based negligence mapping</span>
          </footer>
        </main>
      </div>

      <Dialog open={imageDialog.open} onOpenChange={(open) => setImageDialog((current) => ({ ...current, open }))}>
        <DialogContent className="max-h-[88vh] overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>Application Images · {imageDialog.title}</DialogTitle>
            <DialogDescription>Lazy-loaded assets linked to the selected application.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {imageDialog.images.map((image) => (
                <div key={image.src} className="overflow-hidden rounded-xl border border-border bg-secondary">
                  <img alt={image.label} className="h-48 w-full object-cover" loading="lazy" src={image.src} />
                  <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">{image.label}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={rectifyDialog.open} onOpenChange={(open) => setRectifyDialog((current) => ({ ...current, open }))}>
        <DialogContent className="max-h-[88vh] overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>
              Rectification · {rectifyDialog.application?.applicationNo || ""}
            </DialogTitle>
            <DialogDescription>Upload supporting material without leaving the queue.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-4 lg:grid-cols-[320px,1fr]">
            <div className="space-y-3 rounded-xl border border-border bg-secondary/70 p-3">
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                {rectifyDialog.application?.beneficiaryName || "Selected application"}
              </div>
              <Textarea
                placeholder="Rectification note"
                value={rectifyDialog.comment}
                onChange={(event) =>
                  setRectifyDialog((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
              />
              <Input
                type="file"
                onChange={(event) =>
                  setRectifyDialog((current) => ({
                    ...current,
                    attachment: event.target.files?.[0] || null,
                  }))
                }
              />
              <Button className="w-full" disabled={!rectifyDialog.attachment || rectifyDialog.submitting} onClick={submitRectification}>
                {rectifyDialog.submitting ? "Submitting..." : "Submit rectification"}
              </Button>
            </div>
            <ScrollArea className="max-h-[60vh] rounded-xl border border-border bg-secondary/50 p-3">
              <div className="space-y-3">
                {rectifyDialog.loading && <div className="text-xs text-muted-foreground">Loading evidence…</div>}
                {!rectifyDialog.loading && !rectifyDialog.items.length && (
                  <div className="text-xs text-muted-foreground">No rectifications yet.</div>
                )}
                {rectifyDialog.items.map((item) => (
                  <div key={item._id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium">{item.attachmentName}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDate(item.submittedAt)}</div>
                    </div>
                    {item.comment ? <div className="mt-2 text-xs text-muted-foreground">{item.comment}</div> : null}
                    <a
                      className="mt-3 inline-flex text-xs text-primary hover:underline"
                      href={`/rectifications/${item.attachmentPath}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open attachment
                    </a>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-card">
      Loading workspace…
    </div>
  );
}
