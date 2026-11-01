// Local browser fixture only; every mutation is a recorder, never an API call.
const state = () => (window as any).__overlayFixture;
export const trpc = {
  assetLibrary: { studioList: { useQuery: () => ({ data: [] }) } },
  creativeBuilder: {
    productOverlay: {
      useQuery: () => ({ data: state().data, dataUpdatedAt: 1 }),
    },
    saveProductOverlay: {
      useMutation: () => ({
        mutateAsync: async (input: unknown) => {
          state().saved.push(input);
          return { key: "creative:fixture" };
        },
      }),
    },
    alignProductOverlay: {
      useMutation: () => ({
        mutateAsync: async () => {
          state().aligned++;
          throw new Error("No paid calls in fixtures");
        },
      }),
    },
  },
};
