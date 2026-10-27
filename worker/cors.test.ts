import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedOrigin } from "./cors";

test("allows production Pages origin", () => assert.equal(isAllowedOrigin("https://greenlens.pages.dev"), true));
test("allows the stoaops.com production origin", () => assert.equal(isAllowedOrigin("https://greenlens.stoaops.com"), true));
test("rejects other stoaops.com subdomains", () => assert.equal(isAllowedOrigin("https://other.stoaops.com"), false));
test("allows a GreenLens preview origin", () => assert.equal(isAllowedOrigin("https://83a6ed83.greenlens.pages.dev"), true));
test("rejects unrelated Pages projects", () => assert.equal(isAllowedOrigin("https://other-project.pages.dev"), false));
test("rejects malformed origins", () => assert.equal(isAllowedOrigin("not-an-origin"), false));