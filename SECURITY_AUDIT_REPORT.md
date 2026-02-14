# Security Audit Report - VibeHealth

**Date:** 2026-02-14
**Scope:** Compliance (HIPAA, SOC 2, PCI-DSS, GDPR)
**Project:** VibeHealth Telehealth Platform
**Tech Stack:** Next.js 14, Prisma (SQLite), Stripe, OpenAI, better-auth, Twilio, Resend, Upstash Redis, AWS S3

---

## Summary

- **Overall Risk:** Critical
- **Findings:** 8 Critical, 6 High, 3 Medium

| Category | Findings | Severity |
|----------|----------|----------|
| HIPAA (Cat 20) | 4 | 2 Critical, 2 High |
| SOC 2 (Cat 21) | 4 | 2 Critical, 2 High |
| PCI-DSS (Cat 22) | 4 | 3 Critical, 1 High |
| GDPR (Cat 23) | 5 | 1 Critical, 1 High, 3 Medium |

---

## Category 20: HIPAA

### Finding 20.1: PHI Logged to Console (Critical)

Multiple endpoints log Protected Health Information (PHI) to console output without redaction.

- **File:** `app/api/patients/[mrn]/route.ts:26`
- **Evidence:**
  ```
  console.log("Patient record accessed:", patient.mrn, patient.name);
  ```
- **File:** `app/api/patients/search/route.ts:17`
- **Evidence:**
  ```
  console.log("Patient search results:", JSON.stringify(patients));
  ```
- **File:** `app/api/chat/route.ts:19`
- **Evidence:**
  ```
  console.log("Messages retrieved:", JSON.stringify(messages));
  ```
- **File:** `app/api/chat/route.ts:33`
- **Evidence:**
  ```
  console.log("New message:", { senderId, receiverId, content });
  ```
- **Risk:** PHI (patient names, MRNs, medical messages, search results) written to logs violates HIPAA audit logging requirements. Logs may be stored in unencrypted log aggregation systems accessible to unauthorized personnel.
- **Fix:** Remove all `console.log` of PHI. Implement a HIPAA-compliant audit logger that redacts PHI fields and stores audit entries in the `AuditLog` database table with proper access controls.

---

### Finding 20.2: MRN Exposed in URL Path (Critical)

Medical Record Numbers (PHI identifiers) are used directly in URL path segments.

- **File:** `app/api/patients/[mrn]/route.ts:8`
- **Evidence:**
  ```
  { params }: { params: { mrn: string } }
  ```
  The route is structured as `/api/patients/[mrn]`, placing the MRN directly in the URL.
- **Risk:** MRNs in URLs appear in browser history, server access logs, proxy logs, CDN logs, and referrer headers. HIPAA requires PHI not be transmitted in URLs where it can be inadvertently logged or cached.
- **Fix:** Use opaque patient IDs in URLs instead of MRNs. Accept MRN lookups via POST body or authenticated query parameters with proper access controls.

---

### Finding 20.3: No Access Controls on PHI Endpoints (High)

PHI endpoints have no authentication or authorization checks. Any unauthenticated user can access all patient data.

- **File:** `middleware.ts:5-7`
- **Evidence:**
  ```
  export function middleware() {
    return NextResponse.next();
  }
  ```
  The middleware matches `/api/:path*` but performs no authentication check.
- **File:** `app/api/patients/[mrn]/route.ts:6-9` — No auth check before returning patient records including appointments, prescriptions, symptom checks, and payments.
- **File:** `app/api/admin/users/route.ts:6` — Admin route returns all users with all PHI, no auth check.
- **Risk:** Complete HIPAA violation. Any network-reachable user can read all patient records, prescriptions, diagnoses, and medical messages without authentication.
- **Fix:** Implement authentication middleware that validates session tokens. Add role-based access control (RBAC) ensuring only authorized providers and patients can access their own data.

---

### Finding 20.4: PHI Stored Unencrypted in Cache (High)

Patient data including PHI is cached in Redis without encryption and without TTL (time-to-live).

- **File:** `lib/cache.ts:12`
- **Evidence:**
  ```
  await redis.set(`patient:${patientId}`, JSON.stringify(data));
  ```
  No encryption applied. No TTL set on the cached entry.
- **Risk:** PHI persists indefinitely in a cache layer without encryption at rest, violating HIPAA requirements for ePHI protection. If Redis is compromised, all cached patient data is exposed in plaintext.
- **Fix:** Encrypt PHI before caching using AES-256-GCM. Add TTL to all PHI cache entries (e.g., 15 minutes). Ensure Redis connections use TLS.

