import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_v2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { roomId, senderId, message } = await req.json();

    if (!roomId || !senderId || !message) {
      return new Response(JSON.stringify({ error: 'missing params' }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const headers = {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const membersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_room_members?room_id=eq.${roomId}&select=user_id`,
      { headers }
    );

    const members = await membersRes.json();

    const receiverIds = members
      .map((m: any) => m.user_id)
      .filter((id: string) => id !== senderId);

    if (receiverIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, reason: 'no receiver' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const receiverId = receiverIds[0];

    const senderProfileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${senderId}&select=display_name`,
      { headers }
    );

    const senderProfiles = await senderProfileRes.json();

    const senderName = senderProfiles?.[0]?.display_name || '상대방';

    const settingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_room_settings?room_id=eq.${roomId}&user_id=eq.${receiverId}&select=muted`,
      { headers }
    );

    const settings = await settingRes.json();

    if (settings?.[0]?.muted === true) {
      return new Response(JSON.stringify({ ok: true, reason: 'muted' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const tokenRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_tokens?user_id=eq.${receiverId}&select=token,platform`,
      { headers }
    );

    const tokens = await tokenRes.json();

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, reason: 'no token' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const rawMessage = String(message);
    const placeAddressLine = rawMessage
      .split('\n')
      .find((line) => line.trim().startsWith('주소:'));
    const placeAddress = placeAddressLine
      ? placeAddressLine.replace(/^주소:\s*/, '').trim()
      : '';

    const bodyText =
      rawMessage.startsWith('📷')
        ? '사진을 보냈습니다.'
        : rawMessage.startsWith('📍 약속 장소') && placeAddress
          ? `약속장소: ${placeAddress}`.slice(0, 80)
          : rawMessage.slice(0, 80);

    const expoMessages = tokens.map((row: any) => ({
      to: row.token,
      sound: 'default',
      title: `${senderName}`,
      body: bodyText,

      // Android heads-up 알림에 중요
      channelId: CHAT_NOTIFICATION_CHANNEL_ID,
      priority: 'high',

      data: {
        type: 'chat',
        roomId,
        senderId,
        senderName,
      },
    }));

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoMessages),
    });

    const pushData = await pushRes.json();
    let receiptData: unknown = null;
    const ticketIds =
      Array.isArray(pushData?.data)
        ? pushData.data
            .map((ticket: any) => ticket?.id)
            .filter((id: unknown): id is string => typeof id === 'string')
        : [];

    if (Deno.env.get('EXPO_PUSH_RECEIPT_DEBUG') === 'true' && ticketIds.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const receiptRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: ticketIds }),
      });

      receiptData = await receiptRes.json();
    }

    const tokenPlatformCounts = tokens.reduce((acc: Record<string, number>, row: any) => {
      const platform = row.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {});

    console.log(
      'send-chat-push expo result',
      JSON.stringify({
        roomId,
        receiverId,
        tokenCount: tokens.length,
        tokenPlatformCounts,
        expoStatus: pushRes.status,
        pushData,
        receiptData,
      })
    );

    return new Response(JSON.stringify({ ok: true, pushData }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
