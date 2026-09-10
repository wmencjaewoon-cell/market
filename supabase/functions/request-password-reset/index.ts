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

function normalizeIdentifier(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function getOriginFromRedirect(redirectTo: string | null) {
  if (!redirectTo) return "인테리어마켓";

  try {
    const parsed = new URL(redirectTo);
    return parsed.origin;
  } catch {
    return "인테리어마켓";
  }
}

async function sendStaffPasswordResetPush({
  adminClient,
  recipientIds,
  title,
  body,
  data,
}: {
  adminClient: any;
  recipientIds: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
}) {
  if (recipientIds.length === 0) return;

  const { data: tokenRows, error: tokenError } = await adminClient
    .from("push_tokens")
    .select("user_id, token, platform")
    .in("user_id", recipientIds);

  if (tokenError || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return;
  }

  const tokenMap = new Map<string, any>();
  tokenRows.forEach((row: any) => {
    if (typeof row?.token === "string" && row.token.length > 0) {
      tokenMap.set(row.token, row);
    }
  });

  const expoMessages = Array.from(tokenMap.values()).map((row: any) => ({
    to: row.token,
    sound: "default",
    title,
    body,
    channelId: "chat_v2",
    priority: "high",
    data: {
      type: "staff_password_reset_request",
      receiverUserId: row.user_id,
      ...data,
    },
  }));

  if (expoMessages.length === 0) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(expoMessages),
  }).catch(() => undefined);
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

    const body = await req.json().catch(() => ({}));
    const identifier = normalizeIdentifier(body.emailOrLoginId);
    const redirectTo =
      typeof body.redirectTo === "string" && body.redirectTo.trim()
        ? body.redirectTo.trim()
        : null;

    if (!identifier) {
      return errorResponse("아이디 또는 이메일을 입력해 주세요.", 400);
    }

    const anonClient = createClient(supabaseUrl, anonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: staffMember, error: staffError } = await adminClient
      .from("store_staff_members")
      .select("id, store_user_id, staff_user_id, staff_login_id, display_name, status")
      .eq("staff_login_id", identifier)
      .maybeSingle();

    if (staffError) {
      return errorResponse("직원 계정 확인 중 오류가 발생했습니다.", 500, staffError.message);
    }

    if (!staffMember) {
      const { error } = await anonClient.auth.resetPasswordForEmail(identifier, {
        redirectTo: redirectTo || undefined,
      });

      if (error) {
        return errorResponse(error.message, 400);
      }

      return jsonResponse({
        type: "user",
        message: "가입 이메일로 비밀번호 재설정 안내가 전송되었습니다.",
      });
    }

    if (staffMember.status !== "active") {
      return errorResponse("비활성화된 직원 계정은 비밀번호를 재설정할 수 없습니다.", 403);
    }

    const { data: storeProfile, error: storeProfileError } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", staffMember.store_user_id)
      .maybeSingle();

    if (storeProfileError) {
      return errorResponse("가게 계정을 확인하지 못했습니다.", 500, storeProfileError.message);
    }

    const origin = getOriginFromRedirect(redirectTo);
    const storeName = storeProfile?.display_name || "가게";
    const staffName = staffMember.display_name || "직원";

    const { data: managerRows, error: managerError } = await adminClient
      .from("store_staff_members")
      .select("staff_user_id")
      .eq("store_user_id", staffMember.store_user_id)
      .eq("role", "manager")
      .eq("status", "active");

    if (managerError) {
      return errorResponse("가게 매니저를 확인하지 못했습니다.", 500, managerError.message);
    }

    const recipientIds = Array.from(
      new Set([
        staffMember.store_user_id,
        ...((managerRows || []) as any[])
          .map((row) => row.staff_user_id)
          .filter((id) => !!id && id !== staffMember.staff_user_id),
      ])
    );

    const requestedAt = new Date().toISOString();
    const notificationTitle = "직원 비밀번호 찾기 요청";
    const notificationBody = `${staffName} 직원이 비밀번호 재설정을 요청했습니다. 직원관리에서 임시 비밀번호를 재발급해 주세요.`;
    const notificationData = {
      storeUserId: staffMember.store_user_id,
      staffMemberId: staffMember.id,
      staffUserId: staffMember.staff_user_id,
      staffLoginId: staffMember.staff_login_id,
      staffName,
      storeName,
      origin,
      requestedAt,
    };

    const { error: notificationError } = await adminClient
      .from("notifications")
      .insert(
        recipientIds.map((userId) => ({
          user_id: userId,
          type: "staff_password_reset_request",
          title: notificationTitle,
          body: notificationBody,
          data: notificationData,
        }))
      );

    if (notificationError) {
      return errorResponse("가게 대표/매니저 알림을 만들지 못했습니다.", 500, notificationError.message);
    }

    await sendStaffPasswordResetPush({
      adminClient,
      recipientIds,
      title: notificationTitle,
      body: notificationBody,
      data: notificationData,
    });

    return jsonResponse({
      type: "staff",
      message: "가게 대표/매니저에게 비밀번호 재발급 요청 알림을 보냈습니다.",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
});
