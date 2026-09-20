import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const WHATSAPP_API_TOKEN = Deno.env.get("WHATSAPP_API_TOKEN") || "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "puppyfy_verify";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // GET request = WhatsApp webhook verification
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("Forbidden", { status: 403 });
    }

    const body = await req.json();

    // Handle internal import request from the CRM frontend
    if (body.action === "import_leads") {
      if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        return new Response(JSON.stringify({ imported: 0, message: "WhatsApp API not configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch recent conversations from WhatsApp Business API
      const waResponse = await fetch(
        `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/conversations?limit=50`,
        { headers: { Authorization: `Bearer ${WHATSAPP_API_TOKEN}` } },
      );

      if (!waResponse.ok) {
        return new Response(JSON.stringify({ imported: 0, message: "Failed to fetch from WhatsApp API" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const waData = await waResponse.json();
      let imported = 0;

      for (const convo of waData.data || []) {
        const phone = convo.id;
        const name = convo.display_phone_number || phone;

        // Check if lead already exists
        const { data: existing } = await supabase
          .from("leads")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();

        if (!existing) {
          await supabase.from("leads").insert({
            name: name || "WhatsApp Contact",
            phone: phone,
            source: "whatsapp",
            status: "new",
            quality: "warm",
          });
          imported++;
        }
      }

      // Log activity
      await supabase.from("activity_logs").insert({
        action: "imported leads from WhatsApp",
        target: `${imported} new leads`,
      });

      return new Response(JSON.stringify({ imported, message: `Imported ${imported} leads` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST request = incoming WhatsApp webhook
    if (body.object) {
      let entry = body.entry;
      if (Array.isArray(entry)) {
        for (const item of entry) {
          const changes = item.changes || [];
          for (const change of changes) {
            if (change.field === "messages" && change.value?.messages) {
              for (const msg of change.value.messages) {
                const from = change.value.contacts?.[0]?.profile?.name || msg.from;
                const phone = msg.from;

                // Check if lead already exists
                const { data: existing } = await supabase
                  .from("leads")
                  .select("id")
                  .eq("phone", phone)
                  .maybeSingle();

                if (!existing) {
                  await supabase.from("leads").insert({
                    name: from,
                    phone: phone,
                    source: "whatsapp",
                    status: "new",
                    quality: "warm",
                  });

                  await supabase.from("activity_logs").insert({
                    action: "auto-created lead from WhatsApp",
                    target: from,
                  });
                }
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown request format" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
