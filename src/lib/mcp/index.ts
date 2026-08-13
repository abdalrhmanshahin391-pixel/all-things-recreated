import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listMyCoursesTool from "./tools/list-my-courses";

// The OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "AquaQBank-academy-mcp",
  title: "AquaQBank academy",
  version: "0.1.0",
  instructions:
    "Tools for AquaQBank academy. Use `whoami` to verify the signed-in user, and `list_my_courses` to see the user's enrolled courses.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listMyCoursesTool],
});
