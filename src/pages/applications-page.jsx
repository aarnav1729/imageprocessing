import { Camera, ChevronLeft, ChevronRight, Download, FileWarning } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ApplicationsPage({ sanctions, state, setState, onViewImages, onRectify, onExport }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Application queue</CardTitle>
              <CardDescription>Compact review list with export and evidence actions.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <QueueToggle
                value={state.queue}
                onChange={(queue) => setState((current) => ({ ...current, queue, page: 1 }))}
              />
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
          <div className="grid gap-2 lg:grid-cols-[1.3fr,repeat(4,minmax(0,0.8fr))]">
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="max-h-[68vh] overflow-auto scroll-slim">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#edf3f9]">
                  <tr className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <th className="px-3 py-2.5">Application</th>
                    <th className="px-3 py-2.5">Sanction</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Assets</th>
                    <th className="px-3 py-2.5">Negligence</th>
                    <th className="px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((application) => (
                    <tr key={application._id} className="border-t border-border/80 bg-card/80">
                      <td className="px-3 py-3 align-top">
                        <div className="text-sm font-medium">{application.applicationNo}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{application.beneficiaryName || "No beneficiary"}</div>
                        {application.remarks ? <div className="mt-1 text-[11px] text-muted-foreground">{application.remarks}</div> : null}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-muted-foreground">{application.sanctionName}</td>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge value={application.status} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <Badge variant={application.hasImages ? "success" : "ghost"}>
                            {application.images?.length || 0} image{application.images?.length === 1 ? "" : "s"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <FraudBadge value={application.fraudMarked} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={!application.hasImages} onClick={() => onViewImages(application)}>
                            <Camera className="h-3.5 w-3.5" />
                            Images
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onRectify(application)}>
                            <FileWarning className="h-3.5 w-3.5" />
                            Rectify
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!state.loading && !state.rows.length ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                        No applications match the current queue and filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
