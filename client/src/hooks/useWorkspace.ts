import { trpc } from "@/lib/trpc";
export function useWorkspace() { const query = trpc.workspace.mine.useQuery(); const current = query.data?.[0] ?? null; return { ...query, current, organizationId: current?.organization.id, organization: current?.organization, membership: current?.membership }; }
