import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";

// VULN [Cat 1]: SQL injection via string concatenation in raw query
// VULN [Cat 12]: Full patient objects logged to console
// VULN [Cat 20]: PHI returned without access controls
// VULN [Cat 26]: Synchronous file I/O in request handler
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";

  // VULN [Cat 26]: Synchronous file read blocks the event loop in an async handler
  try {
    const auditLog = fs.readFileSync("/var/log/vibehealth/audit.log", "utf-8");
    console.log("Audit log loaded:", auditLog.length, "bytes");
  } catch {
    // Ignore if file doesn't exist
  }

  try {
    // VULN [Cat 1]: Direct string concatenation in SQL query
    // VULN [Cat 26]: No LIMIT clause - unbounded query returns all matching rows
    const patients = await prisma.$queryRawUnsafe(
      `SELECT * FROM User WHERE name LIKE '%${query}%' OR email LIKE '%${query}%' OR mrn LIKE '%${query}%'`
    );

    // VULN [Cat 12/20]: Logging full patient records including PHI
    console.log("Patient search results:", JSON.stringify(patients));

    return NextResponse.json({ patients });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // VULN [Cat 12]: Stack trace in error response
    return NextResponse.json(
      {
        error: "Search failed",
        details: message,
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
