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

async function sendResendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("PASSWORD_RESET_FROM_EMAIL") ||
    Deno.env.get("MAIL_FROM") ||
    "Interior Market <noreply@interiormarket.co.kr>";

  if (!resendKey) {
    throw new Error("RESEND_API_KEY 환경변수가 필요합니다.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "메일 발송에 실패했습니다.");
  }
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
      .select("email, display_name")
      .eq("id", staffMember.store_user_id)
      .maybeSingle();

    if (storeProfileError) {
      return errorResponse("가게 계정 이메일을 확인하지 못했습니다.", 500, storeProfileError.message);
    }

    let storeEmail = storeProfile?.email || null;

    if (!storeEmail) {
      const { data: storeAuthUser, error: storeAuthError } =
        await adminClient.auth.admin.getUserById(staffMember.store_user_id);

      if (storeAuthError) {
        return errorResponse("가게 계정 이메일을 확인하지 못했습니다.", 500, storeAuthError.message);
      }

      storeEmail = storeAuthUser.user?.email || null;
    }

    if (!storeEmail) {
      return errorResponse("가게 계정에 이메일이 등록되어 있지 않습니다.", 400);
    }

    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: staffMember.staff_login_id,
        options: {
          redirectTo: redirectTo || undefined,
        },
      });

    if (linkError || !linkData?.properties?.action_link) {
      return errorResponse(
        linkError?.message || "비밀번호 재설정 링크를 만들지 못했습니다.",
        400
      );
    }

    const origin = getOriginFromRedirect(redirectTo);
    const storeName = storeProfile?.display_name || "가게";
    const staffName = staffMember.display_name || "직원";
    const actionLink = linkData.properties.action_link;

    await sendResendEmail({
      to: storeEmail,
      subject: `[인테리어마켓] ${staffName} 직원 계정 비밀번호 재설정`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2 style="margin:0 0 12px">직원 계정 비밀번호 재설정</h2>
          <p>${storeName}의 직원 계정 비밀번호 재설정 요청이 접수되었습니다.</p>
          <p><strong>직원 아이디:</strong> ${staffMember.staff_login_id}</p>
          <p><strong>직원 이름:</strong> ${staffName}</p>
          <p>아래 링크를 열어 새 비밀번호를 설정해 주세요.</p>
          <p>
            <a href="${actionLink}" style="display:inline-block;background:#111827;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none">
              비밀번호 재설정
            </a>
          </p>
          <p style="font-size:13px;color:#6b7280">
            링크가 열리지 않으면 아래 주소를 복사해 브라우저에서 열어 주세요.<br />
            ${actionLink}
          </p>
          <p style="font-size:13px;color:#6b7280">
            요청한 적이 없다면 이 메일을 무시해 주세요. 요청 출처: ${origin}
          </p>
        </div>
      `,
    });

    return jsonResponse({
      type: "staff",
      message: "가게 이메일로 비밀번호 재설정 안내가 전송되었습니다.",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
});
