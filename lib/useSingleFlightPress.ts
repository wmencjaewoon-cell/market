// 중복 터치 방지 훅: 느린 저장/지도/모달 액션이 여러 번 실행되지 않도록 막는다.
import { useCallback, useEffect, useRef } from 'react';

type MaybePromise<T> = T | Promise<T>;

export function useSingleFlightPress(defaultCooldownMs = 900) {
  const locksRef = useRef<Record<string, ReturnType<typeof setTimeout> | true>>({});

  useEffect(() => {
    return () => {
      Object.values(locksRef.current).forEach((lock) => {
        if (lock && lock !== true) {
          clearTimeout(lock);
        }
      });
      locksRef.current = {};
    };
  }, []);

  const release = useCallback((key: string, cooldownMs: number) => {
    const existing = locksRef.current[key];
    if (existing && existing !== true) {
      clearTimeout(existing);
    }

    locksRef.current[key] = setTimeout(() => {
      delete locksRef.current[key];
    }, cooldownMs);
  }, []);

  return useCallback(
    <T,>(key: string, action: () => MaybePromise<T>, cooldownMs = defaultCooldownMs) => {
      if (locksRef.current[key]) return undefined;

      locksRef.current[key] = true;

      try {
        const result = action();

        if (result && typeof (result as Promise<T>).finally === 'function') {
          void (result as Promise<T>).finally(() => release(key, cooldownMs));
        } else {
          release(key, cooldownMs);
        }

        return result;
      } catch (error) {
        release(key, cooldownMs);
        throw error;
      }
    },
    [defaultCooldownMs, release]
  );
}
