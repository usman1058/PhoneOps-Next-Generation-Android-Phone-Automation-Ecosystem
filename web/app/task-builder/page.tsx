import TaskBuilderForm from "@/components/TaskBuilderForm";

function firstParam(value?: string | string[]): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function TaskBuilderPage({
  searchParams,
}: {
  searchParams?: { taskId?: string | string[] };
}) {
  return (
    <div className="container">
      <TaskBuilderForm
        title="Task Builder"
        description="Record clicks on the phone over Wi-Fi or mobile data, edit the captured steps, and save a task that can run manually or on a schedule."
        saveLabel="Save task"
        taskId={firstParam(searchParams?.taskId)}
      />
    </div>
  );
}
