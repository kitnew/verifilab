export const roles = ["AUTHOR", "REVIEWER", "CURATOR", "ADMIN"] as const;
export type Role = (typeof roles)[number];
export type TaskStatus = "DRAFT" | "IN_PROGRESS" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";
export type ReviewAction = "START" | "SUBMIT" | "REQUEST_CHANGES" | "APPROVE" | "REJECT";
export type Permission = "CREATE_TASK" | "EDIT_TASK" | "DELETE_TASK" | "SUBMIT_TASK" | "REVIEW_TASK" | "COMMENT" | "ASSIGN_TASK" | "CREATE_RELEASE" | "MANAGE_MEMBERS";

const permissions: Record<Role, Permission[]> = {
  AUTHOR: ["CREATE_TASK", "EDIT_TASK", "DELETE_TASK", "SUBMIT_TASK"],
  REVIEWER: ["REVIEW_TASK", "COMMENT"],
  CURATOR: ["CREATE_TASK", "EDIT_TASK", "DELETE_TASK", "SUBMIT_TASK", "REVIEW_TASK", "COMMENT", "ASSIGN_TASK", "CREATE_RELEASE"],
  ADMIN: ["CREATE_TASK", "EDIT_TASK", "DELETE_TASK", "SUBMIT_TASK", "REVIEW_TASK", "COMMENT", "ASSIGN_TASK", "CREATE_RELEASE", "MANAGE_MEMBERS"],
};

const transitions: Record<TaskStatus, Partial<Record<ReviewAction, { to: TaskStatus; permission: Permission }>>> = {
  DRAFT: { START: { to: "IN_PROGRESS", permission: "EDIT_TASK" } },
  IN_PROGRESS: { SUBMIT: { to: "IN_REVIEW", permission: "SUBMIT_TASK" } },
  IN_REVIEW: {
    REQUEST_CHANGES: { to: "CHANGES_REQUESTED", permission: "REVIEW_TASK" },
    APPROVE: { to: "APPROVED", permission: "REVIEW_TASK" },
    REJECT: { to: "REJECTED", permission: "REVIEW_TASK" },
  },
  CHANGES_REQUESTED: { START: { to: "IN_PROGRESS", permission: "EDIT_TASK" } },
  APPROVED: {},
  REJECTED: {},
};

export function can(role: Role | null | undefined, permission: Permission) {
  return role ? permissions[role].includes(permission) : false;
}

export function reviewTransition(status: TaskStatus, action: ReviewAction, role: Role, comment = "") {
  const transition = transitions[status][action];
  if (!transition) return { ok: false as const, error: `Cannot ${action.toLowerCase().replaceAll("_", " ")} a task with status ${status}.` };
  if (!can(role, transition.permission)) return { ok: false as const, error: `${role} does not have permission to ${action.toLowerCase().replaceAll("_", " ")} this task.` };
  const normalizedComment = comment.trim();
  if (["REQUEST_CHANGES", "REJECT"].includes(action) && !normalizedComment) return { ok: false as const, error: "A review comment is required." };
  return { ok: true as const, nextStatus: transition.to, comment: normalizedComment };
}

export function canEditAssignedTask(role: Role, userId: string, assignedAuthorId: string | null) {
  return role === "ADMIN" || role === "CURATOR" || role === "AUTHOR" && assignedAuthorId === userId;
}

export function canReviewAssignedTask(role: Role, userId: string, assignedAuthorId: string | null, assignedReviewerId: string | null) {
  if (assignedAuthorId === userId) return false;
  return role === "ADMIN" || role === "CURATOR" || role === "REVIEWER" && assignedReviewerId === userId;
}
