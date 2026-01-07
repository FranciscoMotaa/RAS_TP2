import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useClearProjectTools } from "@/lib/mutations/projects";
import { useSession } from "@/providers/session-provider";
import { useProjectInfo } from "@/providers/project-provider";
import { Button } from "../ui/button";
import { Eraser, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

// 1. DND Kit Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 2. Import all your Tool Components
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

// 3. Sortable Wrapper Component
function SortableToolItem({ id, Component, disabled }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group flex items-center">
      {/* Visual handle that appears on hover */}
      <div 
        {...attributes} 
        {...listeners} 
        className="absolute -left-4 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-gray-400"
      >
        <GripVertical size={14} />
      </div>
      <Component disabled={disabled} />
    </div>
  );
}

export function Toolbar() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "grid";
  const disabled = false; // Tools are now always enabled, applying to all images when no image is selected
  const project = useProjectInfo();
  const session = useSession();
  const [open, setOpen] = useState<boolean>(false);

  // 4. Initial Tool Order State
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
    { id: "bg-removal", Component: BgRemovalAITool },
    { id: "ai-crop", Component: CropAITool },
    { id: "object-ai", Component: ObjectAITool },
    { id: "people-ai", Component: PeopleAITool },
    { id: "text-ai", Component: TextAITool },
    { id: "upgrade-ai", Component: UpgradeAITool },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setToolOrder((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const clearTools = useClearProjectTools(
    session.user._id,
    project._id,
    session.token,
  );

  return (
    <div className="flex h-full w-14 flex-col justify-between items-center border-r bg-background p-2">
      <div className="flex flex-col gap-2 items-center w-full">
        <span className="text-[10px] font-bold uppercase text-gray-400 mb-2">Tools</span>
        
        {/* 5. DND Context wrapper */}
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter} 
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={toolOrder.map(t => t.id)} 
            strategy={verticalListSortingStrategy}
          >
            {toolOrder.map((tool) => (
              <SortableToolItem 
                key={tool.id} 
                id={tool.id} 
                Component={tool.Component} 
                disabled={disabled} 
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* ... rest of your existing Dialog code remains exactly the same ... */}
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