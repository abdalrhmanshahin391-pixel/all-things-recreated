import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/lectures/$courseId")({
  component: () => <Outlet />,
});
