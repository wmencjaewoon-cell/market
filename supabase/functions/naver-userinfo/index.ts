const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type NaverProfileResponse = {
  resultcode?: string;
  message?: string;
  response?: {
    id?: string;
    email?: string;
    nickname?: string;
    name?: string;
    profile_image?: string;
    mobile?: string;
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authorization = req.headers.get('authorization');

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Naver bearer token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const naverResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: authorization,
      },
    });
    const naverProfile = (await naverResponse.json()) as NaverProfileResponse;
    const profile = naverProfile.response;

    if (!naverResponse.ok || naverProfile.resultcode !== '00' || !profile?.id) {
      return new Response(
        JSON.stringify({
          error: 'Invalid Naver userinfo response',
          message: naverProfile.message,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        sub: profile.id,
        email: profile.email,
        email_verified: Boolean(profile.email),
        name: profile.name || profile.nickname,
        nickname: profile.nickname,
        picture: profile.profile_image,
        phone: profile.mobile,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch Naver userinfo',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
