import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Mocks -------------------------------------------------------------

const findFirstMock = vi.fn();
const insertReturningMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      recipes: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
      shoppingListItems: { findMany: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: (...args: unknown[]) => insertReturningMock(...args),
      })),
    })),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitDistributed: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { auth } from "@/auth";
import { POST } from "../route";

const authMock = vi.mocked(auth);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/shopping-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/shopping-list — recipeId ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `auth` is an intersection of several overloaded call signatures (Session
    // getter, middleware wrapper, route-handler wrapper, ...). TS utility types
    // like the one `vi.mocked()`/`mockResolvedValue()` rely on resolve against
    // the LAST signature in that intersection, not the Session-returning one we
    // actually use here — so the object literal below can't be checked
    // structurally against it. `as never` opts out of that (irrelevant) check
    // rather than relying on `@ts-expect-error`, whose target line shifts
    // whenever the upstream type declaration order changes.
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "user" },
    } as never);
  });

  it("rejects a recipeId that does not belong to the caller", async () => {
    findFirstMock.mockResolvedValue(undefined); // no owned recipe found

    const res = await POST(
      makeRequest({
        ingredientName: "Rüebli",
        recipeId: "11111111-1111-4111-8111-111111111111",
      }),
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Rezept nicht gefunden.");
    expect(insertReturningMock).not.toHaveBeenCalled();
  });

  it("allows adding an item tied to a recipe the caller owns", async () => {
    const ownedRecipeId = "22222222-2222-4222-8222-222222222222";
    findFirstMock.mockResolvedValue({ id: ownedRecipeId });
    insertReturningMock.mockResolvedValue([
      { id: "item-1", ingredientName: "Rüebli", recipeId: ownedRecipeId },
    ]);

    const res = await POST(
      makeRequest({ ingredientName: "Rüebli", recipeId: ownedRecipeId }),
    );

    expect(res.status).toBe(201);
    expect(findFirstMock).toHaveBeenCalled();
    expect(insertReturningMock).toHaveBeenCalled();
  });

  it("allows adding an item with no recipeId at all (manual entry)", async () => {
    insertReturningMock.mockResolvedValue([
      { id: "item-2", ingredientName: "Salz", recipeId: null },
    ]);

    const res = await POST(makeRequest({ ingredientName: "Salz" }));

    expect(res.status).toBe(201);
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(insertReturningMock).toHaveBeenCalled();
  });
});
