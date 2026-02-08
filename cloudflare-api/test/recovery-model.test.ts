import { describe, expect, it } from "vitest";
import { defaultRestHoursForMuscle } from "../src/recovery";

describe("defaultRestHoursForMuscle", () => {
  it("uses slower recovery defaults for large muscles and core", () => {
    expect(defaultRestHoursForMuscle("chest")).toBe(60);
    expect(defaultRestHoursForMuscle("back")).toBe(60);
    expect(defaultRestHoursForMuscle("shoulders")).toBe(60);
    expect(defaultRestHoursForMuscle("legs")).toBe(60);
    expect(defaultRestHoursForMuscle("core")).toBe(60);
  });

  it("uses moderate recovery defaults for small muscles and cardio", () => {
    expect(defaultRestHoursForMuscle("biceps")).toBe(36);
    expect(defaultRestHoursForMuscle("triceps")).toBe(36);
    expect(defaultRestHoursForMuscle("forearms")).toBe(36);
    expect(defaultRestHoursForMuscle("cardio")).toBe(24);
    expect(defaultRestHoursForMuscle("unknown")).toBe(36);
  });
});
