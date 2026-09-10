import { redirect } from "next/navigation";
import { getLiveSession } from "@/lib/api-server";

export default async function Home() {
  const session = await getLiveSession();
  redirect(session ? "/dashboard" : "/login");
}