---

## Category 21: SOC 2

### Finding 21.1: No Audit Logging on Sensitive Routes (Critical)

The application defines an `AuditLog` model in the schema but never writes to it. No sensitive route creates audit entries.

- **File:** `prisma/schema.prisma:135-145` — `AuditLog` model exists but is never used.
- **Evidence:** Grep for `auditLog`, `audit_log`, `AuditLog` across all `.ts`/`.tsx` files returned **zero matches** in application code (only the schema definition).
- **Affected routes:**
  - `app/api/admin/users/route.ts` — User listing and deletion with no audit log (CC6.1/CC6.2 violation)
  - `app/api/patients/[mrn]/route.ts` — Patient record access with no audit log
  - `app/api/billing/checkout/route.ts` — Payment processing with no audit log
  - `app/api/prescriptions/generate/route.ts` — Prescription generation with no audit log
- **Risk:** SOC 2 CC6.1 requires logging of security-relevant events. CC6.2 requires change tracking. No audit trail exists for any data access or modification, making incident investigation impossible.
- **Fix:** Create audit logging middleware that records all data access and mutations to the `AuditLog` table, including user ID, action, resource, IP address, and timestamp.

---

### Finding 21.2: No Password Policy Enforcement (Critical)

The authentication system accepts any password with no complexity requirements.

- **File:** `lib/auth.ts:8-13`
- **Evidence:**
  ```
  emailAndPassword: {
    enabled: true,
    // No password policy - accepts any password
  },
  ```
  No `minPasswordLength`, complexity rules, or validation configured in better-auth.
- **File:** `app/signup/page.tsx:77` — Password input has no minLength attribute or client-side validation.
- **Risk:** SOC 2 CC6.1 requires logical access controls. Accepting single-character or blank passwords allows trivial credential compromise.
- **Fix:** Configure better-auth with `minPasswordLength: 12` and add password complexity validation (uppercase, lowercase, numbers, special characters). Display requirements on the signup form.

---

### Finding 21.3: No MFA on Admin Routes (High)

Admin routes have no multi-factor authentication and no authentication at all.

- **File:** `app/api/admin/users/route.ts:6` — `GET` handler returns all users with no auth check.
- **File:** `app/api/admin/users/route.ts:25-31` — `DELETE` handler deletes users with no auth check.
- **File:** `lib/auth.ts:7-20` — No MFA or TOTP configuration in better-auth setup.
- **Risk:** SOC 2 CC6.1 requires MFA for privileged access. Admin endpoints that can list all users and delete accounts have zero access controls.
- **Fix:** Add MFA/TOTP to better-auth configuration. Require MFA verification for all admin routes. Implement role-based middleware that verifies admin role + MFA before processing admin requests.

---

### Finding 21.4: Sessions Without Timeout (High)

Sessions have no expiration configured, persisting indefinitely.

- **File:** `lib/auth.ts:14-19`
- **Evidence:**
  ```
  session: {
    // No expiry configured - sessions last indefinitely
    cookieCache: {
      enabled: false,
    },
  },
  ```
- **Risk:** SOC 2 CC6.1 requires session management with timeouts. Indefinite sessions mean a compromised session token provides permanent access.
- **Fix:** Configure session expiry (e.g., `expiresIn: 60 * 60 * 24` for 24 hours). Add idle timeout. Enable cookie cache with appropriate TTL.

---

## Category 22: PCI-DSS

### Finding 22.1: Full Card Number (PAN) Stored in Database (Critical)

The application stores full credit card numbers in the database, violating PCI-DSS Requirement 3.4.

- **File:** `prisma/schema.prisma:124`
- **Evidence:**
  ```
  cardNumber    String?  // VULN: storing full PAN
  ```
- **File:** `app/api/billing/checkout/route.ts:9,16`
- **Evidence:**
  ```
  const { userId, amount, cardNumber, cvv, cardExpiry, description } = body;
  ```
  ```
  cardNumber, // VULN: Full card number stored
  ```
  The checkout endpoint accepts raw card numbers from the client and writes them directly to the database.
- **Risk:** PCI-DSS Req 3.4 prohibits storage of the full PAN unless encrypted. Storing unencrypted card numbers exposes all customers to fraud if the database is compromised.
- **Fix:** Never accept raw card data server-side. Use Stripe Elements or Stripe.js to tokenize card data on the client. Store only Stripe payment method tokens (`pm_*`) or last-4 digits.

