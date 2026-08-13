import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/german")({
  component: AdminGermanLayout,
});

function AdminGermanLayout() {
  return <Outlet />;
}