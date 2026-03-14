import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BookOpen, CheckCircle2, ChevronsLeft, ChevronsRight, FileSpreadsheet, FolderSearch2, ImageIcon, LayoutDashboard, ShieldAlert, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import TutorialMode from "@/components/tutorial-mode";
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
    limit: String(state.limit || 100),
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
  params.set("limit", "5000");
  if (state.markedFraud) params.set("markedFraud", state.markedFraud);
  if (state.severity) params.set("severity", state.severity);
  if (search) params.set("search", search);
  return params;
}

function buildFlaggedEntryParams(state, search) {
  const params = new URLSearchParams({ markedFraud: "yes", limit: "5000" });
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
    limit: 100,
    pages: 0,
    total: 0,
    rows: [],
    loading: false,
    search: "",
    sanctionId: "",
    status: "mismatch",
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
    allRows: [],
    loading: false,
    search: "",
    severity: "",
    markedFraud: "pending",
    bucket: "all",
    savingIds: [],
    restoredId: "",
  });
  const [fraudControls, setFraudControls] = useState({
    maxFeatures: 800,
    gpsRadius: 50,
    resizeTo: 500,
  });
  const [fraudProgress, setFraudProgress] = useState(null);
  const [fraudRunning, setFraudRunning] = useState(false);
  const [assetScan, setAssetScan] = useState({ loading: false, data: null });
  const [imageDialog, setImageDialog] = useState({ open: false, title: "", images: [], activeIndex: 0 });
  const [rectifyDialog, setRectifyDialog] = useState({
    open: false,
    application: null,
    loading: false,
    submitting: false,
    comment: "",
    attachment: null,
    items: [],
    error: "",
    success: "",
  });
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const stopScanRef = useRef(false);
  const fraudRowsRef = useRef([]);
  const flaggedEntryRowsRef = useRef([]);
  const fraudFetchRequestRef = useRef(0);
  const flaggedFetchRequestRef = useRef(0);
  const flagDecisionOverridesRef = useRef(new Map());

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

  function applyFlagDecisionOverrides(rows, { confirmedOnly = false } = {}) {
    const overrides = flagDecisionOverridesRef.current;
    const nextRows = rows.map((row) => {
      const override = overrides.get(row._id);
      return override ? { ...row, markedFraud: override } : row;
    });
    return confirmedOnly ? nextRows.filter((row) => row.markedFraud === "yes") : nextRows;
  }

  function reconcileFlagDecisionOverrides(rows) {
    const overrides = flagDecisionOverridesRef.current;
    if (!overrides.size) return;
    rows.forEach((row) => {
      const override = overrides.get(row._id);
      if (override && row.markedFraud === override) {
        overrides.delete(row._id);
      }
    });
  }

  useEffect(() => {
    localStorage.setItem("pg.sidebar", sidebarCollapsed ? "collapsed" : "open");
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      if (localStorage.getItem("pg.tutorial.seen") !== "true") {
        setTutorialOpen(true);
      }
    } catch {
      setTutorialOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!feedback?.id) return undefined;
    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    fraudRowsRef.current = fraudState.allRows;
  }, [fraudState.allRows]);

  useEffect(() => {
    flaggedEntryRowsRef.current = flaggedEntryState.rows;
  }, [flaggedEntryState.rows]);

  useEffect(() => {
    if (!fraudState.restoredId) return undefined;
    const timeout = window.setTimeout(() => {
      setFraudState((current) => ({
        ...current,
        restoredId: current.restoredId === fraudState.restoredId ? "" : current.restoredId,
      }));
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [fraudState.restoredId]);

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
    appState.limit,
    deferredAppSearch,
  ]);

  useEffect(() => {
    if (dbStatus !== "ready") return;
    let cancelled = false;

    async function loadFlaggedEntries() {
      const requestId = ++flaggedFetchRequestRef.current;
      setFlaggedEntryState((current) => ({ ...current, loading: true }));
      try {
        const params = buildFlaggedEntryParams(flaggedEntryState, deferredFlaggedSearch.trim());
        const rows = await apiJson(`/api/fraud-flags?${params.toString()}`);
        if (cancelled || requestId !== flaggedFetchRequestRef.current) return;
        reconcileFlagDecisionOverrides(rows);
        setFlaggedEntryState((current) => ({
          ...current,
          rows: applyFlagDecisionOverrides(rows, { confirmedOnly: true }),
          loading: false,
        }));
      } catch {
        if (!cancelled && requestId === flaggedFetchRequestRef.current) {
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
      const requestId = ++fraudFetchRequestRef.current;
      setFraudState((current) => ({ ...current, loading: true }));
      try {
        const params = buildFraudParams({ ...fraudState, markedFraud: "" }, deferredFraudSearch.trim());
        const flags = await apiJson(`/api/fraud-flags?${params.toString()}`);
        if (cancelled || requestId !== fraudFetchRequestRef.current) return;
        reconcileFlagDecisionOverrides(flags);
        setFraudState((current) => ({ ...current, allRows: applyFlagDecisionOverrides(flags), loading: false }));
      } catch {
        if (!cancelled && requestId === fraudFetchRequestRef.current) {
          setFraudState((current) => ({ ...current, allRows: [], loading: false }));
          setDbStatus("error");
        }
      }
    }

    loadFraudFlags();
    return () => {
      cancelled = true;
    };
  }, [dbStatus, fraudState.severity, deferredFraudSearch]);

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
    const requestId = ++flaggedFetchRequestRef.current;
    const params = buildFlaggedEntryParams(flaggedEntryState, deferredFlaggedSearch.trim());
    const rows = await apiJson(`/api/fraud-flags?${params.toString()}`);
    if (requestId !== flaggedFetchRequestRef.current) return;
    reconcileFlagDecisionOverrides(rows);
    setFlaggedEntryState((current) => ({
      ...current,
      rows: applyFlagDecisionOverrides(rows, { confirmedOnly: true }),
      loading: false,
    }));
  }

  async function refreshFlaggedEntriesForState(nextState) {
    const requestId = ++flaggedFetchRequestRef.current;
    const params = buildFlaggedEntryParams(nextState, String(nextState.search || "").trim());
    const rows = await apiJson(`/api/fraud-flags?${params.toString()}`);
    if (requestId !== flaggedFetchRequestRef.current) return;
    reconcileFlagDecisionOverrides(rows);
    setFlaggedEntryState((current) => ({
      ...current,
      ...nextState,
      rows: applyFlagDecisionOverrides(rows, { confirmedOnly: true }),
      loading: false,
    }));
  }

  async function refreshFraud() {
    const requestId = ++fraudFetchRequestRef.current;
    const params = buildFraudParams({ ...fraudState, markedFraud: "" }, deferredFraudSearch.trim());
    const flags = await apiJson(`/api/fraud-flags?${params.toString()}`);
    if (requestId !== fraudFetchRequestRef.current) return;
    reconcileFlagDecisionOverrides(flags);
    setFraudState((current) => ({ ...current, allRows: applyFlagDecisionOverrides(flags), loading: false }));
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

  function pushFeedback(message, tone = "success") {
    setFeedback({
      id: Date.now(),
      tone,
      message,
    });
  }

  function handleTutorialOpenChange(open) {
    setTutorialOpen(open);
    if (!open) {
      try {
        localStorage.setItem("pg.tutorial.seen", "true");
      } catch {
        // no-op
      }
    }
  }

  function openImages(application) {
    setImageDialog({
      open: true,
      title: application.applicationNo,
      images: (application.images || []).map((path) => ({ src: `/assets/${path}`, label: path.split("/").pop() })),
      activeIndex: 0,
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
      error: "",
      success: "",
    });
    try {
      const items = await apiJson(`/api/rectifications/${application.applicationNo}`);
      setRectifyDialog((current) => ({ ...current, items, loading: false }));
    } catch (error) {
      setRectifyDialog((current) => ({
        ...current,
        items: [],
        loading: false,
        error: error.message,
      }));
      pushFeedback(`Could not load rectification history. ${error.message}`, "error");
    }
  }

  async function submitRectification() {
    if (!rectifyDialog.application || !rectifyDialog.attachment) return;
    setRectifyDialog((current) => ({ ...current, submitting: true, error: "", success: "" }));
    try {
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
        success: "Rectification submitted successfully.",
      }));
      await refreshMeta();
      pushFeedback("Rectification submitted.", "success");
    } catch (error) {
      setRectifyDialog((current) => ({
        ...current,
        submitting: false,
        error: error.message,
      }));
      pushFeedback(error.message, "error");
    }
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
    return fraudState.allRows.filter((row) => {
      if (fraudState.markedFraud && row.markedFraud !== fraudState.markedFraud) return false;
      if (fraudState.bucket === "all") return true;
      return row.bucket === fraudState.bucket;
    });
  }, [fraudState.allRows, fraudState.markedFraud, fraudState.bucket]);

  async function handleFraudExport(mode) {
    let rows;
    if (mode === "all") {
      rows = await apiJson("/api/fraud-flags?limit=5000");
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
    const originalFlag =
      fraudRowsRef.current.find((row) => row._id === id) ||
      flaggedEntryRowsRef.current.find((row) => row._id === id);
    if (!originalFlag) return;
    const originalInFraudList = fraudRowsRef.current.some((row) => row._id === id);
    flagDecisionOverridesRef.current.set(id, decision);

    const optimisticFlag = { ...originalFlag, markedFraud: decision };
    setFraudState((current) => ({
      ...current,
      allRows: current.allRows.map((row) => (row._id === id ? optimisticFlag : row)),
      savingIds: [...new Set([...current.savingIds, id])],
      restoredId: current.restoredId === id ? "" : current.restoredId,
    }));
    setFlaggedEntryState((current) => ({
      ...current,
      rows:
        optimisticFlag.markedFraud === "yes"
          ? [optimisticFlag, ...current.rows.filter((row) => row._id !== id)]
          : current.rows.filter((row) => row._id !== id),
    }));

    try {
      const savedFlag = await apiJson(`/api/fraud-flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markedFraud: decision }),
      });
      setFraudState((current) => ({
        ...current,
        allRows: current.allRows.map((row) => (row._id === id ? savedFlag : row)),
        savingIds: current.savingIds.filter((flagId) => flagId !== id),
      }));
      setFlaggedEntryState((current) => ({
        ...current,
        rows:
          savedFlag.markedFraud === "yes"
            ? [savedFlag, ...current.rows.filter((row) => row._id !== id)]
            : current.rows.filter((row) => row._id !== id),
      }));
      Promise.all([refreshApplications(), refreshMeta()]).catch(() => {
        // Keep the optimistic UI. A later refresh will reconcile if needed.
      });
      pushFeedback(
        decision === "yes"
          ? "Negligence decision saved."
          : decision === "no"
            ? "Clear decision saved."
            : "Pair returned to pending review.",
        "success"
      );
    } catch (error) {
      flagDecisionOverridesRef.current.delete(id);
      setFraudState((current) => ({
        ...current,
        allRows: originalInFraudList
          ? [originalFlag, ...current.allRows.filter((row) => row._id !== id)]
          : current.allRows.filter((row) => row._id !== id),
        savingIds: current.savingIds.filter((flagId) => flagId !== id),
        restoredId: originalInFraudList ? id : "",
      }));
      setFlaggedEntryState((current) => ({
        ...current,
        rows:
          originalFlag.markedFraud === "yes"
            ? [originalFlag, ...current.rows.filter((row) => row._id !== id)]
            : current.rows.filter((row) => row._id !== id),
      }));
      if (originalInFraudList) {
        window.requestAnimationFrame(() => {
          document.getElementById(`fraud-pair-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      pushFeedback(`Save failed. Pair returned to review queue. ${error.message}`, "error");
    }
  }

  async function handleCreateFlaggedPair(payload) {
    try {
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

      pushFeedback("Manual negligence pair saved.", "success");
      return result;
    } catch (error) {
      pushFeedback(error.message, "error");
      throw error;
    }
  }

  async function handleClearFraudFlags() {
    await apiJson("/api/fraud-flags", { method: "DELETE" });
    await Promise.all([refreshFraud(), refreshApplications(), refreshFlaggedEntries(), refreshMeta()]);
    pushFeedback("All pair flags cleared.", "success");
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
      pushFeedback(result.flags.length ? "Pair detection finished and saved." : "No pair flags were detected.", "success");
    } catch (error) {
      if (error.message !== "SCAN_STOPPED") {
        pushFeedback(error.message, "error");
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
            stats={stats}
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

  const activeImage = imageDialog.images[imageDialog.activeIndex] || null;
  const rectificationPreview = rectifyDialog.application?.images?.[0]
    ? `/assets/${rectifyDialog.application.images[0]}`
    : null;

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
            <div className="flex w-full items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Negligence Operations</div>
                <div className="mt-1 text-sm font-semibold">
                  {NAV_ITEMS.find((item) => item.id === activeView)?.label || "PanelGuard"}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => handleTutorialOpenChange(true)}>
                  <BookOpen className="h-3.5 w-3.5" />
                  Tutorial
                </Button>
                <DbBadge status={dbStatus} />
                <OpenCvBadge status={cvStatus} />
              </div>
            </div>
            {dbStatus === "error" && (
              <div className="border-t border-[#efcfd6] bg-[#fff3f5] px-4 py-2 text-xs text-[#9f3c50]">
                <div className="flex w-full items-center gap-2 px-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Server connection failed. Start `node server.cjs` before using the console.</span>
                </div>
              </div>
            )}
          </header>

          <div className="w-full px-5 py-4">
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

          <footer className="flex w-full flex-wrap items-center justify-between gap-3 px-5 pb-5 pt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span>PanelGuard</span>
            <span>Server-backed review</span>
            <span>Pair-based negligence mapping</span>
          </footer>
        </main>
      </div>

      <Dialog open={imageDialog.open} onOpenChange={(open) => setImageDialog((current) => ({ ...current, open }))}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,1320px)] overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>Application Images · {imageDialog.title}</DialogTitle>
            <DialogDescription>
              {imageDialog.images.length} asset image{imageDialog.images.length === 1 ? "" : "s"} linked to this application. Select a thumbnail to inspect it at full size.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-4 xl:grid-cols-[1fr,320px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-secondary/40">
              {activeImage ? (
                <>
                  <img alt={activeImage.label} className="h-[68vh] w-full object-contain bg-[#eef3fa]" loading="lazy" src={activeImage.src} />
                  <div className="border-t border-border bg-white/80 px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{activeImage.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{imageDialog.title}</div>
                  </div>
                </>
              ) : (
                <div className="flex h-[68vh] items-center justify-center text-sm text-muted-foreground">No images linked to this application.</div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-secondary/30 p-3">
              <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Gallery</div>
              <ScrollArea className="max-h-[68vh] pr-1">
                <div className="space-y-3">
                  {imageDialog.images.map((image, index) => (
                    <button
                      key={image.src}
                      className={cn(
                        "w-full overflow-hidden rounded-xl border text-left transition",
                        imageDialog.activeIndex === index
                          ? "border-primary ring-2 ring-primary/15"
                          : "border-border bg-white hover:border-primary/40"
                      )}
                      onClick={() => setImageDialog((current) => ({ ...current, activeIndex: index }))}
                      type="button"
                    >
                      <img alt={image.label} className="h-32 w-full object-cover" loading="lazy" src={image.src} />
                      <div className="border-t border-border px-3 py-2">
                        <div className="truncate text-xs font-medium text-foreground">{image.label}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">Click to enlarge</div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rectifyDialog.open} onOpenChange={(open) => setRectifyDialog((current) => ({ ...current, open }))}>
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,1240px)] flex-col overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>
              Rectification · {rectifyDialog.application?.applicationNo || ""}
            </DialogTitle>
            <DialogDescription>Prepare evidence, review prior submissions, and upload rectifications without losing application context.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 xl:grid-cols-[380px,minmax(0,1fr)]">
            <ScrollArea className="min-h-0 xl:h-full">
              <div className="space-y-4 pr-3">
                <div className="overflow-hidden rounded-2xl border border-border bg-secondary/35">
                  {rectificationPreview ? (
                    <img
                      alt={rectifyDialog.application?.applicationNo || "Application"}
                      className="h-52 w-full object-cover"
                      loading="lazy"
                      src={rectificationPreview}
                    />
                  ) : (
                    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No asset preview available.</div>
                  )}
                  <div className="border-t border-border bg-white/80 p-4">
                    <div className="text-sm font-semibold text-foreground">
                      {rectifyDialog.application?.beneficiaryName || "Selected application"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{rectifyDialog.application?.sanctionName || "No sanction linked"}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant={rectifyDialog.application?.hasImages ? "success" : "ghost"}>
                        {rectifyDialog.application?.images?.length || 0} asset{rectifyDialog.application?.images?.length === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant={rectifyDialog.application?.fraudMarked === "yes" ? "danger" : rectifyDialog.application?.fraudMarked === "no" ? "success" : "ghost"}>
                        {rectifyDialog.application?.fraudMarked === "yes"
                          ? "Negligence"
                          : rectifyDialog.application?.fraudMarked === "no"
                            ? "Clear"
                            : "Pending"}
                      </Badge>
                    </div>
                    {rectifyDialog.application?.hasImages ? (
                      <Button className="mt-4 w-full" size="sm" variant="outline" onClick={() => openImages(rectifyDialog.application)}>
                        <ImageIcon className="h-3.5 w-3.5" />
                        Open image gallery
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-sm font-semibold text-foreground">New rectification</div>
                  <div className="mt-1 text-xs text-muted-foreground">Add a short note, attach evidence, then submit. The submission history stays visible on the right.</div>

                  <Textarea
                    className="mt-4 min-h-[130px]"
                    placeholder="Explain what changed, what the attachment proves, and any field conditions worth noting."
                    value={rectifyDialog.comment}
                    onChange={(event) =>
                      setRectifyDialog((current) => ({
                        ...current,
                        comment: event.target.value,
                      }))
                    }
                  />

                  <div className="mt-4 space-y-3">
                    <label
                      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/35 bg-primary/5 px-4 py-6 text-center transition hover:border-primary/55 hover:bg-primary/10"
                      htmlFor="rectify-upload"
                    >
                      <div className="text-sm font-medium text-foreground">Choose evidence file</div>
                      <div className="mt-1 text-xs text-muted-foreground">Images, PDFs, and supporting documents are accepted.</div>
                    </label>
                    <input
                      className="hidden"
                      id="rectify-upload"
                      type="file"
                      onChange={(event) =>
                        setRectifyDialog((current) => ({
                          ...current,
                          attachment: event.target.files?.[0] || null,
                          error: "",
                          success: "",
                        }))
                      }
                    />

                    <div className="rounded-xl border border-border bg-secondary/35 px-3 py-3 text-sm text-foreground">
                      {rectifyDialog.attachment ? rectifyDialog.attachment.name : "No evidence file selected yet."}
                    </div>

                    {rectifyDialog.error ? (
                      <div className="rounded-xl border border-[#efcfd6] bg-[#fff4f6] px-3 py-2 text-sm text-[#9f3c50]">{rectifyDialog.error}</div>
                    ) : null}
                    {rectifyDialog.success ? (
                      <div className="rounded-xl border border-[#cfe8da] bg-[#effaf4] px-3 py-2 text-sm text-[#25734e]">{rectifyDialog.success}</div>
                    ) : null}

                    <Button className="w-full" disabled={!rectifyDialog.attachment || rectifyDialog.submitting} onClick={submitRectification}>
                      {rectifyDialog.submitting ? "Submitting rectification..." : "Submit rectification"}
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-secondary/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Submission history</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {rectifyDialog.items.length} saved rectification{rectifyDialog.items.length === 1 ? "" : "s"} for this application
                  </div>
                </div>
                <Badge variant="ghost">{rectifyDialog.application?.applicationNo || "No app"}</Badge>
              </div>

              <ScrollArea className="mt-4 min-h-0 flex-1 pr-1">
                <div className="space-y-3">
                  {rectifyDialog.loading && <div className="text-sm text-muted-foreground">Loading evidence history…</div>}
                  {!rectifyDialog.loading && !rectifyDialog.items.length && (
                    <div className="rounded-xl border border-dashed border-border bg-white/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      No rectifications have been submitted yet.
                    </div>
                  )}
                  {rectifyDialog.items.map((item) => (
                    <div key={item._id} className="rounded-2xl border border-border bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-foreground">{item.attachmentName}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDate(item.submittedAt)}</div>
                      </div>
                      <div className="mt-3 rounded-xl border border-border bg-secondary/25 px-3 py-3 text-sm leading-6 text-foreground">
                        {item.comment || "No note was added with this submission."}
                      </div>
                      <a
                        className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
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
          </div>
        </DialogContent>
      </Dialog>

      <TutorialMode open={tutorialOpen} onNavigate={setActiveView} onOpenChange={handleTutorialOpenChange} />

      <AnimatePresence>
        {feedback ? <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} /> : null}
      </AnimatePresence>
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

function FeedbackToast({ feedback, onDismiss }) {
  const toneStyles =
    feedback.tone === "error"
      ? "border-[#efcfd6] bg-[#fff4f6] text-[#9f3c50]"
      : "border-[#cfe1fb] bg-white text-[#1c3d6e]";

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "fixed bottom-5 right-5 z-[70] flex w-[min(92vw,380px)] items-start gap-3 rounded-2xl border px-4 py-3 shadow-shell",
        toneStyles
      )}
      exit={{ opacity: 0, y: 12 }}
      initial={{ opacity: 0, y: 12 }}
    >
      {feedback.tone === "error" ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#25734e]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{feedback.message}</div>
      </div>
      <button className="text-xs text-muted-foreground transition hover:text-foreground" onClick={onDismiss} type="button">
        Dismiss
      </button>
    </motion.div>
  );
}
