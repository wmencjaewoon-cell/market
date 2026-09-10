import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const NOTIFICATION_CHANNEL_ID = "chat_v2";

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

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function makeInFilter(values: string[]) {
  return values.map((value) => encodeURIComponent(value)).join(",");
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
    const requestId = Number(body.requestId);

    if (!Number.isFinite(requestId) || requestId <= 0) {
      return errorResponse("견적문의 정보를 찾을 수 없습니다.", 400);
    }

    const { data: estimateRequest, error: requestError } = await adminClient
      .from("estimate_requests")
      .select(
        [
          "id",
          "user_id",
          "title",
          "category",
          "region",
          "address",
          "desired_date",
          "preferred_contact",
          "applicant_name",
          "assigned_store_user_id",
          "preferred_store_user_id",
          "assigned_staff_user_id",
          "preferred_staff_user_id",
          "status",
          "created_at",
        ].join(", ")
      )
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !estimateRequest) {
      return errorResponse(
        "견적문의 정보를 확인하지 못했습니다.",
        404,
        requestError?.message
      );
    }

    if (estimateRequest.user_id !== user.id) {
      return errorResponse("본인이 등록한 견적문의만 알림을 보낼 수 있습니다.", 403);
    }

    const storeUserId =
      estimateRequest.assigned_store_user_id ||
      estimateRequest.preferred_store_user_id ||
      null;
    const staffTargetIds = uniqueValues([
      estimateRequest.assigned_staff_user_id,
      estimateRequest.preferred_staff_user_id,
    ]);
    const recipientIds = new Set<string>();

    if (storeUserId) {
      recipientIds.add(storeUserId);

      const { data: staffRows, error: staffError } = await adminClient
        .from("store_staff_members")
        .select("staff_user_id, role, status")
        .eq("store_user_id", storeUserId)
        .eq("status", "active");
      (staffRows || []).forEach((staff: any) => {
        const staffUserId = staff?.staff_user_id;
        const isManager = staff?.role === "manager";
        const isAssignedStaff = staffTargetIds.includes(staffUserId);

        if (staffUserId && (isManager || isAssignedStaff)) {
          recipientIds.add(staffUserId);
        }
      });
    } else {
      const { data: adminProfiles, error: adminError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .or("status.is.null,status.neq.blocked");
      (adminProfiles || []).forEach((profile: any) => {
        if (profile?.id) recipientIds.add(profile.id);
      });
    }

    recipientIds.delete(estimateRequest.user_id);

    const recipients = Array.from(recipientIds);

    if (recipients.length === 0) {
      return jsonResponse({ ok: true, reason: "no recipients" });
    }

    const requestTitle =
      String(estimateRequest.title || estimateRequest.category || "견적문의").trim();
    const applicantName =
      String(estimateRequest.applicant_name || "고객").trim() || "고객";
    const regionText =
      String(estimateRequest.address || estimateRequest.region || "").trim();
    const title = "새 견적문의";
    const bodyText = `${applicantName}님이 "${requestTitle}" 견적문의를 보냈습니다.${
      regionText ? ` (${regionText})` : ""
    }`;
    const notificationData = {
      type: "estimate_request",
      estimateRequestId: estimateRequest.id,
      storeUserId,
      applicantName,
      title: requestTitle,
    };

    const { error: notificationError } = await adminClient
      .from("notifications")
      .insert(
        recipients.map((recipientId) => ({
          user_id: recipientId,
          type: "estimate_request",
          title,
          body: bodyText,
          data: notificationData,
        }))
      );

    if (notificationError) {
      return errorResponse(
        "견적문의 알림을 저장하지 못했습니다.",
        500,
        notificationError.message
      );
    }

    const tokenFilter = makeInFilter(recipients);
    const tokenRes = await fetch(
      `${supabaseUrl}/rest/v1/push_tokens?user_id=in.(${tokenFilter})&select=user_id,token,platform`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    const tokenRows = await tokenRes.json();
    const tokenMap = new Map<string, any>();

    (Array.isArray(tokenRows) ? tokenRows : []).forEach((row: any) => {
      if (typeof row?.token === "string" && row.token.length > 0) {
        tokenMap.set(row.token, row);
      }
    });

    const tokens = Array.from(tokenMap.values());

    if (tokens.length === 0) {
      return jsonResponse({ ok: true, count: recipients.length, reason: "no push tokens" });
    }

    const expoMessages = tokens.map((row: any) => ({
      to: row.token,
      sound: "default",
      title,
      body: bodyText,
      channelId: NOTIFICATION_CHANNEL_ID,
      priority: "high",
      data: {
        ...notificationData,
        receiverUserId: row.user_id,
      },
    }));

    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(expoMessages),
    });

    const pushData = await pushRes.json();
    return jsonResponse({ ok: true, count: recipients.length, pushData });
  } catch (error) {
    return errorResponse(String(error), 500);
  }
});
