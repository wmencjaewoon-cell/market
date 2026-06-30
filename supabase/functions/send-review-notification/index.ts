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
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const {
      reviewId,
      listingId,
      saleId,
      roomId,
      reviewerId,
      targetUserId,
      sentiment,
    } = await req.json();

    if (!reviewerId || !targetUserId || reviewerId === targetUserId) {
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

    if (reviewId) {
      const reviewRes = await fetch(
        `${SUPABASE_URL}/rest/v1/reviews?id=eq.${reviewId}&select=id,listing_id,sale_id,reviewer_id,target_user_id`,
        { headers }
      );
      const reviews = await reviewRes.json();
      const review = reviews?.[0];

      if (!review) {
        return new Response(JSON.stringify({ error: 'review not found' }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }

      if (
        review.reviewer_id !== reviewerId ||
        review.target_user_id !== targetUserId ||
        Number(review.listing_id) !== Number(listingId) ||
        Number(review.sale_id) !== Number(saleId)
      ) {
        return new Response(JSON.stringify({ error: 'review mismatch' }), {
          status: 403,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }
    }

    const reviewerProfileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${reviewerId}&select=display_name`,
      { headers }
    );
    const reviewerProfiles = await reviewerProfileRes.json();
    const reviewerName = reviewerProfiles?.[0]?.display_name || '상대방';
    const body =
      sentiment === 'negative'
        ? `${reviewerName}님이 거래 후기를 남겼어요.`
        : `${reviewerName}님이 좋은 거래 후기를 남겼어요.`;

    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: targetUserId,
        type: 'review',
        title: '새 후기가 도착했어요',
        body,
        data: {
          reviewId,
          listingId,
          saleId,
          roomId,
          reviewerId,
        },
      }),
    });

    const tokenRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_tokens?user_id=eq.${targetUserId}&select=token,platform`,
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

    const expoMessages = tokens.map((row: any) => ({
      to: row.token,
      sound: 'default',
      title: '새 후기가 도착했어요',
      body,
      channelId: CHAT_NOTIFICATION_CHANNEL_ID,
      priority: 'high',
      data: {
        type: 'review',
        reviewId,
        listingId,
        saleId,
        roomId,
        reviewerId,
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
    const tokenPlatformCounts = tokens.reduce((acc: Record<string, number>, row: any) => {
      const platform = row.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {});

    console.log(
      'send-review-notification expo result',
      JSON.stringify({
        reviewId,
        listingId,
        saleId,
        roomId,
        targetUserId,
        tokenCount: tokens.length,
        tokenPlatformCounts,
        expoStatus: pushRes.status,
        pushData,
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
