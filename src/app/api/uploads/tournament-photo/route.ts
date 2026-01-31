import { getServerSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import crypto from "crypto";
import { processImageUpload } from "@/lib/image-upload";
import { getUploadsDir } from "@/lib/uploads";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getServerSession();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "TOURNAMENT_ADMIN")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Solo se permiten imagenes" }, { status: 400 });
  }
  if (file.size > MAX_INPUT_BYTES) {
    return NextResponse.json(
      { error: "La imagen supera el limite de 10MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const processed = await processImageUpload(buffer, {
    kind: "photo",
    mime: file.type,
  });

  if (processed.buffer.length > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "La imagen debe pesar maximo 2MB" },
      { status: 400 }
    );
  }

  const filename = `${crypto.randomUUID()}${processed.ext}`;
  const uploadsDir = getUploadsDir();
  const filePath = path.join(uploadsDir, filename);

  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(filePath, processed.buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
