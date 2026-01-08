"use client";

import { useState, useEffect } from "react";
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
import ImageSubmissionArea from "../image-submission-area";
import { LoaderCircle, Plus } from "lucide-react";
import { useAddProjectImages } from "@/lib/mutations/projects";
import { createBlobUrlFromFile } from "@/lib/utils";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

export function AddImagesDialog() {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setImages([]);
      setImageFiles([]);
    }
  };

  const project = useProjectInfo();
  const { _id: pid, user_id: projectOwnerId } = project;
  const session = useSession();
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("shareToken");

  const ownerId = shareToken ? (projectOwnerId ?? session.user._id) : session.user._id;
  const effectiveToken = shareToken ?? session.token;

  const addImages = useAddProjectImages(
    ownerId,
    pid as string,
    effectiveToken,
  );

  function onDrop(files: File[]) {
    // ImageSubmissionArea already manages its own state and deduplication
    // It passes us the full current list of files
    setImageFiles(files);
  }

  // Generate preview URLs whenever imageFiles changes
  useEffect(() => {
    const generatePreviews = async () => {
      const urls: string[] = [];
      for (const file of imageFiles) {
        const url = await createBlobUrlFromFile(file);
        urls.push(url);
      }
      setImages(urls);
    };

    if (imageFiles.length > 0) {
      generatePreviews();
    } else {
      setImages([]);
    }
  }, [imageFiles]);

  function handleAdd() {
    if (imageFiles.length === 0) return;

    // Prevent multiple submissions while one is pending
    if (addImages.isPending) {
      return;
    }

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

    addImages.mutate(
      {
        uid: ownerId,
        pid: pid as string,
        token: effectiveToken,
        images: imageFiles,
      },
      {
        onSuccess: () => {
          toast({
            title: "Images added successfully.",
          });
          // Invalidate project query to refresh images in the gallery
          // When using shareToken, the query key has empty uid (""), so match that
          const queryUid = shareToken ? "" : ownerId;
          qc.invalidateQueries({
            queryKey: ["project", queryUid, pid, session.token],
          });
          qc.invalidateQueries({
            queryKey: ["projectImages", queryUid, pid, session.token],
          });
          setOpen(false);
          setImages([]);
          setImageFiles([]);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="inline-flex" variant="outline">
          <Plus /> Add Images
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Images</DialogTitle>
          <DialogDescription>
            Add more images to your project.
          </DialogDescription>
        </DialogHeader>
        <ImageSubmissionArea onDrop={onDrop} />
        <DialogFooter>
          <Button
            onClick={handleAdd}
            disabled={images.length === 0}
            className="inline-flex items-center gap-1"
          >
            <span>Add</span>
            {addImages.isPending && (
              <LoaderCircle className="size-[1em] animate-spin" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
