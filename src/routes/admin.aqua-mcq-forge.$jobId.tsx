import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/aqua-mcq-forge/$jobId")({
  component: () => <Outlet />,
});
