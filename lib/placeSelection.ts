export type ChatPlaceSelection = {
  id: string;
  roomId: string;
  address: string;
  latitude: number;
  longitude: number;
};

type PlaceSelectionListener = (selection: ChatPlaceSelection) => void;

const listeners = new Set<PlaceSelectionListener>();
let latestSelection: ChatPlaceSelection | null = null;

export function emitChatPlaceSelection(
  selection: Omit<ChatPlaceSelection, 'id'>
) {
  const payload: ChatPlaceSelection = {
    ...selection,
    id: `${selection.roomId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
  };

  latestSelection = payload;
  listeners.forEach((listener) => listener(payload));
}

export function subscribeChatPlaceSelection(listener: PlaceSelectionListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function consumeLatestChatPlaceSelection(roomId: string) {
  if (!latestSelection || latestSelection.roomId !== roomId) return null;

  const selection = latestSelection;
  latestSelection = null;
  return selection;
}

export function clearChatPlaceSelection(id: string) {
  if (latestSelection?.id === id) {
    latestSelection = null;
  }
}
