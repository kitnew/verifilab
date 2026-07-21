import type { TaskStatus } from "@/lib/review";

export type WorkTask = {
  id: string;
  status: TaskStatus;
  assignedAuthorId: string | null;
  assignedReviewerId: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
};

export function myWorkSections<T extends WorkTask>(tasks: T[], userId: string, now = new Date()) {
  const incomplete = (task: T) => !["APPROVED", "REJECTED"].includes(task.status);
  return {
    authoring: tasks.filter((task) => task.assignedAuthorId === userId && ["DRAFT", "IN_PROGRESS"].includes(task.status)),
    review: tasks.filter((task) => task.assignedReviewerId === userId && task.status === "IN_REVIEW"),
    changes: tasks.filter((task) => task.assignedAuthorId === userId && task.status === "CHANGES_REQUESTED"),
    overdue: tasks.filter((task) => (task.assignedAuthorId === userId || task.assignedReviewerId === userId) && incomplete(task) && task.dueDate !== null && task.dueDate < now),
    completed: tasks.filter((task) => (task.assignedAuthorId === userId || task.assignedReviewerId === userId) && task.completedAt !== null).sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime()),
  };
}
