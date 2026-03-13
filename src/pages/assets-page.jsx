import { FolderSearch2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AssetsPage({ scanState, onScan }) {
  const data = scanState.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset health scan</CardTitle>
          <CardDescription>Resync images, orphan folders, and missing application assets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={onScan} disabled={scanState.loading}>
            <FolderSearch2 className="h-4 w-4" />
            {scanState.loading ? "Scanning..." : "Scan assets folder"}
          </Button>

          {!data ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Run a scan to inspect dataset coverage.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Folders" value={data.totalFolders} />
              <Metric label="Images" value={data.totalImages} />
              <Metric label="Orphans" value={data.notInDataset} />
              <Metric label="No serial" value={data.withoutSerial} />
            </div>
          )}
        </CardContent>
      </Card>
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
