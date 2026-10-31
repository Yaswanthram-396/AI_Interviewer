import { redirect } from "next/navigation";

/** Legacy route: interviews now live in the candidate and admin portals. */
export default function LegacyInterviewsRedirect() {
  redirect("/candidate");
}
