import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ROLES = ["admin", "sales", "marketing", "tax_viewer", "finance", "receptionist"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return json({ error: "Not signed in" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData.user) {
      return json({ error: "Not signed in" }, 401);
    }

    const { email, name, role, password } = await req.json();

    if (!email || !password || !role) {
      return json({ error: "Email, password, and role are required" }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: "Password must be at least 6 characters" }, 400);
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return json({ error: "That role cannot be assigned" }, 400);
    }

    // The caller may only add people to the business they belong to.
    const { data: membership } = await admin
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", callerData.user.id)
      .maybeSingle();

    if (!membership) {
      return json({ error: "You do not belong to a business" }, 403);
    }
    if (!["owner", "admin"].includes(membership.role)) {
      return json({ error: "Only an owner or admin can add team members" }, 403);
    }

    // Reuse the existing account if that email already has one, so we never
    // create a duplicate login. Otherwise create the account; the signup
    // trigger builds the profile and membership from the metadata below.
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let userId: string;

    if (existing) {
      userId = existing.id;
      const { error: memberErr } = await admin
        .from("tenant_members")
        .upsert(
          { tenant_id: membership.tenant_id, user_id: userId, role },
          { onConflict: "tenant_id,user_id" },
        );
      if (memberErr) return json({ error: memberErr.message }, 400);
      await admin.from("profiles").update({ role, tenant_id: membership.tenant_id }).eq("id", userId);
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: name || email,
          role,
          tenant_id: membership.tenant_id,
        },
      });
      if (createErr || !created.user) {
        return json({ error: createErr?.message || "Could not create the account" }, 400);
      }
      userId = created.user.id;
    }

    return json({ success: true, user_id: userId, reused_existing_account: !!existing });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
