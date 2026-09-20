import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "Puppyfy UAE";

/**
 * Sends one email through Resend. Returns whether it was accepted so the
 * caller can record an honest status instead of assuming success.
 */
async function deliverEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    return { sent: false, error: "Outgoing email is not configured (RESEND_API_KEY is missing)" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject,
        text: body,
      }),
    });

    if (res.ok) return { sent: true, error: null };

    const detail = await res.text();
    return { sent: false, error: `Resend rejected the request (${res.status}): ${detail.slice(0, 300)}` };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, to, contractId, name, password } = body;

    let subject = "";
    let emailBody = "";

    if (type === "contract_pdf") {
      const { data: contract, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .maybeSingle();

      if (error || !contract) {
        return new Response(JSON.stringify({ error: "Contract not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      subject = `Puppyfy Purchase Contract — ${contract.contract_number}`;
      emailBody = `
Dear ${contract.buyer_name},

Please find your Puppyfy Purchase Contract attached.

Contract Number: ${contract.contract_number}
Contract Date: ${contract.contract_date}
Breed: ${contract.breed || "N/A"}
Purchase Price: AED ${contract.purchase_price}
Handover Date: ${contract.handover_date || "TBD"}

Please review the contract carefully. If you have any questions, don't hesitate to contact us.

Best regards,
Puppyfy UAE Team
      `.trim();

      // Log contract activity
      await supabase.from("contract_activity").insert({
        contract_id: contract.id,
        action: "Contract PDF emailed to client",
      });
    } else if (type === "welcome") {
      subject = "Welcome to Puppyfy CRM — Your Login Credentials";
      emailBody = `
Dear ${name},

Welcome to the Puppyfy UAE CRM team! Your account has been created.

Login Email: ${to}
Temporary Password: ${password}

Please log in at ${Deno.env.get("BASE_URL") || "https://puppyfy.ae"} and change your password after your first login.

Best regards,
Puppyfy UAE Team
      `.trim();
    } else if (type === "password_reset") {
      subject = "Puppyfy CRM — Password Reset";
      emailBody = `
Dear ${name || "User"},

You requested a password reset for your Puppyfy CRM account.

Please click the link below to reset your password:
${Deno.env.get("BASE_URL") || "https://puppyfy.ae"}/reset-password

If you didn't request this, please ignore this email.

Best regards,
Puppyfy UAE Team
      `.trim();
    } else if (type === "handover_reminder") {
      const { data: contract } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .maybeSingle();

      subject = "Puppyfy UAE — Handover Reminder Tomorrow";
      emailBody = `
Dear ${contract?.buyer_name || "Customer"},

This is a friendly reminder that your puppy handover is scheduled for tomorrow, ${contract?.handover_date || "soon"}.

Please make sure to bring:
- Your ID/Passport
- The remaining balance (AED ${contract?.remaining_balance || 0})

We look forward to seeing you!

Best regards,
Puppyfy UAE Team
      `.trim();
    } else {
      return new Response(JSON.stringify({ error: "Unknown email type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const delivery = await deliverEmail(to, subject, emailBody);
    const sendStatus = delivery.sent ? "sent" : "failed";

    // Log the real outcome so the Email Logs page reflects what happened.
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("email_logs").insert({
      to_email: to,
      subject,
      body: emailBody,
      status: sendStatus,
      sent_by: userData.user?.id || null,
    });

    if (!delivery.sent) {
      return new Response(JSON.stringify({ error: delivery.error, status: sendStatus }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, status: sendStatus, subject }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
