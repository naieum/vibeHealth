import { NextRequest, NextResponse } from "next/server";

// VULN [Cat 30]: ReDoS - catastrophic backtracking on crafted input
// Try: "a]".repeat(25) + "@" to hang the server
const EMAIL_REGEX =
  /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z]{2,4})+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, profile } = body;

    const errors: string[] = [];

    // VULN [Cat 30]: ReDoS-vulnerable regex used on user input
    if (email && !EMAIL_REGEX.test(email)) {
      errors.push("Invalid email format");
    }

    // VULN [Cat 30]: Prototype pollution via Object.assign with user-controlled input
    // An attacker can send { "profile": { "__proto__": { "isAdmin": true } } }
    const defaults = { role: "patient", verified: false, tier: "free" };
    const userProfile = Object.assign(defaults, profile);

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      profile: userProfile,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
