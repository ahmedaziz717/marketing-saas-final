export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function useWorkspace() {
  return {
    organizationId: 1,
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
    user: { name: "Test user", email: "test@example.test" },
    logout: async () => undefined,
  };
}
