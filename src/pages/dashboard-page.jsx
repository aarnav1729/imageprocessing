import { motion } from "framer-motion";
import { ArrowRight, ChartNoAxesColumn, FolderGit2, ShieldCheck, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const metricCards = [
  { key: "sanctions", title: "Sanctions", valueKey: "sanctions", tone: "primary" },
  { key: "apps", title: "Applications", valueKey: "totalApps", tone: "primary" },
  { key: "flags", title: "Pending flags", valueKey: "pendingReview", tone: "warning" },
  { key: "rects", title: "Rectifications", valueKey: "rectCount", tone: "success" },
];

export default function DashboardPage({ stats, sanctions, loading, onNavigate }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <Badge variant="primary" className="w-fit">
              Control room
            </Badge>
            <CardTitle className="text-xl">Server-backed review workspace</CardTitle>
            <CardDescription className="max-w-2xl text-sm">
              The detector stays pair-based and the queue surfaces only the records that still need action.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <QuickAction
              icon={FolderGit2}
              title="Sanction intake"
              copy="Upload and replace datasets without leaving the console."
              onClick={() => onNavigate("sanctions")}
            />
            <QuickAction
              icon={ChartNoAxesColumn}
              title="Application queue"
              copy="Work the active list, inspect images, and push rectifications."
              onClick={() => onNavigate("applications")}
            />
            <QuickAction
              icon={ShieldCheck}
              title="Negligence review"
              copy="Run the old detector across all assets and review pair records only."
              onClick={() => onNavigate("fraud")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <Badge variant="ghost" className="w-fit">
              Queue pressure
            </Badge>
            <CardTitle className="text-base">Operational state</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <QueueRow label="Matched rows" value={stats.matchApps} tone="success" />
            <QueueRow label="Mismatched rows" value={stats.mismatchApps} tone="warning" />
            <QueueRow label="Confirmed negligence" value={stats.confirmedFraud} tone="danger" />
            <QueueRow label="Applications with assets" value={stats.appsWithImages} tone="primary" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((item, index) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{item.title}</div>
                <div className="mt-2 text-2xl font-semibold">{loading ? "—" : stats[item.valueKey]}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent sanctions</CardTitle>
            <CardDescription>Most recent datasets currently loaded into the server.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => onNavigate("sanctions")}>
            Open sanctions
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {!sanctions.length ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No sanctions uploaded yet.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {sanctions.slice(0, 6).map((sanction) => (
                <div key={sanction._id} className="rounded-xl border border-border bg-secondary/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{sanction.name}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {sanction.totalApplications} rows · {sanction.matchCount} match · {sanction.mismatchCount} mismatch
                      </div>
                    </div>
                    <Badge variant="ghost">{new Date(sanction.uploadedAt).toLocaleDateString("en-US")}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAction({ icon: Icon, title, copy, onClick }) {
  return (
    <button
      className="rounded-xl border border-border bg-secondary/50 p-4 text-left transition hover:border-[#bfd5f7] hover:bg-[#f5f9ff]"
      onClick={onClick}
      type="button"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-[#f3f7fc] text-[#214a8a]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{copy}</div>
    </button>
  );
}

function QueueRow({ label, value, tone }) {
  const variants = {
    primary: "bg-[#edf4ff] text-[#214a8a]",
    success: "bg-[#edf9f2] text-[#25734e]",
    warning: "bg-[#fff7e8] text-[#9c6700]",
    danger: "bg-[#fff0f3] text-[#a53a4f]",
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${variants[tone]}`}>{value}</span>
    </div>
  );
}
