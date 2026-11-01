import { EventEmitter } from "node:events";
import https from "node:https";
import { lookup } from "node:dns/promises";
import type { ClientRequest, IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetchText, assertPublicUrl } from "./lib/websiteCrawler";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.215.14", family: 4 }]),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockRemoteResponse(send: (response: EventEmitter) => void) {
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: { "content-type": "text/html" },
  });
  const request = new EventEmitter() as ClientRequest;
  request.destroy = vi.fn((error?: Error) => {
    if (error) request.emit("error", error);
    request.emit("close");
    return request;
  });
  vi.spyOn(https, "request").mockImplementation(((
    _options: unknown,
    callback: (response: IncomingMessage) => void
  ) => {
    request.end = vi.fn(() => {
      callback(response as IncomingMessage);
      send(response);
      return request;
    }) as ClientRequest["end"];
    return request;
  }) as typeof https.request);
  return request;
}

describe("interrupted remote website responses", () => {
  it("rejects a reset response without emitting an uncaught process error", async () => {
    mockRemoteResponse(response => {
      response.emit("data", Buffer.from("<html>"));
      response.emit("error", new Error("connection reset"));
      response.emit("aborted");
    });
    await expect(
      safeFetchText("https://shop.example.test/products/test")
    ).rejects.toThrow("connection reset");
  });

  it("bounds total request duration even while the remote server keeps streaming", async () => {
    vi.useFakeTimers();
    const request = mockRemoteResponse(response => {
      response.emit("data", Buffer.from("<html>"));
    });
    const pending = expect(
      safeFetchText("https://shop.example.test/products/test")
    ).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_001);
    await pending;
    expect(request.destroy).toHaveBeenCalled();
  });
});

describe("website redirect safety", () => {
  function routeResponse(
    route: (path: string) => {
      status: number;
      location?: string;
      body?: string;
    }
  ) {
    return vi.spyOn(https, "request").mockImplementation(((
      options: { path: string },
      callback: (response: IncomingMessage) => void
    ) => {
      const result = route(options.path);
      const response = Object.assign(new EventEmitter(), {
        statusCode: result.status,
        headers: { "content-type": "text/html", location: result.location },
      });
      const request = new EventEmitter() as ClientRequest;
      request.destroy = vi.fn(() => request);
      request.end = vi.fn(() => {
        callback(response as IncomingMessage);
        response.emit("data", Buffer.from(result.body ?? ""));
        response.emit("end");
        return request;
      }) as ClientRequest["end"];
      return request;
    }) as typeof https.request);
  }
  it("follows a canonical trailing-slash redirect without removing the slash again", async () => {
    const request = routeResponse(path =>
      path === "/homeschool-style-quiz"
        ? { status: 301, location: "/homeschool-style-quiz/" }
        : { status: 200, body: "<h1>Homeschool style quiz</h1>" }
    );
    const page = await safeFetchText(
      "https://learn.example.test/homeschool-style-quiz"
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(page.finalUrl).toBe(
      "https://learn.example.test/homeschool-style-quiz/"
    );
    expect(page.text).toContain("Homeschool style quiz");
  });
  it("preserves the exact query order and trailing slash for requests", async () => {
    const { url } = await assertPublicUrl(
      "https://example.test/path/?b=2&a=1#top"
    );
    expect(url.href).toBe("https://example.test/path/?b=2&a=1");
  });
  it("still bounds genuine redirect loops and rejects another site", async () => {
    routeResponse(() => ({ status: 301, location: "/loop/" }));
    await expect(safeFetchText("https://example.test/loop/")).rejects.toThrow(
      "too many times"
    );
    vi.restoreAllMocks();
    routeResponse(() => ({ status: 302, location: "https://foreign.test/" }));
    await expect(safeFetchText("https://example.test/")).rejects.toThrow(
      "site boundary"
    );
  });
  it("rechecks DNS before following a same-site redirect", async () => {
    const request = routeResponse(() => ({
      status: 302,
      location: "https://internal.example.test/",
    }));
    vi.mocked(lookup)
      .mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }] as any)
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as any);
    await expect(safeFetchText("https://example.test/")).rejects.toThrow(
      "private, local, or reserved"
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
});
