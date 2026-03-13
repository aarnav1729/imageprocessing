import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary text-secondary-foreground",
        primary: "border-[#cfe0ff] bg-[#edf4ff] text-[#214a8a]",
        success: "border-[#d5eadf] bg-[#edf9f2] text-[#25734e]",
        warning: "border-[#f2e0bb] bg-[#fff7e8] text-[#9c6700]",
        danger: "border-[#f0d3da] bg-[#fff0f3] text-[#a53a4f]",
        ghost: "border-border/70 bg-white/80 text-[#53647b]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
