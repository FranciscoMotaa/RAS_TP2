import BrightnessTool from "./brightness-tool";
import ContrastTool from "./contrast-tool";
import CropTool from "./crop-tool";
import ResizeTool from "./resize-tool";
import RotateTool from "./rotate-tool";
import SaturationTool from "./saturation-tool";
import BorderTool from "./border-tool";
import BinarizationTool from "./binarization-tool";
import WatermarkTool from "./watermark-tool";
import CropAITool from "./ai-crop-tool";
import BgRemovalAITool from "./ai-bg-removal";
import ObjectAITool from "./object-ai-tool";
import PeopleAITool from "./people-ai-tool";
import TextAITool from "./text-ai-tool";
import UpgradeAITool from "./upgrade-ai-tool";
import { useClearProjectTools } from "@/lib/mutations/projects";
import { useSession } from "@/providers/session-provider";
import { useProjectInfo } from "@/providers/project-provider";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Eraser } from "lucide-react";
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ComponentType } from "react";

type SortableToolItemProps = {
  id: string;
  Component: ComponentType<{ disabled: boolean }>;
  disabled: boolean;
};

function SortableToolItem({ id, Component, disabled }: SortableToolItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group flex items-center">
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-2 h-8 flex items-center opacity-0 group-hover:opacity-100 text-gray-400 cursor-grab select-none"
        aria-label="Reorder tool"
      >
        :::
      </div>
      <Component disabled={disabled} />
    </div>
  );
}

export function Toolbar() {
  const disabled = false;
  const project = useProjectInfo();
  const session = useSession();

  const [open, setOpen] = useState<boolean>(false);
  const [toolOrder, setToolOrder] = useState([
    { id: "brightness", Component: BrightnessTool },
    { id: "contrast", Component: ContrastTool },
    { id: "saturation", Component: SaturationTool },
    { id: "binarization", Component: BinarizationTool },
    { id: "rotate", Component: RotateTool },
    { id: "crop", Component: CropTool },
    { id: "resize", Component: ResizeTool },
    { id: "border", Component: BorderTool },
    { id: "watermark", Component: WatermarkTool },
    { id: "bgRemovalAI", Component: BgRemovalAITool },
    { id: "cropAI", Component: CropAITool },
    { id: "objectAI", Component: ObjectAITool },
    { id: "peopleAI", Component: PeopleAITool },
    { id: "textAI", Component: TextAITool },
    { id: "upgradeAI", Component: UpgradeAITool },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const clearTools = useClearProjectTools(
    session.user._id,
    project._id,
    session.token,
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setToolOrder((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  return (
    <div className="flex h-full w-14 flex-col justify-between items-center border-r bg-background p-2">
      <div className="flex flex-col gap-2 items-center w-full">
        <span className="text-[10px] font-bold uppercase text-gray-400 mb-2">Tools</span>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={toolOrder} strategy={verticalListSortingStrategy}>
            {toolOrder.map(({ id, Component }) => (
              <SortableToolItem
                key={id}
                id={id}
                Component={Component}
                disabled={disabled}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="text-red-400 size-8"
            disabled={project.tools.length === 0}
          >
            <Eraser />
          </Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Clear Tools?</DialogTitle>
            <DialogDescription>
              This will remove <b>all</b> edits from the current project.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                clearTools.mutate({
                  uid: session.user._id,
                  pid: project._id,
                  toolIds: project.tools.map((t) => t._id),
                  token: session.token,
                });
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
