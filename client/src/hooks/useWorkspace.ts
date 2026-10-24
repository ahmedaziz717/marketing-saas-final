import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { selectedWorkspace } from "@/lib/workspaceSelection";
export function useWorkspace() {
  const { user } = useAuth();
  const query = trpc.workspace.mine.useQuery();
  const workspaces = query.data ?? [];
  // A saved preference never grants access: select only a current membership.
  const preferred = selectedWorkspace(user?.id);
  const current =
    workspaces.find(w => w.organization.id === preferred) ??
    workspaces[0] ??
    null;
  return {
    ...query,
    workspaces,
    current,
    organizationId: current?.organization.id,
    organization: current?.organization,
    membership: current?.membership,
  };
}
