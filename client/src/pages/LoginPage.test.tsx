// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import LoginPage from "./LoginPage";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("offers password and email link, without an email code field", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<LoginPage />);
  expect(screen.getByLabelText("Password")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Email link" }));
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "user@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Email me a sign-in link" })
  );
  await screen.findByText("Check your email");
  expect(fetcher.mock.calls[0][0]).toBe("/api/auth/email");
  expect(screen.queryByLabelText(/code/i)).toBeNull();
  expect(screen.queryByText(/or enter the code/i)).toBeNull();
});
it("lets existing email-link users request password setup", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<LoginPage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Set or forgot password?" })
  );
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "user@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Email me a password-reset link" })
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(fetcher.mock.calls[0][0]).toBe("/api/auth/password/reset");
});
it("requires matching new passwords before making a request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<LoginPage resetPassword />);
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "first-password-long" },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "other-password-long" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save password & continue" })
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Passwords do not match."
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("signup asks only for email and routes through separate signup endpoint", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<LoginPage signup />);
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "new@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Send verification email" })
  );
  await screen.findByText("Verify your email");
  expect(fetcher.mock.calls[0][0]).toBe("/api/auth/signup");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).password).toBeUndefined();
});
it("shows delivery failure instead of the check email screen", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Email sending is temporarily limited." }),
      })
  );
  render(<LoginPage signup />);
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "new@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Send verification email" })
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Email sending is temporarily limited."
  );
  expect(screen.queryByText("Verify your email")).toBeNull();
});
