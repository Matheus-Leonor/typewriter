import { invoke } from '@tauri-apps/api/core';

export async function ensureAgentWorkspaceStructure(vaultPath: string): Promise<void> {
  await invoke('ensure_agent_workspace', { vaultPath });
}
