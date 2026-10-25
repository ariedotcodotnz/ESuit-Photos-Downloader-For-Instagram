import { describe, expect, it } from "vitest";
import { extractErrorMessage, friendlyErrorMessage, isRateLimitError } from "@/inject/app/download/errors";

describe("Instagram API errors", () => {
  it("recognizes the reported AjaxError 429 even when its message and response are empty", () => {
    const error = Object.assign(new Error(""), {
      name: "AjaxError",
      statusCode: 429,
      responseObject: null,
      responseText: "",
    });
    const message = extractErrorMessage(error);
    expect(message).toBe("HTTP 429 Too Many Requests");
    expect(isRateLimitError(message)).toBe(true);
    expect(friendlyErrorMessage(message)).toBe(
      "Instagram is temporarily limiting requests. Please wait before trying again.",
    );
  });

  it("recognizes HTTP and Instagram rate-limit messages", () => {
    for (const message of ["HTTP 429", "Too Many Requests", "rate_limit_exceeded", "Request is too frequent"]) {
      expect(isRateLimitError(message)).toBe(true);
    }
  });

  it("preserves ordinary error messages", () => {
    const message = extractErrorMessage(new Error("Download failed"));
    expect(message).toBe("Download failed");
    expect(friendlyErrorMessage(message)).toBe(message);
    expect(isRateLimitError(message)).toBe(false);
  });
});
