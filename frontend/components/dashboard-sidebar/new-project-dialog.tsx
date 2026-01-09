import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAddProject } from "@/lib/mutations/projects";
import ImageSubmissionArea from "../image-submission-area";
import { useSession } from "@/providers/session-provider";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function NewProjectDialog({
  files = [],
  setFiles,
  children,
}: {
  files?: File[];
  setFiles?: (files: File[]) => void;
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  const session = useSession();
  const addProject = useAddProject(session.user._id, session.token);

  function handleCreate() {
    if (imageFiles.length === 0 || name === "") return;

    const names = new Set<string>();
    const hasDuplicateNames = imageFiles.some((file) => {
      if (names.has(file.name)) return true;
      names.add(file.name);
      return false;
    });

    if (hasDuplicateNames) {
      toast({
        title: "Duplicate image names are not allowed.",
        description:
          "Please remove or rename images so that each filename is unique.",
        variant: "destructive",
      });
      return;
    }

    addProject.mutate(
      {
        uid: session.user._id,
        token: session.token,
        name: name,
        images: imageFiles,
      },
      {
        onSuccess: (project) => {
          setOpen(false);
          toast({
            title: "Project created successfully.",
          });
          // Navigate to new project without shareToken
          if (project) router.push(`/dashboard/${project._id}`);
        },
        onError: (error: any) => {
          const backendMessage =
            error?.response?.data && typeof error.response.data === "string"
              ? error.response.data
              : undefined;

          toast({
            title: "Ups! An error occurred.",
            description: backendMessage ?? error.message,
            variant: "destructive",
          });
        },
      },
    );
  }

  useEffect(() => {
    if (files.length > 0) {
      setOpen(true);
    }
  }, [files]);

  useEffect(() => {
    setName("");
    setImageFiles([]);
    if (setFiles && open === false) setFiles([]);
  }, [open, setFiles]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <Label htmlFor="project-name">Project Name</Label>
        <Input
          id="project-name"
          placeholder="Enter project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ImageSubmissionArea
          onDrop={(files) => setImageFiles(files)}
          receivedFiles={files}
        />
        <DialogFooter>
          <Button
            onClick={() => handleCreate()}
            disabled={imageFiles.length <= 0 || name === ""}
            className="inline-flex items-center gap-1"
          >
            <span>Create</span>
            {addProject.isPending && (
              <LoaderCircle className="size-[1em] animate-spin" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
