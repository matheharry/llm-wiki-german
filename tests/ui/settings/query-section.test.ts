import { describe, expect, it } from "vitest";

import {
  applyQuerySettingsPatch,
  type QuerySettings,
} from "../../../src/ui/settings/query-section.js";

function base(overrides: Partial<QuerySettings> = {}): QuerySettings {
  return {
    queryFolders: [],
    queryMaxEntities: 8,
    queryMaxConcepts: 5,
    queryMaxConnections: 20,
    queryMaxSources: 30,
    ...overrides,
  };
}

describe("applyQuerySettingsPatch", () => {
  it("merges patch into existing settings", () => {
    const before = base();
    const after = applyQuerySettingsPatch(before, {
      queryFolders: ["notes"],
    });
    expect(after.queryFolders).toEqual(["notes"]);
  });

  it("does not mutate the previous settings object", () => {
    const before = base();
    applyQuerySettingsPatch(before, { queryFolders: ["notes"] });
    expect(before.queryFolders).toEqual([]);
  });

  it("handles multiple folders", () => {
    const before = base({ queryFolders: ["projects"] });
    const after = applyQuerySettingsPatch(before, {
      queryFolders: ["projects", "zettel"],
    });
    expect(after.queryFolders).toEqual(["projects", "zettel"]);
  });

  it("merges the retrieval limits independently of the folders", () => {
    const before = base();
    const after = applyQuerySettingsPatch(before, { queryMaxSources: 5 });
    expect(after.queryMaxSources).toBe(5);
    // Der Rest bleibt unberuehrt.
    expect(after.queryMaxEntities).toBe(8);
    expect(after.queryFolders).toEqual([]);
  });

  it("accepts 0 as a limit (disables that category)", () => {
    const after = applyQuerySettingsPatch(base(), {
      queryMaxEntities: 0,
      queryMaxConcepts: 0,
    });
    expect(after.queryMaxEntities).toBe(0);
    expect(after.queryMaxConcepts).toBe(0);
  });
});
