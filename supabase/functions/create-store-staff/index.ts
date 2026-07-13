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
  return jsonResponse(
    {
      error: message,
      detail,
    },
    status
  );
}

function randomString(length: number) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
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
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const phone = normalizePhone(body.phone);
    const position =
      typeof body.position === "string" ? body.position.trim() || null : null;
    const role = body.role === "manager" ? "manager" : "staff";
    const requestedStoreUserId =
      typeof body.storeUserId === "string" ? body.storeUserId : null;

    if (!displayName) {
      return errorResponse("직원 이름을 입력해 주세요.", 400);
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
      return errorResponse("활성 계정만 직원 계정을 만들 수 있습니다.", 403, {
        status: callerProfile.status,
      });
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
        : managerMembership?.store_user_id || user.id;

    if (!isAdmin && !isVerifiedStore && !managerMembership) {
      return errorResponse("직원 생성 권한이 없습니다.", 403, {
        userType: callerProfile.user_type,
        businessVerified: callerProfile.business_verified,
        status: callerProfile.status,
      });
    }

    const { data: storeProfile, error: storeError } = await adminClient
      .from("profiles")
      .select("id, display_name, user_type, business_verified, status")
      .eq("id", storeUserId)
      .maybeSingle();

    if (
      storeError ||
      !storeProfile ||
      storeProfile.user_type !== "store" ||
      storeProfile.business_verified !== true ||
      (storeProfile.status || "active") !== "active"
    ) {
      return errorResponse("인증 완료된 가게만 직원 계정을 만들 수 있습니다.", 400, {
        storeError: storeError?.message,
        storeUserId,
        userType: storeProfile?.user_type,
        businessVerified: storeProfile?.business_verified,
        status: storeProfile?.status,
      });
    }

    const loginCode = `staff-${randomString(8).toLowerCase()}`;
    const loginId = `${loginCode}@staff.interior-market.wmenc.co.kr`;
    const password = `Im${randomString(10)}!7`;

    const { data: createdUser, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email: loginId,
        password,
        email_confirm: true,
        user_metadata: {
          user_type: "staff",
          store_user_id: storeUserId,
          display_name: displayName,
          phone,
        },
      });

    if (createUserError || !createdUser.user) {
      return errorResponse(
        createUserError?.message || "직원 계정 생성에 실패했습니다.",
        400
      );
    }

    const staffUserId = createdUser.user.id;

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: staffUserId,
      email: loginId,
      display_name: displayName,
      phone,
      user_type: "staff",
      status: "active",
      can_create_listing: role === "manager",
      can_start_chat: true,
      reports_count: 0,
      trust_points: 0,
      trust_level: 1,
      seller_level_style: "clean",
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(staffUserId);
      return errorResponse(profileError.message, 400, { step: "profiles.upsert" });
    }

    const { data: staffMember, error: staffError } = await adminClient
      .from("store_staff_members")
      .insert({
        store_user_id: storeUserId,
        staff_user_id: staffUserId,
        staff_login_id: loginId,
        role,
        status: "active",
        display_name: displayName,
        phone,
        position,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (staffError) {
      await adminClient.auth.admin.deleteUser(staffUserId);
      return errorResponse(staffError.message, 400, { step: "store_staff_members.insert" });
    }

    return jsonResponse({
      staff: staffMember,
      loginId,
      password,
      message: "직원 계정이 생성되었습니다. 비밀번호는 다시 확인할 수 없습니다.",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
});
