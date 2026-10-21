import { describe, expect, it } from "vitest";
import { HttpError } from "./index";

describe("HttpError", () => {
  it("classifies status codes into kinds", () => {
    expect(new HttpError(401, "x").kind).toBe("unauthorized");
    expect(new HttpError(403, "x").kind).toBe("forbidden");
    expect(new HttpError(404, "x").kind).toBe("not-found");
    expect(new HttpError(409, "x").kind).toBe("conflict");
    expect(new HttpError(500, "x").kind).toBe("server");
    expect(new HttpError(503, "x").kind).toBe("server");
    expect(new HttpError(422, "x").kind).toBe("other");
  });

  it("carries status, message and body", () => {
    const error = new HttpError(422, "validation failed", { fields: { name: "required" } });
    expect(error.status).toBe(422);
    expect(error.message).toBe("validation failed");
    expect(error.body).toEqual({ fields: { name: "required" } });
    expect(error.name).toBe("HttpError");
    expect(error instanceof Error).toBe(true);
  });
});
