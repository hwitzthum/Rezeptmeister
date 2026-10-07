import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { postBackendTask } from "../backend";

const socketClosed = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
  });

describe("postBackendTask", () => {
  const fetchMock = vi.fn();
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("BACKEND_URL", "https://backend.test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    errorSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("wiederholt nach geschlossenem Socket und loggt nichts bei Erfolg", async () => {
    fetchMock
      .mockRejectedValueOnce(socketClosed())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const task = postBackendTask("/embed/image", {}, { image_id: "x" }, "Fehler");
    await vi.runAllTimersAsync();
    await task;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://backend.test/embed/image");
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ image_id: "x" }));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("loggt, wenn beide Versuche scheitern, ohne zu werfen", async () => {
    fetchMock.mockRejectedValue(socketClosed());

    const task = postBackendTask("/embed/text", {}, {}, "Embedding fehlgeschlagen");
    await vi.runAllTimersAsync();
    await expect(task).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      "Embedding fehlgeschlagen: Backend nicht erreichbar",
      { path: "/embed/text" },
    );
  });

  it("loggt den HTTP-Status bei einer Fehlerantwort", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await postBackendTask("/embed/text", {}, {}, "Embedding fehlgeschlagen");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("Embedding fehlgeschlagen: HTTP 500", {
      path: "/embed/text",
    });
  });
});
