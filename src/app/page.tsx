import { redirect } from "next/navigation";
import { getLiveSession } from "@/lib/session";

export default async function Home() {
  const session = await getLiveSession();
  redirect(session ? "/dashboard" : "/login");
}
