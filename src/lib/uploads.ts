import path from "path";

export const getUploadsDir = () => {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "public", "uploads");
};
