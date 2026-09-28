import { create } from "zustand";

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone: "ok" | "error";
}

interface ToastState {
  toasts: Toast[];
  /** Shows a short confirmation in the bottom-right corner. */
  show: (title: string, detail?: string, tone?: Toast["tone"]) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (title, detail, tone = "ok") => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, title, detail, tone }] }));
    setTimeout(() => get().dismiss(id), tone === "error" ? 6000 : 3200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Call from outside React. */
export const toast = (title: string, detail?: string, tone?: Toast["tone"]) =>
  useToastStore.getState().show(title, detail, tone);
