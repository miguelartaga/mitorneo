import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { NextResponse } from "next/server";

const resolveId = async (
  request: Request,
  params?: { id?: string } | Promise<{ id?: string }>
) => {
  if (params) {
    const resolved =
      typeof (params as Promise<{ id?: string }>).then === "function"
        ? await (params as Promise<{ id?: string }>)
        : (params as { id?: string });
    if (resolved?.id) return resolved.id;
  }
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 3] : undefined;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await getServerSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tournamentId = await resolveId(request, resolvedParams);
  if (!tournamentId) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      paymentReportedAmount: null,
      paymentReportedNote: null,
      paymentReportedAt: null,
      paymentReportedById: null,
    },
    select: { id: true },
  });

  return NextResponse.json({
    tournament: {
      id: updated.id,
      paymentReportedAmount: null,
      paymentReportedNote: null,
      paymentReportedAt: null,
      paymentReportedBy: null,
    },
  });
}
