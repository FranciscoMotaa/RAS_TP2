"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Loading from "@/components/loading";
import { api } from "@/lib/axios";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

export default function ShareAccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<"view" | "edit" | null>(null);
  const [project, setProject] = useState<any | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) {
      setError("Token em falta na URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    // Call API gateway to fetch shared project
    api
      .get(`/projects/share/project?token=${encodeURIComponent(token)}`)
      .then((resp) => {
        if (resp.status === 200 && resp.data && resp.data.project) {
          setProject(resp.data.project);
          setPermission(resp.data.permission);
          setLoading(false);
        } else {
          setError("Link inválido ou erro ao obter projeto.");
          setLoading(false);
        }
      })
      .catch((err) => {
        const msg = err?.response?.data?.error || err.message || "Erro desconhecido";
        setError(msg);
        setLoading(false);
      });
  }, [token]);

  function openProject() {
    if (!project || !permission) return;
    // Redirect to dashboard route for project with query params to set mode and view
    // If permission is 'view' open in mode=view (read-only) otherwise mode=edit
    const mode = permission === "view" ? "results" : "edit";
    // we need the owner id and project id
    const owner = project.user_id || project.user || project.userId || project.user_id;
    const pid = project._id;
    if (!owner || !pid) {
      toast({ title: "Não foi possível abrir o projeto partilhado.", variant: "destructive" });
      return;
    }

    // Redirect to the dashboard project page (assumes route /dashboard/[pid]?mode=...&view=grid)
    // For shared access, we will redirect to a special route that loads without checking session
    // Simpler approach: open /dashboard/{pid}?mode=...&view=grid and let API gateway enforce access
    router.push(`/dashboard/${pid}?mode=${mode}&view=grid&shared=true&permission=${permission}&token=${token}`);
  }

  if (loading) return <div className="flex h-screen items-center justify-center"><Loading /></div>;

  if (error)
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="max-w-lg w-full p-6">
          <Alert variant="destructive">
            <AlertTitle>Link inválido</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => router.push('/')}>Voltar</Button>
          </div>
        </Card>
      </div>
    );

  return (
    <div className="flex h-screen items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-6">
        <h2 className="text-lg font-semibold">Abrir projeto partilhado</h2>
        <p className="mt-2 text-sm text-muted-foreground">Projeto: {project.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">Permissão: {permission}</p>

        <div className="mt-6 flex gap-2 justify-end">
          <Button variant="outline" onClick={() => router.push('/')}>Cancelar</Button>
          <Button onClick={openProject}>Abrir projeto</Button>
        </div>
      </Card>
    </div>
  );
}
