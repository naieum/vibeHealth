import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// VULN [Cat 29]: File upload with no validation whatsoever
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // VULN [Cat 29]: User-controlled filename used directly - path traversal possible
    // An attacker can upload "../../etc/cron.d/malicious" or similar
    const filename = file.name;

    // VULN [Cat 29]: No file type validation - accepts .exe, .php, .sh, anything
    // VULN [Cat 29]: No file size validation - unlimited upload size

    const uploadDir = path.join(process.cwd(), "public", "uploads");

    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // VULN [Cat 29]: Path traversal - user-controlled filename joined directly
    const filePath = path.join(uploadDir, filename);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // VULN [Cat 29]: Writing to publicly accessible directory with user-controlled name
    fs.writeFileSync(filePath, buffer);

    // VULN [Cat 29]: Returns the public URL, confirming upload location to attacker
    return NextResponse.json({
      message: "File uploaded successfully",
      filename: filename,
      url: `/uploads/${filename}`,
      size: buffer.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
