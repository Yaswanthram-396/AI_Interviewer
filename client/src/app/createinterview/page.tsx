import { redirect } from "next/navigation";

/** Legacy route: creating an interview is now the admin "Create Interview" workflow. */
export default function LegacyCreateInterviewRedirect() {
  redirect("/admin/interviews/new");
}
