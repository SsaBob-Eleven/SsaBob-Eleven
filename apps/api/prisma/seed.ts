import "dotenv/config";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const names = ["김싸피", "이코딩", "박자바", "최뷰이", "정노드", "한타입", "오프리", "윤버셀", "장도커", "임테스", "서스케", "신랜덤"];

async function main() {
  const now = new Date();
  const round = await prisma.round.upsert({
    where: { weekKey: "2099-W01" },
    update: {},
    create: {
      weekKey: "2099-W01",
      flowMode: "LOCATION_FIRST",
      status: "OPEN",
      opensAt: new Date(now.getTime() - 60_000),
      closesAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      targetGroupMinSize: 4,
      targetGroupMaxSize: 5,
      maxParticipants: 26,
      randomAttempts: 500,
    },
  });

  for (const [index, name] of names.entries()) {
    const normalizedName = name.normalize("NFKC").toLocaleLowerCase("ko-KR");
    const participant = await prisma.participant.upsert({
      where: { normalizedName },
      update: { name },
      create: { name, normalizedName },
    });
    const rawToken = `seed-token-${index}`;
    const editTokenHash = createHmac("sha256", process.env.EDIT_TOKEN_PEPPER ?? "development-edit-token-pepper-change-me")
      .update(rawToken)
      .digest("hex");
    await prisma.registration.upsert({
      where: { roundId_participantId: { roundId: round.id, participantId: participant.id } },
      update: {},
      create: {
        roundId: round.id,
        participantId: participant.id,
        displayName: name,
        preferredLocation: index < 5 ? "FLOOR_10" : index < 9 ? "FLOOR_20" : "OUTSIDE",
        editTokenHash,
      },
    });
  }
  console.log(`Seeded ${names.length} participants into ${round.weekKey}`);
}

main().finally(async () => prisma.$disconnect());
