import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, FolderSearch2, ShieldAlert, ShieldX, WandSparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TUTORIAL_STEPS = [
  {
    id: "overview",
    label: "Workspace",
    title: "How the workspace flows",
    description: "Start with incoming applications, move into pair review, and keep confirmed negligence separate from live review.",
    bullets: [
      "Applications are the operational queue.",
      "Negligence review is where pending pair decisions happen.",
      "Confirmed negligence is the historical record after you respond.",
    ],
    route: "dashboard",
  },
  {
    id: "applications",
    label: "Applications",
    title: "Read an application card quickly",
    description: "Each card puts the application number, state badges, remarks, and evidence actions together so you do not have to scan a dense table.",
    bullets: [
      "Remarks are highlighted in a dedicated callout.",
      "Asset previews show whether the record has evidence ready.",
      "Rectify opens a full submission workspace with history.",
    ],
    route: "applications",
  },
  {
    id: "review",
    label: "Pair Review",
    title: "Work only the pending pairs",
    description: "The pair review page defaults to pending decisions, so once you respond with negligence or clear, the pair leaves the active review list.",
    bullets: [
      "Use the progress section to track review coverage.",
      "Negligence and clear decisions are saved to the backend.",
      "The visible list narrows as soon as pairs are answered.",
    ],
    route: "fraud",
  },
  {
    id: "confirmed",
    label: "Confirmed",
    title: "Manage confirmed negligence pairs",
    description: "This page is for the saved negligence history. It is where manual pair creation and confirmed-pair export live.",
    bullets: [
      "Create a manual pair using asset previews before save.",
      "Search by either side of the pair.",
      "Reset or clear a confirmed pair when the decision changes.",
    ],
    route: "fraud-entries",
  },
  {
    id: "rectification",
    label: "Rectify",
    title: "Submit rectifications with context",
    description: "The rectification dialog now shows the application, supporting image context, prior submissions, and the new evidence upload area together.",
    bullets: [
      "Pick the file, add context, and submit from one place.",
      "Existing evidence stays visible while you prepare the next one.",
      "Success and failure feedback appears immediately.",
    ],
    route: "applications",
  },
];

export default function TutorialMode({ open, onOpenChange, onNavigate }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) setStepIndex(0);
  }, [open]);

  const step = TUTORIAL_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  const stepIcon = useMemo(() => {
    if (step.id === "applications") return FolderSearch2;
    if (step.id === "review") return ShieldAlert;
    if (step.id === "confirmed") return ShieldX;
    return WandSparkles;
  }, [step.id]);
  const StepIcon = stepIcon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(94vw,1140px)] flex-col overflow-hidden p-0">
        <DialogHeader className="gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Badge variant="primary" className="mb-2 w-fit">
                Tutorial mode
              </Badge>
              <DialogTitle>Guided walkthrough</DialogTitle>
              <DialogDescription>Use this to onboard someone quickly or to refresh the intended workflow without guessing.</DialogDescription>
            </div>
            <Button size="sm" variant="outline" type="button" onClick={() => onNavigate(step.route)}>
              Open current page
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[240px,1fr]">
          <div className="border-r border-border bg-secondary/35 p-3">
            <div className="space-y-1">
              {TUTORIAL_STEPS.map((item, index) => (
                <button
                  key={item.id}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    index === stepIndex
                      ? "border-[#c7daf7] bg-[#edf4ff] text-[#15335f]"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-white/70 hover:text-foreground"
                  }`}
                  onClick={() => setStepIndex(index)}
                  type="button"
                >
                  <div className="text-[11px] font-medium">{item.label}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Step {index + 1}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid min-h-0 gap-0 xl:grid-cols-[0.95fr,1.05fr]">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                className="overflow-auto border-b border-border p-5 xl:border-b-0 xl:border-r"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22 }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-[#214a8a]">
                    <StepIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Step {stepIndex + 1}</div>
                    <div className="text-lg font-semibold text-foreground">{step.title}</div>
                  </div>
                </div>

                <div className="mt-4 text-sm leading-7 text-muted-foreground">{step.description}</div>

                <div className="mt-5 space-y-2">
                  {step.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="text-sm text-foreground">{bullet}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="overflow-auto p-5">
              <AnimatedTutorialDemo step={step.id} />
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-secondary/25 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              You can reopen tutorial mode any time from the header.
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={isFirst} onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (isLast) {
                    onOpenChange(false);
                    return;
                  }
                  setStepIndex((current) => Math.min(current + 1, TUTORIAL_STEPS.length - 1));
                }}
              >
                {isLast ? "Finish" : "Next"}
                {!isLast ? <ChevronRight className="h-3.5 w-3.5" /> : null}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnimatedTutorialDemo({ step }) {
  if (step === "applications") return <ApplicationsDemo />;
  if (step === "review") return <ReviewDemo />;
  if (step === "confirmed") return <ConfirmedDemo />;
  if (step === "rectification") return <RectificationDemo />;
  return <OverviewDemo />;
}

function DemoShell({ title, children }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card surface-glow">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function OverviewDemo() {
  return (
    <DemoShell title="Workflow preview">
      <div className="grid gap-3 md:grid-cols-3">
        {["Applications", "Pair review", "Confirmed"].map((label, index) => (
          <motion.div
            key={label}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: index * 0.2 }}
            className="rounded-2xl border border-border bg-secondary/40 p-4"
          >
            <div className="text-sm font-semibold">{label}</div>
            <div className="mt-2 h-2 rounded-full bg-[#d9e4f2]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${50 + index * 18}%` }} />
            </div>
          </motion.div>
        ))}
      </div>
    </DemoShell>
  );
}

