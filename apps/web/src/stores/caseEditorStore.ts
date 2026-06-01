import { create } from 'zustand';

interface CaseEditorState {
  yamlText: string;
  dirty: boolean;
  setYamlText: (value: string) => void;
  resetYamlText: (value: string) => void;
  markSaved: () => void;
}

export const useCaseEditorStore = create<CaseEditorState>((set) => ({
  yamlText: '',
  dirty: false,
  setYamlText: (yamlText) => set({ yamlText, dirty: true }),
  resetYamlText: (yamlText) => set({ yamlText, dirty: false }),
  markSaved: () => set({ dirty: false }),
}));
