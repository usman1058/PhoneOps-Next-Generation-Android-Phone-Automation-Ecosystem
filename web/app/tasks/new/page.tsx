import TaskBuilderForm from "@/components/TaskBuilderForm";

function firstParam(value?: string | string[]): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function NewTaskPage({
  searchParams,
}: {
  searchParams?: { taskId?: string | string[] };
}) {
  return (
    <div className="container">
      <TaskBuilderForm
        title="New task"
        description="Build a new automation from scratch or record the clicks directly from the phone without a cable."
        saveLabel="Create task"
        taskId={firstParam(searchParams?.taskId)}
      />
    </div>
  );
}
