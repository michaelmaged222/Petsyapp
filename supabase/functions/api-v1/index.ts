import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-API-Key",
};

interface RouteMatch {
  table: string;
  id?: string;
  params: Record<string, string>;
}

function parseRoute(path: string): RouteMatch | null {
  // Expected: /api/v1/{resource} or /api/v1/{resource}/{id}
  const parts = path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const tableMap: Record<string, string> = {
    leads: 'leads',
    clients: 'clients',
    sales: 'sales',
    contracts: 'contracts',
    invoices: 'invoices',
    expenses: 'expenses',
    inventory: 'inventory_items',
    employees: 'profiles',
    activity_logs: 'activity_logs',
    custom_fields: 'custom_fields',
  };

  const table = tableMap[parts[0]];
  if (!table) return null;

  return {
    table,
    id: parts[1],
    params: {},
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const route = parseRoute(url.pathname);
    if (!route) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate via API key header
    const apiKey = req.headers.get("X-API-Key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing X-API-Key header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the tenant by API key
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, status, plan_tier')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tenant.status !== 'active') {
      return new Response(JSON.stringify({ error: "Tenant is not active" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tenant.plan_tier !== 'enterprise') {
      return new Response(JSON.stringify({ error: "API access requires Enterprise tier" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build query with tenant filter (bypass RLS using service role)
    let query = supabase.from(route.table).select('*').eq('tenant_id', tenant.id);

    // Filter by ID if provided
    if (route.id) {
      query = query.eq('id', route.id);
    }

    // Apply query params as filters
    url.searchParams.forEach((value, key) => {
      if (key !== 'limit' && key !== 'offset' && key !== 'order') {
        query = query.eq(key, value);
      }
    });

    // Pagination
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const order = url.searchParams.get('order') || 'created_at.desc';

    query = query.range(offset, offset + limit - 1);
    if (order.includes('.')) {
      const [col, dir] = order.split('.');
      query = query.order(col, { ascending: dir === 'asc' });
    }

    if (req.method === 'GET') {
      if (route.id) {
        const { data, error } = await query.maybeSingle();
        if (error) throw new Error(error.message);
        return new Response(JSON.stringify(data || { error: "Not found" }), {
          status: data ? 200 : 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data, count: count ?? data?.length ?? 0, limit, offset }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { data, error } = await supabase
        .from(route.table)
        .insert({ ...body, tenant_id: tenant.id })
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === 'PUT' && route.id) {
      const body = await req.json();
      const { data, error } = await supabase
        .from(route.table)
        .update(body)
        .eq('id', route.id)
        .eq('tenant_id', tenant.id)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === 'DELETE' && route.id) {
      const { error } = await supabase
        .from(route.table)
        .delete()
        .eq('id', route.id)
        .eq('tenant_id', tenant.id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
