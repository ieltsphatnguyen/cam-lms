import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // Verify caller is admin
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    // ── List users ────────────────────────────────────────
    if (action === "list" && req.method === "GET") {
      const { data: profiles, error: profileError } = await adminClient
        .from("profiles")
        .select("id, role, teacher_id, student_id, display_name, avatar_url, created_at")
        .order("created_at", { ascending: false });

      if (profileError) throw profileError;

      const { data: authUsers, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) throw listError;

      const authMap: Record<string, {
        email: string;
        banned: boolean;
        last_sign_in_at: string | null;
        created_at: string | null;
      }> = {};
      for (const u of authUsers.users) {
        authMap[u.id] = {
          email: u.email ?? "",
          banned: u.banned_until ? new Date(u.banned_until) > new Date() : false,
          last_sign_in_at: u.last_sign_in_at ?? null,
          created_at: u.created_at ?? null,
        };
      }

      const users = (profiles ?? []).map((p) => ({
        ...p,
        email: authMap[p.id]?.email ?? "",
        disabled: authMap[p.id]?.banned ?? false,
        last_sign_in_at: authMap[p.id]?.last_sign_in_at ?? null,
        auth_created_at: authMap[p.id]?.created_at ?? null,
      }));

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Actions requiring a user_id ───────────────────────
    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body.user_id;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id is required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent admin from disabling/resetting password on themselves
    if (targetUserId === userData.user.id && (action === "disable" || action === "reset_password")) {
      return new Response(JSON.stringify({ error: "You cannot modify your own account." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Change role ────────────────────────────────────────
    if (action === "change_role" && req.method === "POST") {
      const newRole: string | undefined = body.new_role;
      if (!newRole || !["student", "teacher", "admin"].includes(newRole)) {
        return new Response(JSON.stringify({ error: "Invalid role." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (targetUserId === userData.user.id) {
        return new Response(JSON.stringify({ error: "You cannot change your own role." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: rpcError } = await callerClient.rpc("change_user_role", {
        p_target_id: targetUserId,
        p_new_role: newRole,
      });

      if (rpcError) {
        const status = rpcError.message.includes("Forbidden") ? 403
          : rpcError.message.includes("At least one") ? 400
          : 422;
        return new Response(JSON.stringify({ error: rpcError.message }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Reset password ───────────────────────────────────
    if (action === "reset_password" && req.method === "POST") {
      const newPassword: string | undefined = body.password;
      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Disable account ───────────────────────────────────
    if (action === "disable" && req.method === "POST") {
      // Prevent disabling the last admin
      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", targetUserId)
        .maybeSingle();

      if (targetProfile?.role === "admin") {
        const { count } = await adminClient
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .neq("id", targetUserId);

        if ((count ?? 0) === 0) {
          return new Response(JSON.stringify({
            error: "At least one administrator must remain active.",
          }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "8765h",
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Restore account ───────────────────────────────────
    if (action === "restore" && req.method === "POST") {
      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
