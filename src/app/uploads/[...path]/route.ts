import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { type NextRequest } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path: paramsPath } = await params;

    // Prevent directory traversal
    const cleanPath = paramsPath.join("/");
    if (cleanPath.includes("..")) {
        return new NextResponse("Invalid path", { status: 400 });
    }

    // Define the uploads directory - MUST match where files are saved
    // In typical Next.js standalone w/ Docker, process.cwd() is /app
    // If user maps volume to /app/public/uploads, this works.
    const filePath = path.join(process.cwd(), "public", "uploads", cleanPath);

    try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return new NextResponse("File not found", { status: 404 });
        }

        const fileBuffer = fs.readFileSync(filePath);

        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        let contentType = "application/octet-stream";

        // Basic reliable mime type map
        switch (ext) {
            case ".jpg":
            case ".jpeg":
                contentType = "image/jpeg";
                break;
            case ".png":
                contentType = "image/png";
                break;
            case ".gif":
                contentType = "image/gif";
                break;
            case ".webp":
                contentType = "image/webp";
                break;
            case ".svg":
                contentType = "image/svg+xml";
                break;
            case ".pdf":
                contentType = "application/pdf";
                break;
        }

        // Return the file with caching headers
        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (error) {
        console.error("Error reading file:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
