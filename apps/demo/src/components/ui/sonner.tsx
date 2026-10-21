"use client";

import {
  CircleCheck,
  Info,
  LoaderCircle,
  type LucideIcon,
  OctagonX,
  TriangleAlert,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function ToastIcon({ Icon, className }: { Icon: LucideIcon; className?: string }) {
  return <Icon className={className ?? "size-4"} />;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <ToastIcon Icon={CircleCheck} />,
        info: <ToastIcon Icon={Info} />,
        warning: <ToastIcon Icon={TriangleAlert} />,
        error: <ToastIcon Icon={OctagonX} />,
        loading: <ToastIcon Icon={LoaderCircle} className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
