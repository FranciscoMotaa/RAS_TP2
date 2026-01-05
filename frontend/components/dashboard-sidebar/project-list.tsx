import { Skeleton } from "../ui/skeleton";
import {
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
} from "../ui/sidebar";
import ProjectItem from "./project-item";
import { useSession } from "@/providers/session-provider";
import { useGetProjects } from "@/lib/queries/projects";
import { Search } from "lucide-react";
import { Button } from "../ui/button";
import { useEffect, useState } from "react";
import { Transition } from "@headlessui/react";
import { Project } from "@/lib/projects";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/axios";

export default function ProjectList() {
  const session = useSession();
  const projects = useGetProjects(session.user._id, session.token);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shareToken = searchParams.get("shareToken");
  const [sharedProject, setSharedProject] = useState<Project | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredProjects, setFilteredProjects] = useState<Project[]>(
    projects.data || [],
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (projects.data) {
      setFilteredProjects(
        projects.data.filter((p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      );
      setLastUpdated(new Date());
    }
  }, [searchQuery, projects.data]);

  useEffect(() => {
    // Fetch the shared project when arriving via shareToken so it shows in the list
    if (!shareToken) {
      setSharedProject(null);
      return;
    }

    api
      .get(`/projects/share/project?token=${encodeURIComponent(shareToken)}`)
      .then((resp) => {
        if (resp.status === 200 && resp.data?.project) {
          const p = resp.data.project;
          setSharedProject({
            _id: p._id,
            name: p.name,
            user_id: resp.data.owner ?? p.user_id,
          });
        }
      })
      .catch(() => {
        setSharedProject(null);
      });
  }, [shareToken]);

  useEffect(() => {
    if (searchOpen) {
      const i = setInterval(() => {
        if (lastUpdated) {
          const now = new Date();
          const diffSecs = (now.getTime() - lastUpdated.getTime()) / 1000;
          if (diffSecs > 5 && searchQuery === "") {
            setSearchOpen(false);
            setLastUpdated(null);
          }
        }
      }, 1000);
      return () => clearInterval(i);
    }
  }, [searchQuery, lastUpdated, searchOpen]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex justify-between items-center">
        <span>Your projects</span>
        <Button
          variant="ghost"
          className="size-fit p-1"
          onClick={() => {
            setSearchOpen(!searchOpen);
            // if (inputRef.current) inputRef.current.focus();
            if (searchOpen) setLastUpdated(null);
            else setLastUpdated(new Date());
          }}
        >
          <Search className="size-[1em]" />
        </Button>
      </SidebarGroupLabel>
      {projects.data && projects.data.length > 0 && (
        <Transition
          show={searchOpen}
          enter="transition-opacity duration-500"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-500"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 bg-sidebar-accent text-sidebar-accent-foreground h-6 rounded-md text-sm active:outline-none focus:outline-none mb-2"
          />
        </Transition>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {sharedProject && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`/dashboard/${sharedProject._id}`)}
                className="h-fit py-1 flex items-center justify-between"
              >
                <a href={`/dashboard/${sharedProject._id}?shareToken=${encodeURIComponent(shareToken ?? "")}`}>
                  <span>{sharedProject.name}</span>
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Shared
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!projects.isLoading &&
            projects.data &&
            (filteredProjects.length > 0
              ? filteredProjects.map((p) => <ProjectItem key={p._id} p={p} />)
              : projects.data.length > 0 && (
                  <SidebarMenuItem>
                    <span className="pl-2">No search results.</span>
                  </SidebarMenuItem>
                ))}
          {projects.isLoading && (
            <SidebarMenuItem className="flex flex-col gap-2 px-2 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton className="w-full h-5" key={i} />
              ))}
            </SidebarMenuItem>
          )}
          {projects.data && projects.data.length === 0 && (
            <SidebarMenuItem>
              <span className="pl-2">Empty for now.</span>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
