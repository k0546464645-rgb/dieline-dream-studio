import { describe, expect, it } from "vitest";
import { mockupKind, mockupSlots, savedMockupSlot } from "@/lib/mockup-layout";

describe("3D mockup requests", () => {
  it("always keeps front and back with no optional packaging", () => {
    expect(mockupSlots({}).map((slot) => slot.id)).toEqual(["front", "back"]);
  });
  it("adds one window for each requested image across multiple packaging types", () => {
    expect(mockupSlots({ display: 2, blister: 1, shelf: 0 }).map((slot) => slot.id)).toEqual(["front", "back", "display-1", "display-2", "blister-1"]);
  });
  it("removes only optional windows when deselected", () => {
    expect(mockupSlots({ display: 0, window: 1 }).map((slot) => slot.id)).toEqual(["front", "back", "window-1"]);
  });
  it("restores optional images without replacing the front or back", () => {
    expect(mockupKind("front")).toBe("mockup");
    expect(mockupKind("back")).toBe("mockup-back");
    expect(savedMockupSlot(mockupKind("display-2"))).toBe("display-2");
    expect(savedMockupSlot("artwork-master")).toBeUndefined();
  });
});