import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords } from "@/lib/airtable";
import { TABLES, MEMBER_FIELDS, TRAINER_FIELDS } from "@/lib/constants";

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    if (!q) {
      return NextResponse.json({ success: true, data: [] });
    }

    const [members, trainers] = await Promise.all([
      getRecords(TABLES.MEMBERS, { revalidate: 20, tags: ["members"] }),
      getRecords(TABLES.TRAINERS, { revalidate: 120, tags: ["trainers"] }),
    ]);

    const trainerNameById = new Map(
      trainers.map((r) => [r.id, scalar(r.fields[TRAINER_FIELDS.NAME])])
    );

    const results = members
      .filter((m) => {
        const name = scalar(m.fields[MEMBER_FIELDS.NAME]).toLowerCase();
        const memberId = scalar(m.fields[MEMBER_FIELDS.ID]).toLowerCase();
        const serial = scalar(m.fields[MEMBER_FIELDS.SERIAL]).toLowerCase();
        return (
          name.includes(q) ||
          memberId.includes(q) ||
          serial.includes(q) ||
          m.id.toLowerCase().includes(q)
        );
      })
      .slice(0, 20)
      .map((m) => {
        const links =
          (m.fields[MEMBER_FIELDS.TRAINER] as string[] | undefined) ?? [];
        const trainerId = links[0] ?? null;
        const isMine = trainerId === user.recordId;
        const isUnassigned = links.length === 0;
        return {
          id: m.id,
          name: scalar(m.fields[MEMBER_FIELDS.NAME]),
          memberId: scalar(m.fields[MEMBER_FIELDS.ID]) || m.id,
          phone: scalar(m.fields[MEMBER_FIELDS.PHONE]),
          planType: scalar(m.fields[MEMBER_FIELDS.PLAN_TYPE]),
          isMine,
          isUnassigned,
          trainerName: !isMine && !isUnassigned ? trainerNameById.get(trainerId!) ?? "" : "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Trainee search error:", error);
    return NextResponse.json(
      { message: "Failed to search trainees" },
      { status: 500 }
    );
  }
}
