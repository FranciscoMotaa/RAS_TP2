"use client";

import { Pencil, Eye, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";

interface ModeToggleProps {
  sharedPermission?: "view" | "edit" | null;
}

export function ModeToggle({ sharedPermission }: ModeToggleProps) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "grid";
  const mode = searchParams.get("mode") ?? "edit";
  const router = useRouter();

  // Check if edit mode is disabled (read-only access)
  const isEditDisabled = sharedPermission === "view";

  const setMode = (nextMode: "edit" | "results") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    params.set("view", view);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-0.5 p-0.5 border rounded-lg">
      <Button
        variant={mode === "edit" ? "default" : "secondary"}
        size="icon"
        onClick={() => {
          if (!isEditDisabled) {
            setMode("edit");
          }
        }}
        disabled={isEditDisabled}
        aria-label="Edit mode"
        aria-pressed={view === "grid"}
        className="size-8"
        title={isEditDisabled ? "Modo edição bloqueado (acesso somente leitura)" : "Edit mode"}
      >
        {isEditDisabled ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
      </Button>
      <Button
        variant={mode === "results" ? "default" : "secondary"}
        size="icon"
        onClick={() => setMode("results")}
        aria-label="Results mode"
        aria-pressed={view === "carousel"}
        className="size-8"
        title="Results mode"
      >
        <Eye className="h-4 w-4" />
      </Button>
    </div>
  );
}
