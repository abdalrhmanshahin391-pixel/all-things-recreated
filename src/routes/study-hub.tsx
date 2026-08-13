import { Outlet, createFileRoute } from "@tanstack/react-router";

function StudyHubLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/study-hub")({
  component: StudyHubLayout,
});
