import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { initialMessages } from "./data.js";
import { addWardrobeItem, deleteWardrobeItem } from "./supabase/client.js";
const useWardrobeStore = create(persist((set) => ({
  items: [],
  activeOutfit: [],
  chatHistory: initialMessages,
  persistedUserId: null,
  sessionVersion: 0,
  setSessionUser: (userId) => set((state) => state.persistedUserId === userId ? {} : {
    persistedUserId: userId,
    items: [],
    activeOutfit: [],
    chatHistory: initialMessages,
    sessionVersion: state.sessionVersion + 1
  }),
  setItems: (items) => set((state) => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const activeOutfit = state.activeOutfit.map((item) => byId.get(item.id) || item).filter((item) => !item.remote || byId.has(item.id));
    return { items, activeOutfit };
  }),
  addToOutfit: (item) => set((state) => ({ activeOutfit: state.activeOutfit.some((x) => x.id === item.id) ? state.activeOutfit : [...state.activeOutfit, item] })),
  removeFromOutfit: (id) => set((state) => ({ activeOutfit: state.activeOutfit.filter((x) => x.id !== id) })),
  removeItem: async (id) => {
    const item = useWardrobeStore.getState().items.find((x) => x.id === id);
    if (item?.remote) await deleteWardrobeItem(item);
    set((state) => ({ items: state.items.filter((x) => x.id !== id), activeOutfit: state.activeOutfit.filter((x) => x.id !== id) }));
  },
  addMessage: (role, text) => set((state) => ({ chatHistory: [...state.chatHistory, { id: crypto.randomUUID(), role, text }] })),
  editMessage: (id, text) => set((state) => ({ chatHistory: state.chatHistory.map((message) => message.id === id && message.role === "user" ? { ...message, text } : message) })),
  deleteMessage: (id) => set((state) => ({ chatHistory: state.chatHistory.filter((message) => !(message.id === id && message.role === "user")) })),
  addItem: async (item) => {
    const saved = await addWardrobeItem(item);
    set((state) => ({ items: [saved, ...state.items] }));
    return saved;
  },
  clearOutfit: () => set({ activeOutfit: [] }),
  clearOutfitAndChat: () => set((state) => ({ activeOutfit: [], chatHistory: initialMessages, sessionVersion: state.sessionVersion + 1 }))
}), {
  name: "forme-stylist-session",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ activeOutfit: state.activeOutfit, chatHistory: state.chatHistory, persistedUserId: state.persistedUserId })
}));
export {
  useWardrobeStore
};
