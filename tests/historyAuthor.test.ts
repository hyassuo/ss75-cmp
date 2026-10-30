import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { historyAuthor, historyAuthorRaw } from "@/lib/i18n/history";

const root = path.join(__dirname, "..");
const ID = "00000000-0000-0000-0000-00000000c001";

describe("history author (C9: emails for admins only)", () => {
  it("admins see the email (history_log fills it for them)", () => {
    const h = { by_user: ID, by_user_email: "insp1@test", by_user_name: "Insp One" };
    expect(historyAuthor(h, "en")).toBe("insp1@test");
    expect(historyAuthorRaw(h)).toBe("insp1@test");
  });

  it("everyone else sees the name captured with the event", () => {
    const h = { by_user: ID, by_user_email: null, by_user_name: "Insp One" };
    expect(historyAuthor(h, "en")).toBe("Insp One");
    expect(historyAuthorRaw(h)).toBe("Insp One");
  });

  it("a known author without a name is 'a user'; no author, nothing", () => {
    const unnamed = { by_user: ID, by_user_email: null, by_user_name: null };
    expect(historyAuthor(unnamed, "en")).toBe("a user");
    expect(historyAuthor(unnamed, "pt")).toBe("um usuário");
    expect(historyAuthorRaw(unnamed)).toBeNull();
    const none = { by_user: null, by_user_email: null, by_user_name: null };
    expect(historyAuthor(none, "en")).toBeNull();
    expect(historyAuthor({ ...none, by_user_email: "gone@test" }, "en")).toBe("gone@test");
  });

  it("the app reads the audit trail only through history_log", () => {
    // history.by_user_email is closed to the API roles: a select=* on the
    // table would fail, so no client code may query "history" directly.
    const files = execFileSync("git", ["ls-files", "app", "components", "lib"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.tsx?$/.test(f));
    const direct = files.filter((f) =>
      /\.from\(\s*["']history["']\s*\)/.test(fs.readFileSync(path.join(root, f), "utf8"))
    );
    expect(direct).toEqual([]);
  });
});
