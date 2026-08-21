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

function makeInFilter(values: string[]) {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

function isAcceptedWorkMember(member: any) {
  return (
    member?.invitation_status === "accepted" &&
    ["owner", "manager", "employee"].includes(String(member?.role || ""))
  );
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
    const projectMemberId = String(body.projectMemberId || "").trim();

    if (!projectMemberId) {
      return errorResponse("현장 초대 정보를 찾을 수 없습니다.", 400);
    }

    const { data: member, error: memberError } = await adminClient
      .from("project_members")
      .select(
        [
          "id",
          "project_id",
          "store_user_id",
          "member_user_id",
          "member_type",
          "role",
          "company_name",
          "display_name",
          "phone",
          "invitation_status",
          "invite_token",
          "invite_sent_at",
        ].join(", ")
      )
      .eq("id", projectMemberId)
      .maybeSingle();

    if (memberError || !member) {
      return errorResponse(
        "현장 초대 정보를 확인하지 못했습니다.",
        404,
        memberError?.message
      );
    }

    if (!member.member_user_id) {
      return jsonResponse({ ok: true, reason: "manual invite has no app user" });
    }

    const { data: project, error: projectError } = await adminClient
      .from("store_projects")
      .select(
        [
          "id",
          "name",
          "address",
          "store_user_id",
          "assigned_staff_user_id",
          "status",
        ].join(", ")
      )
      .eq("id", member.project_id)
      .maybeSingle();

    if (projectError || !project) {
      return errorResponse(
        "현장 정보를 확인하지 못했습니다.",
        404,
        projectError?.message
      );
    }

    const isStoreOwner = project.store_user_id === user.id;
    const isAssignedStaff = project.assigned_staff_user_id === user.id;
    let isStoreManager = false;
    let isProjectManager = false;

    if (!isStoreOwner) {
      const { data: staffRow, error: staffError } = await adminClient
        .from("store_staff_members")
        .select("id, role, status")
        .eq("store_user_id", project.store_user_id)
        .eq("staff_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (staffError) {
        console.log("현장 초대 알림 직원 권한 조회 실패:", staffError);
      }

      isStoreManager = ["manager", "owner"].includes(String(staffRow?.role || ""));

      const { data: actorMemberRows, error: actorMemberError } = await adminClient
        .from("project_members")
        .select("id, role, invitation_status")
        .eq("project_id", project.id)
        .eq("member_user_id", user.id);

      if (actorMemberError) {
        console.log("현장 초대 알림 멤버 권한 조회 실패:", actorMemberError);
      }

      isProjectManager = (actorMemberRows || []).some(isAcceptedWorkMember);
    }

    if (!isStoreOwner && !isAssignedStaff && !isStoreManager && !isProjectManager) {
      return errorResponse("현장 초대 알림을 보낼 권한이 없습니다.", 403);
    }

    if (member.member_user_id === user.id) {
      return jsonResponse({ ok: true, reason: "self invite" });
    }

    const recipientId = String(member.member_user_id);
    let roomId: string | null = null;

    const { data: roomRows, error: roomError } = await adminClient
      .from("chat_rooms")
      .select("id")
      .eq("project_id", project.id)
      .eq("room_type", "project")
      .limit(1);

    if (roomError) {
      console.log("현장 초대 알림 채팅방 조회 실패:", roomError);
    }

    roomId = roomRows?.[0]?.id || null;

    if (roomId) {
      const { data: setting, error: settingError } = await adminClient
        .from("chat_room_settings")
        .select("muted")
        .eq("room_id", roomId)
        .eq("user_id", recipientId)
        .maybeSingle();

      if (settingError) {
        console.log("현장 초대 알림 설정 조회 실패:", settingError);
      }

      if (setting?.muted === true) {
        return jsonResponse({ ok: true, reason: "muted", roomId });
      }
    }

    const { data: actorProfile, error: actorProfileError } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (actorProfileError) {
      console.log("현장 초대 알림 발신자 조회 실패:", actorProfileError);
    }

    const projectName = String(project.name || "현장").trim() || "현장";
    const inviteeName =
      String(member.display_name || member.company_name || "협력업체").trim() ||
      "협력업체";
    const actorName = String(actorProfile?.display_name || "가게").trim() || "가게";
    const title = "현장관리 초대";
    const bodyText = `${actorName}님이 ${inviteeName}님을 "${projectName}" 현장에 초대했습니다.`;
    const notificationData = {
      type: "project_invite",
      projectId: project.id,
      projectMemberId: member.id,
      inviteToken: member.invite_token,
      roomId,
      storeUserId: project.store_user_id,
      projectName,
      actorId: user.id,
      actorName,
    };

    const { error: notificationError } = await adminClient
      .from("notifications")
      .insert({
        user_id: recipientId,
        type: "project_invite",
        title,
        body: bodyText,
        data: notificationData,
      });

    if (notificationError) {
      return errorResponse(
        "현장 초대 알림을 저장하지 못했습니다.",
        500,
        notificationError.message
      );
    }

    const tokenFilter = makeInFilter([recipientId]);
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
      return jsonResponse({ ok: true, count: 1, reason: "no push tokens" });
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

    console.log(
      "send-project-invite-notification result",
      JSON.stringify({
        projectMemberId,
        projectId: project.id,
        recipientId,
        tokenCount: tokens.length,
        expoStatus: pushRes.status,
        pushData,
      })
    );

    return jsonResponse({ ok: true, count: 1, pushData });
  } catch (error) {
    return errorResponse(String(error), 500);
  }
});
