import type { Location } from "@ssabap/shared";

export type GeneratorRegistration = {
  id: string;
  participantId: string;
  preferredLocation: Location | null;
};

export type PairPenaltyMap = Map<string, number>;

export type TeamDraft = {
  registrationIds: string[];
  location: Location | null;
  sizeAdjusted: boolean;
};

export type GeneratorResult = {
  teams: TeamDraft[];
  bestScore: number;
  repeatedPairCount: number;
  candidateCount: number;
};

export function pairKey(left: string, right: string): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}
function targetDeviation(size: number, min: number, max: number): number {
  if (size < min) return min - size;
  if (size > max) return size - max;
  return 0;
}

export function calculateAdaptiveTeamSizes(count: number, targetMin: number, targetMax: number): number[] {
  if (count === 0) return [];
  if (count < 0 || targetMin < 1 || targetMax < targetMin) {
    throw new Error("Invalid adaptive team size input");
  }

  let best: { sizes: number[]; score: [number, number, number, number] } | null = null;

  for (let teamCount = 1; teamCount <= count; teamCount += 1) {
    const base = Math.floor(count / teamCount);
    const remainder = count % teamCount;
    const sizes = Array.from({ length: teamCount }, (_, index) => base + (index < remainder ? 1 : 0));
    const deviations = sizes.map((size) => targetDeviation(size, targetMin, targetMax));
    const score: [number, number, number, number] = [
      deviations.reduce((sum, value) => sum + value, 0),
      deviations.filter((value) => value > 0).length,
      Math.max(...deviations),
      teamCount,
    ];

    if (!best || compareTuple(score, best.score) < 0) {
      best = { sizes, score };
    }
  }

  return best?.sizes ?? [];
}

function compareTuple(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function seedToNumber(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: string): () => number {
  let state = seedToNumber(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

function partition(values: GeneratorRegistration[], sizes: number[]): GeneratorRegistration[][] {
  const teams: GeneratorRegistration[][] = [];
  let offset = 0;
  for (const size of sizes) {
    teams.push(values.slice(offset, offset + size));
    offset += size;
  }
  return teams;
}

function historyScore(teams: GeneratorRegistration[][], penalties: PairPenaltyMap) {
  let score = 0;
  let repeatedPairCount = 0;
  for (const team of teams) {
    for (let left = 0; left < team.length; left += 1) {
      for (let right = left + 1; right < team.length; right += 1) {
        const penalty = penalties.get(pairKey(team[left]!.participantId, team[right]!.participantId)) ?? 0;
        score += penalty;
        if (penalty > 0) repeatedPairCount += 1;
      }
    }
  }
  return { score, repeatedPairCount };
}

function generateBucket(
  registrations: GeneratorRegistration[],
  location: Location | null,
  targetMin: number,
  targetMax: number,
  attempts: number,
  penalties: PairPenaltyMap,
  seed: string,
) {
  const sizes = calculateAdaptiveTeamSizes(registrations.length, targetMin, targetMax);
  if (sizes.length === 0) return { teams: [] as TeamDraft[], score: 0, repeatedPairCount: 0 };

  const random = createRandom(seed);
  let best: { teams: GeneratorRegistration[][]; score: number; repeatedPairCount: number } | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = partition(shuffle(registrations, random), sizes);
    const scored = historyScore(candidate, penalties);
    if (!best || scored.score < best.score || (scored.score === best.score && scored.repeatedPairCount < best.repeatedPairCount)) {
      best = { teams: candidate, ...scored };
    }
  }

  return {
    teams: (best?.teams ?? []).map((team) => ({
      registrationIds: team.map((registration) => registration.id),
      location,
      sizeAdjusted: team.length < targetMin || team.length > targetMax,
    })),
    score: best?.score ?? 0,
    repeatedPairCount: best?.repeatedPairCount ?? 0,
  };
}

export function generateTeamDrafts(input: {
  registrations: GeneratorRegistration[];
  flowMode: "LOCATION_FIRST" | "TEAM_FIRST";
  targetMin: number;
  targetMax: number;
  attempts: number;
  penalties: PairPenaltyMap;
  seed: string;
}): GeneratorResult {
  const buckets: Array<{ location: Location | null; registrations: GeneratorRegistration[] }> =
    input.flowMode === "LOCATION_FIRST"
      ? (["FLOOR_10", "FLOOR_20", "OUTSIDE"] as const).map((location) => ({
          location,
          registrations: input.registrations.filter((registration) => registration.preferredLocation === location),
        }))
      : [{ location: null, registrations: input.registrations }];

  const result: GeneratorResult = { teams: [], bestScore: 0, repeatedPairCount: 0, candidateCount: 0 };
  for (const [index, bucket] of buckets.entries()) {
    const generated = generateBucket(
      bucket.registrations,
      bucket.location,
      input.targetMin,
      input.targetMax,
      input.attempts,
      input.penalties,
      `${input.seed}:${index}`,
    );
    result.teams.push(...generated.teams);
    result.bestScore += generated.score;
    result.repeatedPairCount += generated.repeatedPairCount;
    if (bucket.registrations.length > 0) result.candidateCount += input.attempts;
  }
  return result;
}
