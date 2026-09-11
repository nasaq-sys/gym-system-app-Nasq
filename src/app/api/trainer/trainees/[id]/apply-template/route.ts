import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { z } from "zod";
import {
  assertTrainerCanManageTrainee,
  applyTemplateToTrainee,
} from "@/lib/trainingSchedule";

export const dynamic = "force-dynamic";

const applyTemplateSchema = z.object({
  templateId: z
    .string({ message: "templateId is required" })
    .trim()
    .min(1, { message: "templateId cannot be empty" })
    .max(100, { message: "templateId is too long" })
    .regex(/^[^<>]*$/, "HTML tags are forbidden"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, id))) {
      return NextResponse.json(
        { message: "This member is not one of your trainees" },
        { status: 403 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 2. Strict Input Validation via Zod
    const validation = applyTemplateSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        { error: "validation_failed", message: "templateId is required and must be valid" },
        { status: 400 }
      );
    }

    const { templateId } = validation.data;

    await applyTemplateToTrainee(templateId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Apply plan template error:", error);
    return NextResponse.json(
      { message: "Failed to apply plan template" },
      { status: 500 }
    );
  }
}

