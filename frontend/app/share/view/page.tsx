"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Loading from "@/components/loading";
import { api } from "@/lib/axios";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function ShareViewPage() {
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

  if (loading) return <div className="flex h-screen items-center justify-center"><Loading /></div>;

  if (error)
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="max-w-lg w-full p-6">
          <h3 className="text-lg font-semibold">Link inválido</h3>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => router.push('/')}>Voltar</Button>
          </div>
        </Card>
      </div>
    );

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="p-6">
          <h2 className="text-xl font-semibold">{project.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Permissão: {permission}</p>
          {permission === 'edit' && (
            <div className="mt-2 text-sm text-amber-600">Este link permite edição — é necessário iniciar sessão para editar.</div>
          )}

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {project.imgs && project.imgs.length > 0 ? (
              project.imgs.map((img: any) => (
                <div key={img._id} className="border rounded overflow-hidden">
                  <img src={img.url} alt={img.name} className="w-full h-40 object-cover" />
                  <div className="p-2 text-sm truncate">{img.name}</div>
                </div>
              ))
            ) : (
              <div>Nenhuma imagem encontrada.</div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/')}>Voltar</Button>
            <Button onClick={() => { navigator.clipboard.writeText(window.location.href); toast({ title: 'URL copiada.' }); }}>Copiar link</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
