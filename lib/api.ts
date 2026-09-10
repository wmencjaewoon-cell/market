// 백엔드 API 클라이언트: Supabase가 아닌 별도 서버 호출이 필요한 기능에서 사용한다.
import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
