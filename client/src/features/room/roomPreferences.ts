"use client";

import { useSyncExternalStore } from "react";
import { createPersistentStore } from "@/lib/persistentStore";

export interface RoomPreferences {
  /** Show SIRI's current words as large captions under the visualizer. */
  captions: boolean;
  /** Calmer visualizer: no looping animation. */
  reduceMotion: boolean;
}

const isPreferences = (value: unknown): value is RoomPreferences =>
  typeof value === "object" && value !== null && typeof (value as RoomPreferences).captions === "boolean" && typeof (value as RoomPreferences).reduceMotion === "boolean";

export const roomPreferencesStore = createPersistentStore<RoomPreferences>("siri.roomPreferences.v1", () => ({ captions: true, reduceMotion: false }), isPreferences);

export function useRoomPreferences(): RoomPreferences {
  return useSyncExternalStore(roomPreferencesStore.subscribe, roomPreferencesStore.getSnapshot, roomPreferencesStore.getServerSnapshot);
}
