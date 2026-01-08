"use client";

import { Download, LoaderCircle, OctagonAlert, Play } from "lucide-react";
import { ProjectImageList } from "@/components/project-page/project-image-list";
import { ViewToggle } from "@/components/project-page/view-toggle";
import { AddImagesDialog } from "@/components/project-page/add-images-dialog";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/toolbar/toolbar";
import {
  useGetProject,
  useGetProjectResults,
  useGetSocket,
} from "@/lib/queries/projects";
import Loading from "@/components/loading";
import { ProjectProvider } from "@/providers/project-provider";
import { use, useEffect, useLayoutEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSession } from "@/providers/session-provider";
import {
  useDownloadProject,
  useDownloadProjectResults,
  useProcessProject,
  useCancelProjectProcessing,
} from "@/lib/mutations/projects";
import { useToast } from "@/hooks/use-toast";
import { ProjectImage } from "@/lib/projects";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Transition } from "@headlessui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/axios";
import { useQueryClient } from "@tanstack/react-query";
import { ModeToggle } from "@/components/project-page/mode-toggle";
import ShareModal from "@/components/project-page/share-modal";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Project({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const resolvedParams = use(params);
  const session = useSession();
  const { pid } = resolvedParams;
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("shareToken");
  const project = useGetProject(shareToken ? "" : session.user._id, pid, session.token);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [sharedProject, setSharedProject] = useState<any | null>(null);
  const [sharedOwner, setSharedOwner] = useState<string | null>(null);
  const [sharedPermission, setSharedPermission] = useState<"view" | "edit" | null>(null);
  const downloadProjectImages = useDownloadProject();
  const processProject = useProcessProject();
  const cancelProjectProcessing = useCancelProjectProcessing();
  const downloadProjectResults = useDownloadProjectResults();
  const { toast } = useToast();
  const socket = useGetSocket(session.token);
  const view = searchParams.get("view") ?? "grid";
  const mode = searchParams.get("mode") ?? "edit";
  const router = useRouter();
  const path = usePathname();
  const sidebar = useSidebar();
  const isMobile = useIsMobile();
  const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingSteps, setProcessingSteps] = useState<number>(1);
  const [waitingForPreview, setWaitingForPreview] = useState<string>("");

  const totalProcessingSteps =
    ((project.data?.tools?.length ?? 0) * (project.data?.imgs?.length ?? 0));
  const projectResults = useGetProjectResults(shareToken ? "" : session.user._id, pid, session.token);

  useEffect(() => {
    if (!shareToken) return;
    setSharedLoading(true);
    api
      .get(`/projects/share/project?token=${encodeURIComponent(shareToken)}`)
      .then((resp) => {
        setSharedProject(resp.data.project);
        setSharedPermission(resp.data.permission);
        setSharedOwner(resp.data.owner ?? null);
        setSharedLoading(false);
      })
      .catch((err) => {
        setSharedError(err?.response?.data?.error || err.message || "Erro ao carregar projeto partilhado");
        setSharedLoading(false);
      });
  }, [shareToken]);
  const qc = useQueryClient();

  useLayoutEffect(() => {
    if (
      !["edit", "results"].includes(mode) ||
      !["grid", "carousel"].includes(view)
    ) {
      router.replace(path);
    }
  }, [mode, view, path, router, projectResults.data]);

  useEffect(() => {
    function onProcessUpdate() {
      if (!processing) return;
      setProcessingSteps((prev) => prev + 1);

      const progress = Math.min(
        Math.round((processingSteps * 100) / totalProcessingSteps),
        100,
      );

      setProcessingProgress(progress);
      if (processingSteps >= totalProcessingSteps) {
        setTimeout(() => {
          projectResults.refetch().then(() => {
            setProcessing(false);
            if (!isMobile) sidebar.setOpen(true);
            setProcessingProgress(0);
            setProcessingSteps(1);
            router.push("?mode=results&view=grid");
          });
        }, 2000);
      }
    }

    let active = true;

    const handler = () => {
      if (active) onProcessUpdate();
    };

    if (socket.data) {
      socket.data.on("process-update", handler);
    }

    return () => {
      active = false;
      if (socket.data) socket.data.off("process-update", handler);
    };
  }, [
    pid,
    processing,
    processingSteps,
    router,
    session.token,
    session.user._id,
    socket.data,
    totalProcessingSteps,
    sidebar,
    isMobile,
    projectResults,
  ]);

  if (shareToken) {
    if (sharedLoading)
      return (
        <div className="flex justify-center items-center h-screen">
          <Loading />
        </div>
      );

    if (sharedError)
      return (
        <div className="flex size-full justify-center items-center h-screen p-8">
          <Alert variant="destructive" className="w-fit max-w-[40rem] text-wrap truncate">
            <OctagonAlert className="size-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{sharedError}</AlertDescription>
          </Alert>
        </div>
      );
  }

  if (project.isError)
    return (
      <div className="flex size-full justify-center items-center h-screen p-8">
        <Alert
          variant="destructive"
          className="w-fit max-w-[40rem] text-wrap truncate"
        >
          <OctagonAlert className="size-4" />
          <AlertTitle>{project.error.name}</AlertTitle>
          <AlertDescription>{project.error.message}</AlertDescription>
        </Alert>
      </div>
    );

  if (
    (!shareToken && (project.isLoading || !project.data || projectResults.isLoading || !projectResults.data))
  )
    return (
      <div className="flex justify-center items-center h-screen">
        <Loading />
      </div>
    );
  // Normalize project object given to ProjectProvider so code can safely assume
  // `tools` and `imgs` are arrays (avoid runtime `cannot read property 'tools' of null`).
  const currentProjectData = shareToken
    ? {
      ...(sharedProject || {}),
      // ensure user_id is set to owner so downstream hooks call the correct uid
      user_id: sharedOwner ?? sharedProject?.user_id ?? null,
      tools: sharedProject?.tools ?? [],
      imgs: sharedProject?.imgs ?? [],
    }
    : {
      ...(project.data || {}),
      tools: project.data?.tools ?? [],
      imgs: project.data?.imgs ?? [],
    };

  const currentProjectResults = shareToken
    ? { imgs: currentProjectData.imgs ?? [], texts: [] }
    : projectResults.data ?? { imgs: [], texts: [] };

  return (
    <ProjectProvider
      project={currentProjectData}
      currentImage={currentImage}
      preview={{ waiting: waitingForPreview, setWaiting: setWaitingForPreview }}
    >
      <div className="flex flex-col h-screen relative">
        {/* Header */}
        <div className="flex flex-col xl:flex-row justify-center items-start xl:items-center xl:justify-between border-b border-sidebar-border py-2 px-2 md:px-3 xl:px-4 h-fit gap-2">
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <h1 className="text-lg font-semibold truncate">
              {currentProjectData?.name}
            </h1>
            <div className="flex items-center gap-2 xl:hidden">
              <ViewToggle />
              <ModeToggle />
            </div>
          </div>
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <SidebarTrigger variant="outline" className="h-9 w-10 lg:hidden" />
            <div className="flex items-center gap-2 flex-wrap justify-end xl:justify-normal w-full xl:w-auto">
              {mode !== "results" && (
                <>
                  <Button
                    disabled={
                      currentProjectData.tools?.length <= 0 || waitingForPreview !== ""
                    }
                    className="inline-flex"
                    onClick={() => {
                      const effectiveUid = shareToken ? (sharedOwner ?? session.user._id) : session.user._id;
                      processProject.mutate(
                        {
                          uid: effectiveUid,
                          pid: currentProjectData._id,
                          token: shareToken ? (sharedPermission ? (shareToken ?? session.token) : (shareToken ?? session.token)) : session.token,
                        },
                        {
                          onSuccess: () => {
                            setProcessing(true);
                            sidebar.setOpen(false);
                          },
                          onError: (error) =>
                            toast({
                              title: "Ups! An error occurred.",
                              description: error.message,
                              variant: "destructive",
                            }),
                        },
                      );
                    }}
                  >
                    <Play /> Apply
                  </Button>
                  {/* Hide add images when viewing a shared project with view-only permission */}
                  {!(shareToken && sharedPermission === "view") && <AddImagesDialog />}
                </>
              )}
              <Button
                variant="outline"
                className="px-3"
                title="Download project"
                onClick={() => {
                  (mode === "edit"
                    ? downloadProjectImages
                    : downloadProjectResults
                  ).mutate(
                    {
                      uid: shareToken ? (sharedOwner ?? session.user._id) : session.user._id,
                      pid: currentProjectData._id,
                      token: shareToken ?? session.token,
                      projectName: currentProjectData?.name,
                    },
                    {
                      onSuccess: () => {
                        toast({
                          title: `Project ${currentProjectData?.name} downloaded.`,
                        });
                      },
                    },
                  );
                }}
              >
                {(mode === "edit"
                  ? downloadProjectImages
                  : downloadProjectResults
                ).isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Download />
                )}
              </Button>
              <div className="hidden xl:flex items-center gap-2">
                <ViewToggle />
                <ModeToggle />
                <ShareModal />
              </div>
            </div>
          </div>
        </div>
        {/* Main Content */}
        <div className="h-full overflow-x-hidden flex">
          {mode !== "results" && !(shareToken && sharedPermission === "view") && <Toolbar />}
          <ProjectImageList setCurrentImageId={setCurrentImage} results={currentProjectResults} />
        </div>
      </div>
      <Transition
        show={processing}
        enter="transition-opacity ease-in duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity ease-out duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="absolute top-0 left-0 h-screen w-screen bg-black/70 z-50 flex justify-center items-center">
          <Card className="p-4 flex flex-col justify-center items-center gap-4">
            <div className="flex gap-2 items-center text-lg font-semibold">
              <h1>Processing</h1>
              <LoaderCircle className="size-[1em] animate-spin" />
            </div>
            <Progress value={processingProgress} className="w-96" />
            <Button
              variant="outline"
              onClick={() => {
                const effectiveUid = shareToken
                  ? (sharedOwner ?? session.user._id)
                  : session.user._id;

                cancelProjectProcessing.mutate(
                  {
                    uid: effectiveUid,
                    pid: currentProjectData._id,
                    token: shareToken ?? session.token,
                  },
                  {
                    onSuccess: () => {
                      setProcessing(false);
                      if (!isMobile) sidebar.setOpen(true);
                      setProcessingProgress(0);
                      setProcessingSteps(1);
                      toast({ title: "Processing cancelled." });
                    },
                    onError: (error) =>
                      toast({
                        title: "Ups! An error occurred.",
                        description: error.message,
                        variant: "destructive",
                      }),
                  },
                );
              }}
            >
              Cancel
            </Button>
          </Card>
        </div>
      </Transition>
    </ProjectProvider>
  );
}
