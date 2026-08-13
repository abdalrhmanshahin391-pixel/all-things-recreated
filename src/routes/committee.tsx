import { Outlet, createFileRoute } from "@tanstack/react-router";
import { OrientationTip } from "@/components/committee/OrientationTip";

function CommitteeLayout() {
  return (
    <>
      <OrientationTip />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute("/committee")({
  component: CommitteeLayout,
});
