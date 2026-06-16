import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NAVER_CLIENT_ID,
  NAVER_CLIENT_SECRET,
  NAVER_USERINFO_URL,
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const supabaseUrl = requireEnv('SUPABASE_URL', SUPABASE_URL);
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
const naverClientId = requireEnv('NAVER_CLIENT_ID', NAVER_CLIENT_ID);
const naverClientSecret = requireEnv('NAVER_CLIENT_SECRET', NAVER_CLIENT_SECRET);
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const userinfoUrl =
  NAVER_USERINFO_URL || `https://${projectRef}.functions.supabase.co/naver-userinfo`;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const identifier = 'custom:naver';
const providerConfig = {
  name: 'Naver',
  client_id: naverClientId,
  client_secret: naverClientSecret,
  scopes: [],
  pkce_enabled: false,
  authorization_url: 'https://nid.naver.com/oauth2.0/authorize',
  token_url: 'https://nid.naver.com/oauth2.0/token',
  userinfo_url: userinfoUrl,
  enabled: true,
  email_optional: true,
};

const { data: existingProvider, error: getError } =
  await supabase.auth.admin.customProviders.getProvider(identifier);

if (getError && getError.status !== 404) {
  throw getError;
}

if (existingProvider) {
  const { data, error } = await supabase.auth.admin.customProviders.updateProvider(
    identifier,
    providerConfig
  );

  if (error) throw error;

  console.log(`Updated ${identifier}: ${data.name}`);
} else {
  const { data, error } = await supabase.auth.admin.customProviders.createProvider({
    provider_type: 'oauth2',
    identifier,
    ...providerConfig,
  });

  if (error) throw error;

  console.log(`Created ${identifier}: ${data.name}`);
}

console.log(`Naver userinfo URL: ${userinfoUrl}`);