---

### Finding 22.2: CVV/CVC Stored in Database (Critical)

The application stores CVV/CVC security codes, which is **never** permitted under PCI-DSS.

- **File:** `prisma/schema.prisma:125`
- **Evidence:**
  ```
  cvv           String?  // VULN: storing CVV
  ```
- **File:** `app/api/billing/checkout/route.ts:9,17`
- **Evidence:**
  ```
  const { userId, amount, cardNumber, cvv, cardExpiry, description } = body;
  ```
  ```
  cvv, // VULN: CVV stored (never allowed by PCI-DSS)
  ```
- **Risk:** PCI-DSS Req 3.2 absolutely prohibits storing CVV/CVC after authorization. This is a **mandatory** disqualification from PCI compliance and a critical fraud risk.
- **Fix:** Remove the `cvv` field entirely from the database schema. Never accept or transmit CVV server-side. Use Stripe Elements which handles CVV securely without it touching your server.

---

### Finding 22.3: Card Data Logged to Console (Critical)

Full card numbers are logged via `console.log` after payment creation.

- **File:** `app/api/billing/checkout/route.ts:25-29`
- **Evidence:**
  ```
  console.log("Payment created:", {
    paymentId: payment.id,
    cardNumber,
    amount,
  });
  ```
- **File:** `app/api/billing/webhook/route.ts:14`
- **Evidence:**
  ```
  console.log("Webhook received:", JSON.stringify(event));
  ```
  Webhook events may contain payment details.
- **Risk:** PCI-DSS Req 3.2 prohibits logging card data. Card numbers in logs are accessible to anyone with log access and persist in log storage systems.
- **Fix:** Remove all logging of card data. If payment logging is needed, log only the payment ID and masked last-4 digits.

---

### Finding 22.4: Direct Card Handling Instead of Tokenization (High)

The application accepts raw card data from clients and processes it server-side instead of using Stripe's PCI-compliant tokenization.

- **File:** `app/api/billing/checkout/route.ts:6-22`
- **Evidence:** The endpoint accepts `cardNumber`, `cvv`, `cardExpiry` directly from the request body, stores them in the database, then creates a Stripe payment intent separately.
- **Risk:** This brings the entire application into PCI-DSS scope (SAQ D level). Using Stripe Elements would reduce scope to SAQ A, dramatically reducing compliance burden.
- **Fix:** Refactor the checkout flow to use Stripe Elements on the client side. Accept only Stripe payment method tokens server-side. Remove all card data fields from the database schema.

---

## Category 23: GDPR

### Finding 23.1: Data Deletion Not Implemented (Critical)

The data deletion endpoint exists but returns a 501 error, denying users their Right to Erasure (Article 17).

- **File:** `app/api/settings/delete/route.ts:5-9`
- **Evidence:**
  ```
  export async function DELETE() {
    return NextResponse.json(
      { error: "Account deletion feature not yet implemented" },
      { status: 501 }
    );
  }
  ```
- **File:** `app/api/settings/export/route.ts:5-9`
- **Evidence:**
  ```
  export async function GET() {
    return NextResponse.json(
      { error: "Data export feature not yet implemented" },
      { status: 501 }
    );
  }
  ```
  Data portability (Article 20) is also unimplemented.
- **Risk:** GDPR Articles 17 and 20 require data subjects to be able to request deletion and export of their personal data. Stub endpoints that refuse these requests are non-compliant and expose the organization to regulatory fines (up to 4% of annual global turnover).
- **Fix:** Implement the deletion endpoint to cascade-delete all user data (user, sessions, accounts, appointments, messages, prescriptions, payments, symptom checks, password resets, cached data). Implement the export endpoint to return all user data in JSON or CSV format.

---

### Finding 23.2: No Consent Collection at Signup (High)

Users are not asked for consent before their personal data is collected and processed.

- **File:** `app/signup/page.tsx:49-88`
- **Evidence:** The signup form collects name, email, and password with no consent checkbox, privacy policy link, or terms of service agreement. Lines 81 shows `{/* VULN [Cat 23]: No GDPR consent checkbox */}` between the password field and submit button — no consent mechanism exists.
- **Risk:** GDPR Article 6 requires a lawful basis for processing personal data. Article 7 requires that consent be freely given, specific, informed, and unambiguous. Collecting data without consent is a fundamental GDPR violation.
- **Fix:** Add a consent checkbox before the submit button linked to a privacy policy. Record the consent timestamp and version in the database. Allow users to withdraw consent.

