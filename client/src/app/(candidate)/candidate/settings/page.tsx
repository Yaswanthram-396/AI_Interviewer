"use client";

import { PageHeader, Surface } from "@/components/ui/display";
import { SwitchRow } from "@/components/ui/form";
import { roomPreferencesStore, useRoomPreferences } from "@/features/room/roomPreferences";

/** Preferences for the interview room, saved in this browser. */
export default function CandidateSettingsPage() {
  const preferences = useRoomPreferences();
  const set = (patch: Partial<typeof preferences>) => roomPreferencesStore.set((current) => ({ ...current, ...patch }));
  return (
    <>
      <PageHeader title="Settings" description="Preferences for the interview room. They are saved in this browser." />
      <Surface className="max-w-xl divide-y divide-line px-6">
        <SwitchRow checked={preferences.captions} onChange={(captions) => set({ captions })} label="Show SIRI's words as captions" description="Large live captions under the visualizer during the interview." />
        <SwitchRow checked={preferences.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })} label="Reduce motion" description="A calmer visualizer with no looping animation. Your system's reduced-motion setting is always respected." />
      </Surface>
    </>
  );
}
