"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LoaderCircle, Share2 } from "lucide-react";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { useShareProject, useUpdateProject } from "@/lib/mutations/projects";

export default function ShareModal() {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [expiresHours, setExpiresHours] = useState<number | undefined>(24);
  const [singleUse, setSingleUse] = useState(false);
  const [stage, setStage] = useState<"confirmSave" | "choosePerm" | "result">(
    "confirmSave",
  );
  const [resultLink, setResultLink] = useState<string | null>(null);

  const { _id: pid, name } = useProjectInfo();
  const session = useSession();
  const { toast } = useToast();

  const updateProject = useUpdateProject(session.user._id, pid as string, session.token);
  const shareProject = useShareProject(session.user._id, pid as string, session.token);

  async function handleStart() {
    // Ask user to save changes (we only save project name here as a simple measure)
    setStage("confirmSave");
    setOpen(true);
  }

  function handleCancel() {
    setOpen(false);
    setStage("confirmSave");
    setResultLink(null);
  }

  function handleSaveAndContinue() {
    updateProject.mutate(
      { uid: session.user._id, pid: pid as string, token: session.token, name },
      {
        onSuccess: () => {
          setStage("choosePerm");
        },
        onError: (error: any) =>
          toast({ title: "Ups! An error occurred.", description: error.message, variant: "destructive" }),
      },
    );
  }

  function handleGenerate() {
    console.log('Generating share link with', { permission, expiresHours, singleUse });
    shareProject.mutate(
      { permission, expiresHours, singleUse },
      {
        onSuccess: (data: any) => {
          setResultLink(data.link);
          setStage("result");
        },
        onError: (error: any) =>
          toast({ title: "Ups! An error occurred.", description: error.message, variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="px-3 inline-flex items-center gap-1" onClick={handleStart}>
          <Share2 /> Partilhar
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Partilhar projeto</DialogTitle>
          <DialogDescription>
            {stage === "confirmSave" && "Deseja guardar as alterações antes de partilhar?"}
            {stage === "choosePerm" && "Escolha o tipo de permissão para o link:"}
            {stage === "result" && "Link gerado:"}
          </DialogDescription>
        </DialogHeader>

        {stage === "confirmSave" && (
          <div className="py-4">
            <p className="mb-4">Para garantir que o destinatário vê a versão correta, guarde as alterações antes de partilhar.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
              <Button onClick={handleSaveAndContinue} className="inline-flex items-center gap-2">
                Guardar e continuar
                {updateProject.isPending && <LoaderCircle className="size-[1em] animate-spin" />}
              </Button>
            </div>
          </div>
        )}

        {stage === "choosePerm" && (
          <div className="py-2">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="perm" value="view" checked={permission === 'view'} onChange={() => setPermission('view')} />
                Ver (leitura)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="perm" value="edit" checked={permission === 'edit'} onChange={() => setPermission('edit')} />
                Editar
              </label>
            </div>

            <div className="mt-4 flex gap-2 items-center">
              <label className="flex items-center gap-2">Expira em (horas):</label>
              <Input type="number" value={expiresHours ?? ''} onChange={(e) => setExpiresHours(Number(e.target.value))} className="w-32" />
              <label className="flex items-center gap-2 ml-4">
                <input type="checkbox" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} /> Uso único
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setStage('confirmSave')}>Voltar</Button>
              <Button onClick={handleGenerate} className="inline-flex items-center gap-2">
                Gerar link
                {shareProject.isPending && <LoaderCircle className="size-[1em] animate-spin" />}
              </Button>
            </div>
          </div>
        )}

        {stage === "result" && (
          <div className="py-2">
            {resultLink && (
              <div className="flex flex-col gap-2">
                <Input readOnly value={resultLink} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(resultLink); toast({ title: 'Link copiado para a área de transferência.' }); }}>Copiar</Button>
                  <Button onClick={() => { setOpen(false); setStage('confirmSave'); setResultLink(null); }}>Fechar</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {/* Footer is handled by content sections */}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