---

### Finding 23.3: Analytics Loaded Without Consent (Medium)

Analytics tracking code runs on every page load without checking for user consent.

- **File:** `app/layout.tsx:16-26`
- **Evidence:**
  ```
  <script
    dangerouslySetInnerHTML={{
      __html: `
        (function() {
          window._analytics = [];
          window._analytics.push(['trackPageView', location.pathname]);
          window._analytics.push(['setUser', document.cookie]);
        })();
      `,
    }}
  />
  ```
  This runs in the `<head>` of every page before any consent check. It also sends `document.cookie` to the analytics tracker.
- **Risk:** GDPR Article 7 and the ePrivacy Directive require consent before non-essential tracking. Sending cookies to analytics without consent violates both regulations.
- **Fix:** Gate the analytics script behind a consent check. Implement a cookie consent banner. Only initialize tracking after the user opts in. Remove the `document.cookie` transmission entirely.

---

### Finding 23.4: No Data Retention Policy (Medium)

Personal data has no TTL, expiration, or automated cleanup mechanisms.

- **Evidence:** No fields named `expiresAt`, `retentionDate`, or `deletedAt` exist on PHI models (`User`, `Appointment`, `Message`, `Prescription`, `SymptomCheck`). No scheduled cleanup jobs or data retention policies exist in the codebase.
- **File:** `lib/cache.ts:12` — Cached patient data has no TTL:
  ```
  await redis.set(`patient:${patientId}`, JSON.stringify(data));
  ```
- **Risk:** GDPR Article 5(1)(e) requires data minimization and storage limitation. Indefinite retention of personal data without justification violates the principle of storage limitation.
- **Fix:** Define retention periods for each data type. Add `retentionDate` fields to models. Implement automated cleanup jobs that purge data past its retention period.

---

### Finding 23.5: Personal Data Sent to Third Parties Without Consent Verification (Medium)

Patient symptoms and medical data are sent to the OpenAI API without verifying consent for third-party data processing.

- **File:** `app/api/symptom-checker/route.ts:18-32`
- **Evidence:**
  ```
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are a medical symptom analyzer...",
      },
      {
        role: "user",
        content: `Patient reports the following symptoms: ${symptoms}`,
      },
    ],
  });
  ```
  Patient symptom descriptions (potentially containing PHI) are sent to OpenAI with no consent verification.
- **Risk:** GDPR Article 44-49 governs international data transfers. Sending personal/health data to a third-party AI provider without a Data Processing Agreement (DPA) and without informing the user violates data transfer requirements.
- **Fix:** Obtain explicit consent before sending health data to AI APIs. Document the data processing relationship with OpenAI via a DPA. Inform users in the privacy policy about third-party data processing.

---

## Passed Checks

- [x] Database schema uses opaque IDs (cuid) for primary keys (Category 20 - HIPAA)
- [x] Session model includes IP address and user agent tracking fields (Category 21 - SOC 2)
- [x] AuditLog model exists in schema with appropriate fields (Category 21 - SOC 2, though never used)
- [x] Password hashes use bcrypt format in seed data (Category 21 - SOC 2)
- [x] No TLS 1.0/1.1 or weak cipher configuration found (Category 22 - PCI-DSS)
- [x] Data deletion and export endpoints exist as routes (Category 23 - GDPR, though unimplemented)

---

## Recommendations Summary

### Immediate Actions (Critical)
1. **Remove all card data fields** (`cardNumber`, `cvv`) from the database schema and checkout flow. Use Stripe Elements for PCI compliance.
2. **Implement authentication middleware** that validates sessions on all protected routes, especially admin and PHI endpoints.
3. **Remove all `console.log` statements** that output PHI or card data.
4. **Implement data deletion and export** endpoints for GDPR compliance.

### Short-Term Actions (High)
5. **Configure password policies** with minimum length and complexity requirements.
6. **Add MFA** for admin and privileged access.
7. **Set session timeouts** to prevent indefinite sessions.
8. **Encrypt PHI** before caching in Redis. Add TTL to all cached PHI.
9. **Add consent collection** at signup and before analytics tracking.
10. **Implement audit logging** using the existing `AuditLog` model.

### Medium-Term Actions
11. **Define data retention policies** with automated cleanup.
12. **Establish DPAs** with third-party data processors (OpenAI, Stripe, etc.).
13. **Remove MRNs from URLs** and use opaque identifiers.
14. **Implement a cookie consent banner** gating all non-essential tracking.
