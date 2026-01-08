import { useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchProject,
  getProjectImages,
  ProjectImage,
  fetchProjectResults,
  fetchSharedProjectResults,
} from "../projects";
import { io } from "socket.io-client";

export const useGetProjects = (uid: string, token: string) => {
  return useQuery({
    queryKey: ["projects", uid, token],
    queryFn: () => fetchProjects(uid, token),
  });
};

export const useGetProject = (uid: string, pid: string, token: string) => {
  return useQuery({
    queryKey: ["project", uid, pid, token],
    queryFn: () => fetchProject(uid, pid, token),
    enabled: !!uid,
  });
};

export const useGetProjectImages = (
  uid: string,
  pid: string,
  token: string,
  initialData?: ProjectImage[],
) => {
  return useQuery({
    queryKey: ["projectImages", uid, pid, token],
    queryFn: () => getProjectImages(uid, pid, token),
    initialData: initialData,
    enabled: !!uid,
  });
};

export const useGetSocket = (token: string, roomId?: string, shareToken?: string) => {
  return useQuery({
    queryKey: ["socket", token, roomId, shareToken],
    queryFn: () =>
      io("http://localhost:8080", {
        auth: {
          token: token,
          roomId: roomId,
          shareToken: shareToken, // Observer Pattern: Pass shareToken for subscription
        },
      }),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

export const useGetProjectResults = (
  uid: string,
  pid: string,
  token: string,
) => {
  return useQuery({
    queryKey: ["projectResults", uid, pid, token],
    queryFn: () => fetchProjectResults(uid, pid, token),
    enabled: !!uid,
  });
};

export const useGetSharedProjectResults = (shareToken: string | null) => {
  return useQuery({
    queryKey: ["sharedProjectResults", shareToken],
    queryFn: () => fetchSharedProjectResults(shareToken as string),
    enabled: !!shareToken,
  });
};