function ApplicationsDemo() {
  return (
    <DemoShell title="Application card">
      <motion.div
        animate={{ boxShadow: ["0 0 0 rgba(0,0,0,0)", "0 16px 30px rgba(73, 96, 129, 0.14)", "0 0 0 rgba(0,0,0,0)"] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        className="rounded-2xl border border-border bg-white p-4"
      >
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold">APP-20491</div>
          <Badge variant="success">Match</Badge>
          <Badge variant="ghost">Pending</Badge>
        </div>
        <div className="mt-1 text-sm text-foreground">Asha Devi</div>
        <div className="mt-4 rounded-2xl border border-[#f0d8a0] bg-[#fff8e8] p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#8c5b00]">Remarks</div>
          <motion.div
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="mt-2 text-sm font-medium text-[#6c4700]"
          >
            Transformer photo missing in first visit. Recheck with full rooftop coverage.
          </motion.div>
        </div>
      </motion.div>
    </DemoShell>
  );
}

function ReviewDemo() {
  return (
    <DemoShell title="Pending review">
      <div className="rounded-2xl border border-border bg-secondary/35 p-4">
        <div className="flex items-center justify-between text-sm">
          <span>Review completion</span>
          <span className="font-semibold text-primary">68%</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[#d9e4f2]">
          <motion.div
            animate={{ width: ["38%", "68%", "52%", "68%"] }}
            transition={{ duration: 3.4, repeat: Infinity }}
            className="h-full rounded-full bg-primary"
          />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {[0, 1].map((index) => (
            <motion.div
              key={index}
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 2.3, repeat: Infinity, delay: index * 0.2 }}
              className="rounded-xl border border-border bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <Badge variant="warning">Pending</Badge>
                <Badge variant="primary">87%</Badge>
              </div>
              <div className="mt-3 h-20 rounded-lg bg-[linear-gradient(135deg,#eef4fb,#dbe8fb)]" />
            </motion.div>
          ))}
        </div>
      </div>
    </DemoShell>
  );
}

function ConfirmedDemo() {
  return (
    <DemoShell title="Confirmed negligence">
      <motion.div
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="rounded-2xl border border-[#efcfd6] bg-[#fff4f6] p-4"
      >
        <div className="flex items-center gap-2">
          <Badge variant="danger">Negligence</Badge>
          <Badge variant="primary">100%</Badge>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="h-24 rounded-xl bg-[linear-gradient(135deg,#e6eef9,#d1def2)]" />
          <div className="h-24 rounded-xl bg-[linear-gradient(135deg,#e6eef9,#d1def2)]" />
        </div>
      </motion.div>
    </DemoShell>
  );
}

function RectificationDemo() {
  return (
    <DemoShell title="Rectification workspace">
      <div className="grid gap-3 xl:grid-cols-[0.9fr,1.1fr]">
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="text-sm font-semibold">New submission</div>
          <div className="mt-3 h-24 rounded-xl bg-[linear-gradient(135deg,#eef4fb,#dbe8fb)]" />
          <motion.div
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="mt-3 rounded-xl border border-dashed border-primary/35 bg-primary/5 px-3 py-4 text-sm text-primary"
          >
            Attach evidence and add your note here.
          </motion.div>
        </div>
        <div className="space-y-2">
          {[0, 1].map((index) => (
            <motion.div
              key={index}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.1, repeat: Infinity, delay: index * 0.15 }}
              className="rounded-2xl border border-border bg-secondary/35 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">evidence_{index + 1}.jpg</div>
                <Badge variant="ghost">Saved</Badge>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">Previous supporting upload with note and open action.</div>
            </motion.div>
          ))}
        </div>
      </div>
    </DemoShell>
  );
}
