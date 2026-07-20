import { describe, expect, it } from "vitest";
import { calculateAdaptiveTeamSizes, generateTeamDrafts, pairKey } from "./team-generator.js";

describe("calculateAdaptiveTeamSizes", () => {
  it.each([
    [0, []],
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [4]],
    [5, [5]],
    [6, [6]],
    [7, [4, 3]],
    [8, [4, 4]],
    [9, [5, 4]],
    [10, [5, 5]],
    [11, [6, 5]],
    [12, [4, 4, 4]],
    [26, [5, 5, 4, 4, 4, 4]],
  ])("%i명을 적응형 크기로 나눈다", (count, expected) => {
    expect(calculateAdaptiveTeamSizes(count as number, 4, 5)).toEqual(expected);
  });

  it("1명부터 26명까지 누구도 누락하지 않는다", () => {
    for (let count = 1; count <= 26; count += 1) {
      const sizes = calculateAdaptiveTeamSizes(count, 4, 5);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(count);
      expect(sizes.every((size) => size > 0)).toBe(true);
    }
  });
});
describe("generateTeamDrafts", () => {
  const registrations = Array.from({ length: 10 }, (_, index) => ({
    id: `registration-${index}`,
    participantId: `participant-${index}`,
    preferredLocation: "FLOOR_10" as const,
  }));

  it("같은 seed에는 같은 결과를 만든다", () => {
    const input = {
      registrations,
      flowMode: "TEAM_FIRST" as const,
      targetMin: 4,
      targetMax: 5,
      attempts: 50,
      penalties: new Map<string, number>(),
      seed: "fixed-seed",
    };
    expect(generateTeamDrafts(input)).toEqual(generateTeamDrafts(input));
  });

  it("과거에 같은 조였던 쌍을 피하는 후보를 선택한다", () => {
    const penalties = new Map([[pairKey("participant-0", "participant-1"), 100]]);
    const result = generateTeamDrafts({
      registrations,
      flowMode: "TEAM_FIRST",
      targetMin: 4,
      targetMax: 5,
      attempts: 200,
      penalties,
      seed: "avoid-repeat",
    });
    const repeated = result.teams.some((team) =>
      team.registrationIds.includes("registration-0") && team.registrationIds.includes("registration-1"),
    );
    expect(repeated).toBe(false);
  });

  it("장소 우선 모드에서는 장소를 섞지 않는다", () => {
    const mixed = registrations.map((registration, index) => ({
      ...registration,
      preferredLocation: index < 5 ? ("FLOOR_10" as const) : ("OUTSIDE" as const),
    }));
    const result = generateTeamDrafts({
      registrations: mixed,
      flowMode: "LOCATION_FIRST",
      targetMin: 4,
      targetMax: 5,
      attempts: 10,
      penalties: new Map(),
      seed: "location",
    });
    expect(result.teams.map((team) => team.location)).toEqual(["FLOOR_10", "OUTSIDE"]);
  });
});
