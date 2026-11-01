// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  query: vi.fn(),
  result: {} as any,
  refetch: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    googleAds: {
      campaigns: {
        merchantFeedLabels: {
          useQuery: (...args: unknown[]) => {
            f.query(...args);
            return f.result;
          },
        },
        resources: {
          useQuery: () => ({
            data: [
              { id: "123", name: "Merchant 123", type: "Merchant Center" },
              { id: "456", name: "Merchant 456", type: "Merchant Center" },
            ],
          }),
        },
      },
    },
  },
}));
import { GoogleMerchantFeedPicker } from "./GoogleMerchantFeedPicker";
afterEach(cleanup);
beforeEach(() => {
  f.query.mockClear();
  f.refetch.mockClear();
  f.result = {
    data: { labels: ["US", "CA"], limited: false },
    isSuccess: true,
    refetch: f.refetch,
  };
});
const props = {
  organizationId: 7,
  connectionId: "connection",
  merchantId: "123",
  feedLabel: "US",
  onChange: vi.fn(),
};
it("selects actual labels, and clears dependent label when merchant changes or is removed", () => {
  render(<GoogleMerchantFeedPicker {...props} />);
  fireEvent.change(screen.getByLabelText("Product feed label"), {
    target: { value: "CA" },
  });
  expect(props.onChange).toHaveBeenLastCalledWith({ feedLabel: "CA" });
  fireEvent.change(screen.getByLabelText("Add merchant center account"), {
    target: { value: "456" },
  });
  expect(props.onChange).toHaveBeenLastCalledWith({
    merchantId: "456",
    feedLabel: undefined,
  });
  fireEvent.click(screen.getByText("Merchant 123 ×"));
  expect(props.onChange).toHaveBeenLastCalledWith({
    merchantId: undefined,
    feedLabel: undefined,
  });
});
it("disables discovery without merchant, scopes query by account, and preserves saved labels", () => {
  const view = render(
    <GoogleMerchantFeedPicker {...props} merchantId={undefined} />
  );
  expect(
    (screen.getByLabelText("Product feed label") as HTMLSelectElement).disabled
  ).toBe(true);
  expect(f.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ merchantId: "" }),
    expect.objectContaining({ enabled: false })
  );
  view.rerender(
    <GoogleMerchantFeedPicker
      {...props}
      connectionId="other"
      feedLabel="SAVED"
    />
  );
  expect(f.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ connectionId: "other", merchantId: "123" }),
    expect.objectContaining({ enabled: true })
  );
  expect(
    (screen.getByLabelText("Product feed label") as HTMLSelectElement).value
  ).toBe("SAVED");
});
it("shows loading, empty, access error with retry, and partial discovery states", () => {
  f.result = { isLoading: true };
  const view = render(<GoogleMerchantFeedPicker {...props} />);
  expect(screen.getByText("Loading feed labels…")).toBeTruthy();
  f.result = { isSuccess: true, data: { labels: [], limited: false } };
  view.rerender(<GoogleMerchantFeedPicker {...props} />);
  expect(screen.getByRole("status").textContent).toContain(
    "No product feed labels"
  );
  f.result = { error: new Error("Denied"), refetch: f.refetch };
  view.rerender(<GoogleMerchantFeedPicker {...props} />);
  expect(screen.getByRole("alert").textContent).toContain("access");
  fireEvent.click(screen.getByText("Retry"));
  expect(f.refetch).toHaveBeenCalledOnce();
  f.result = { data: { labels: ["US"], limited: true } };
  view.rerender(<GoogleMerchantFeedPicker {...props} />);
  expect(screen.getByRole("status").textContent).toContain("10,000");
});
