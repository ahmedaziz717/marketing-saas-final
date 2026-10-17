export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function useWorkspace() {
  return {
    organizationId: 1,
    organization: { id: 1, name: "Demo workspace" },
    workspaces:
      new URLSearchParams(
        (window as any).__fixtureQuery ?? location.search
      ).get("page") === "platform-admin"
        ? [
            {
              organization: { id: 1, name: "Demo customer account" },
              membership: { role: "owner" },
            },
            {
              organization: { id: 2, name: "Second customer account" },
              membership: { role: "owner" },
            },
          ]
        : [],
    membership: {
      role:
        new URLSearchParams(
          (window as any).__fixtureQuery ?? location.search
        ).get("role") ?? "owner",
    },
  };
}

export function useAuth() {
  return {
    loading: false,
    user: {
      id: 1,
      name: "Test user",
      email: "test@example.test",
      role:
        new URLSearchParams(
          (window as any).__fixtureQuery ?? location.search
        ).get("page") === "platform-admin"
          ? "admin"
          : "user",
    },
    logout: async () => undefined,
  };
}
