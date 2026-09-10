import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(message: string, status = 400, detail?: unknown) {
  return jsonResponse({ error: message, detail }, status);
}

function randomString(length: number) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse("Supabase 환경변수가 필요합니다.", 500, {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasAnonKey: Boolean(anonKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
    }

    const authorization = req.headers.get("Authorization") || "";

    if (!authorization) {
      return errorResponse("로그인이 필요합니다.", 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return errorResponse(
        "로그인 사용자를 확인하지 못했습니다.",
        401,
        userError?.message
      );
    }

    const body = await req.json().catch(() => ({}));
    const staffMemberId =
      typeof body.staffMemberId === "string" ? body.staffMemberId : "";
    const requestedStoreUserId =
      typeof body.storeUserId === "string" ? body.storeUserId : null;

    if (!staffMemberId) {
      return errorResponse("직원 정보를 찾을 수 없습니다.", 400);
    }

    const { data: callerProfile, error: callerError } = await adminClient
      .from("profiles")
      .select("id, role, user_type, business_verified, status")
      .eq("id", user.id)
      .maybeSingle();

    if (callerError || !callerProfile) {
      return errorResponse(
        "호출자 프로필을 확인하지 못했습니다.",
        403,
        callerError?.message
      );
    }

    const callerStatus = callerProfile.status || "active";
    const isAdmin =
      callerProfile.role === "admin" && callerStatus !== "blocked";
    const isVerifiedStore =
      callerProfile.user_type === "store" &&
      callerProfile.business_verified === true &&
      callerStatus === "active";

    if (!isAdmin && callerStatus !== "active") {
      return errorResponse("활성 계정만 직원 비밀번호를 재발급할 수 있습니다.", 403);
    }

    let managerMembership: { store_user_id: string } | null = null;

    if (!isAdmin && !isVerifiedStore) {
      const { data: membershipData, error: membershipError } = await adminClient
        .from("store_staff_members")
        .select("store_user_id")
        .eq("staff_user_id", user.id)
        .eq("role", "manager")
        .eq("status", "active")
        .maybeSingle();

      if (membershipError) {
        return errorResponse("매니저 권한을 확인하지 못했습니다.", 403, membershipError.message);
      }

      managerMembership = membershipData || null;
    }

    const storeUserId = isAdmin && requestedStoreUserId
      ? requestedStoreUserId
      : isVerifiedStore
        ? user.id
        : managerMembership?.store_user_id || null;

    if (!storeUserId) {
      return errorResponse("직원 비밀번호 재발급 권한이 없습니다.", 403);
    }

    const { data: staffMember, error: staffError } = await adminClient
      .from("store_staff_members")
      .select("id, store_user_id, staff_user_id, staff_login_id, display_name, role, status")
      .eq("id", staffMemberId)
      .eq("store_user_id", storeUserId)
      .maybeSingle();

    if (staffError) {
      return errorResponse("직원 정보를 확인하지 못했습니다.", 500, staffError.message);
    }

    if (!staffMember?.staff_user_id || !staffMember.staff_login_id) {
      return errorResponse("해당 가게의 직원 계정을 찾을 수 없습니다.", 404);
    }

    if (staffMember.status !== "active") {
      return errorResponse("비활성화된 직원 계정은 비밀번호를 재발급할 수 없습니다.", 403);
    }

    const password = `Im${randomString(10)}!7`;
    const { error: updateAuthError } =
      await adminClient.auth.admin.updateUserById(staffMember.staff_user_id, {
        password,
        user_metadata: {
          user_type: "staff",
          store_user_id: storeUserId,
          display_name: staffMember.display_name || null,
          password_reset_by: user.id,
          password_reset_at: new Date().toISOString(),
        },
      });

    if (updateAuthError) {
      return errorResponse(
        updateAuthError.message || "직원 비밀번호 변경에 실패했습니다.",
        400
      );
    }

    await adminClient
      .from("profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", staffMember.staff_user_id);

    return jsonResponse({
      loginId: staffMember.staff_login_id,
      password,
      message: "직원 임시 비밀번호를 재발급했습니다.",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
});
