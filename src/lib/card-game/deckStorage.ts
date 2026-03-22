import { supabase } from "../supabase";
import { createDefaultDeckState, readLocalDeckState, writeLocalDeckState, type StoredDeckState } from "./deckBuilding";

export async function loadDeckStateForCurrentUser(): Promise<StoredDeckState> {
  const localState = readLocalDeckState();

  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return localState;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("deck_slots, deck_active_slot")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !data) {
      return localState;
    }

    const mergedState = createDefaultDeckState();
    const incomingSlots = Array.isArray((data as { deck_slots?: unknown[] | null }).deck_slots)
      ? ((data as { deck_slots?: Array<{ id?: string; name?: string; cardIds?: string[] }> }).deck_slots ?? [])
      : [];
    const incomingActiveSlot = (data as { deck_active_slot?: string | null }).deck_active_slot ?? mergedState.activeSlotId;

    const nextState: StoredDeckState = {
      slots: mergedState.slots.map((slot) => {
        const incoming = incomingSlots.find((item) => item.id === slot.id);
        return {
          id: slot.id,
          name: incoming?.name?.trim() || slot.name,
          cardIds: incoming?.cardIds ?? slot.cardIds
        };
      }),
      activeSlotId: mergedState.slots.some((slot) => slot.id === incomingActiveSlot)
        ? incomingActiveSlot
        : mergedState.activeSlotId
    };

    writeLocalDeckState(nextState);
    return nextState;
  } catch {
    return localState;
  }
}

export async function saveDeckStateForCurrentUser(state: StoredDeckState) {
  writeLocalDeckState(state);

  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return { persistedToDatabase: false };
    }

    const { error } = await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        deck_slots: state.slots,
        deck_active_slot: state.activeSlotId
      },
      { onConflict: "id" }
    );

    return {
      persistedToDatabase: !error,
      errorMessage: error?.message
    };
  } catch {
    return {
      persistedToDatabase: false
    };
  }
}
