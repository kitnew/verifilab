export const roles = ["AUTHOR", "REVIEWER", "ADMIN"] as const;
export type Role = (typeof roles)[number];
export type TaskStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
export type ReviewAction = "SUBMIT" | "APPROVE" | "REJECT" | "REOPEN";
export type Permission = "CREATE_TASK" | "EDIT_TASK" | "DELETE_TASK" | "SUBMIT_TASK" | "APPROVE_TASK" | "REJECT_TASK" | "COMMENT" | "REOPEN_REJECTED" | "REOPEN_APPROVED";

const permissions: Record<Role, Permission[]> = {
  AUTHOR: ["CREATE_TASK", "EDIT_TASK", "DELETE_TASK", "SUBMIT_TASK", "REOPEN_REJECTED"],
  REVIEWER: ["APPROVE_TASK", "REJECT_TASK", "COMMENT"],
  ADMIN: ["CREATE_TASK", "EDIT_TASK", "DELETE_TASK", "SUBMIT_TASK", "APPROVE_TASK", "REJECT_TASK", "COMMENT", "REOPEN_REJECTED", "REOPEN_APPROVED"],
};

const transitions: Record<TaskStatus, Partial<Record<ReviewAction, { to: TaskStatus; permission: Permission }>>> = {
  DRAFT: { SUBMIT: { to: "IN_REVIEW", permission: "SUBMIT_TASK" } },
  IN_REVIEW: {
    APPROVE: { to: "APPROVED", permission: "APPROVE_TASK" },
    REJECT: { to: "REJECTED", permission: "REJECT_TASK" },
  },
  REJECTED: { REOPEN: { to: "DRAFT", permission: "REOPEN_REJECTED" } },
  APPROVED: { REOPEN: { to: "DRAFT", permission: "REOPEN_APPROVED" } },
};

export function can(role: Role, permission: Permission) {
  return permissions[role].includes(permission);
}

export function reviewTransition(status: TaskStatus, action: ReviewAction, role: Role, comment = "") {
  const transition = transitions[status][action];
  if (!transition) return { ok: false as const, error: `Cannot ${action.toLowerCase()} a task with status ${status}.` };
  if (!can(role, transition.permission)) return { ok: false as const, error: `${role} does not have permission to ${action.toLowerCase()} this task.` };
  const normalizedComment = comment.trim();
  if (action === "REJECT" && !normalizedComment) return { ok: false as const, error: "A rejection comment is required." };
  return { ok: true as const, nextStatus: transition.to, comment: normalizedComment };
}
