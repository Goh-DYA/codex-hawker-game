import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  activityEntryMessage,
  appendActivityEvent,
  shouldShowPopup,
  type ActivityEntry,
} from "../src/game/runtime/activityFeed";
import type { RuntimeEvent } from "../src/game/runtime/types";

const sale = (amount: number): RuntimeEvent => ({
  kind: "success",
  message: `A neighbour enjoyed their meal · +$${amount}`,
  importance: "routine",
  groupKey: "sales",
  amount,
});

describe("activity feed notification routing", () => {
  it("keeps routine events in Activity and reserves popups for important events", () => {
    expect(shouldShowPopup(sale(7))).toBe(false);
    expect(shouldShowPopup({ kind: "info", message: "Saved" })).toBe(false);
    expect(shouldShowPopup({ kind: "warning", message: "Route blocked" })).toBe(true);
    expect(shouldShowPopup({ kind: "error", message: "Save failed" })).toBe(true);
    expect(
      shouldShowPopup({ kind: "success", message: "Milestone completed", importance: "important" }),
    ).toBe(true);
    expect(
      shouldShowPopup({ kind: "warning", message: "Minor recovery", importance: "routine" }),
    ).toBe(false);
  });

  it("groups consecutive sales into one readable entry", () => {
    let entries: readonly ActivityEntry[] = appendActivityEvent([], sale(7), 1);
    entries = appendActivityEvent(entries, sale(3), 2);
    entries = appendActivityEvent(entries, sale(6), 3);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 1, count: 3, amount: 16, groupKey: "sales" });
    expect(activityEntryMessage(entries[0]!)).toBe("3 neighbours enjoyed their meals · +$16");
  });

  it("keeps only the configured number of recent entries", () => {
    let entries: readonly ActivityEntry[] = [];
    for (let index = 1; index <= 5; index += 1) {
      entries = appendActivityEvent(entries, { kind: "info", message: `Event ${index}` }, index, 3);
    }

    expect(entries.map((entry) => entry.message)).toEqual(["Event 5", "Event 4", "Event 3"]);
  });

  it("renders Activity as a first-class panel with an unread indicator", async () => {
    const [component, styles] = await Promise.all([
      readFile(new URL("../app/game/HawkerSimulator.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

    expect(component).toContain('panel === "activity"');
    expect(component).toContain('className="activity-panel"');
    expect(component).toContain('className="dock-unread"');
    expect(component).toContain("routine events stay here");
    expect(styles).toContain(".activity-list article");
    expect(styles).toContain(".dock-unread");
  });
});
