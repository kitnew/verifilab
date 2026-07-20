import { cookies } from "next/headers";
import { roles, type Role } from "./review";

const COOKIE_NAME = "verifilab-role";

export async function getDemoRole(): Promise<Role> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  return roles.includes(value as Role) ? value as Role : "AUTHOR";
}

export { COOKIE_NAME };
