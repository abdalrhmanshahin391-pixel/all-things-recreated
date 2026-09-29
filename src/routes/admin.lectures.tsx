import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/lectures")({
  component: AdminLecturesLayout,
});

function AdminLecturesLayout() {
  return <Outlet />;
}
