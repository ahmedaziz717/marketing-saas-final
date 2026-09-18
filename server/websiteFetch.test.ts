import { EventEmitter } from "node:events";
import https from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetchText } from "./lib/websiteCrawler";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.215.14", family: 4 }]) }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function mockRemoteResponse(send: (response: EventEmitter) => void) {
  const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "text/html" } });
  const request = new EventEmitter() as ClientRequest;
  request.destroy = vi.fn((error?: Error) => {
    if (error) request.emit("error", error);
    request.emit("close");
    return request;
  });
  vi.spyOn(https, "request").mockImplementation(((_options: unknown, callback: (response: IncomingMessage) => void) => {
    request.end = vi.fn(() => { callback(response as IncomingMessage); send(response); return request; }) as ClientRequest["end"];
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
    await expect(safeFetchText("https://shop.example.test/products/test")).rejects.toThrow("connection reset");
  });

  it("bounds total request duration even while the remote server keeps streaming", async () => {
    vi.useFakeTimers();
    const request = mockRemoteResponse(response => { response.emit("data", Buffer.from("<html>")); });
    const pending = expect(safeFetchText("https://shop.example.test/products/test")).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_001);
    await pending;
    expect(request.destroy).toHaveBeenCalled();
  });
});
