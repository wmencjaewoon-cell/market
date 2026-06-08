import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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
      `${SUPABASE_URL}/rest/v1/push_tokens?user_id=eq.${receiverId}&select=token`,
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

    const bodyText =
      String(message).startsWith('📷')
        ? '사진을 보냈습니다.'
        : String(message).slice(0, 80);

    const expoMessages = tokens.map((row: any) => ({
      to: row.token,
      sound: 'default',
      title: '새로운 메시지가 있어요',
      body: bodyText,
      data: {
        type: 'chat',
        roomId,
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