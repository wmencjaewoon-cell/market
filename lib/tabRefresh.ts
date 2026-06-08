import { useEffect, useRef } from 'react';

export type RefreshableTab = 'home' | 'map' | 'chat' | 'my';

type RefreshListener = () => void | Promise<void>;

const listeners: Record<RefreshableTab, Set<RefreshListener>> = {
  home: new Set(),
  map: new Set(),
  chat: new Set(),
  my: new Set(),
};

export function emitTabRefresh(tab: RefreshableTab) {
  listeners[tab].forEach((listener) => {
    void listener();
  });
}

export function subscribeTabRefresh(tab: RefreshableTab, listener: RefreshListener) {
  listeners[tab].add(listener);

  return () => {
    listeners[tab].delete(listener);
  };
}

export function useTabRefresh(tab: RefreshableTab, listener: RefreshListener) {
  const listenerRef = useRef(listener);

  listenerRef.current = listener;

  useEffect(() => {
    return subscribeTabRefresh(tab, () => listenerRef.current());
  }, [tab]);
}
