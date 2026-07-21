export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { deleteGuestWorkspaces } = await import("@/lib/auth");
    await deleteGuestWorkspaces();
  }
}
