import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5"><Card className="w-full max-w-md"><CardHeader><p className="text-sm font-semibold text-indigo-600">VerifiLab</p><h1 className="mt-1 text-2xl font-bold">Sign in</h1><p className="mt-2 text-sm text-slate-500">Use the username and password issued by your administrator.</p></CardHeader><CardContent><LoginForm /></CardContent></Card></main>;
}
