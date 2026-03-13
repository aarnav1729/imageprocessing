import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileUp, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SanctionsPage({ sanctions, onUpload, onDelete }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    try {
      await onUpload(files);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Badge variant="primary" className="w-fit">
            Intake
          </Badge>
          <CardTitle className="text-base">Load sanction workbooks</CardTitle>
          <CardDescription>Replace or add `.xlsx` and `.xls` files. Existing sanction names are updated in place.</CardDescription>
        </CardHeader>
        <CardContent>
          <button
            className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/50 px-6 py-10 text-center transition hover:border-[#bfd5f7] hover:bg-[#f5f9ff]"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-[#f3f7fc] text-[#214a8a]">
              <FileUp className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">{uploading ? "Uploading..." : "Drop files or browse"}</div>
            <div className="mt-1 text-xs text-muted-foreground">Excel only. Server links assets by application number.</div>
          </button>
          <input
            ref={inputRef}
            className="hidden"
            multiple
            accept=".xlsx,.xls"
            type="file"
            onChange={(event) => handleFiles(event.target.files)}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sanctions.map((sanction, index) => (
          <motion.div
            key={sanction._id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
          >
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{sanction.name}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(sanction.uploadedAt).toLocaleString("en-US")}
                    </div>
                  </div>
                  <Badge variant="ghost">{sanction.totalApplications} rows</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Match" value={sanction.matchCount} />
                  <Stat label="Mismatch" value={sanction.mismatchCount} />
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => onDelete(sanction._id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete sanction
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
