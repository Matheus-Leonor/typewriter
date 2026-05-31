import { invoke } from '@tauri-apps/api/core';

export interface Session {
  id: string;
  title: string;
  content: string;
  content_type: 'markdown' | 'log' | 'code' | 'free';
  tags: string;
  word_count: number;
  created_at: number;
  updated_at: number;
}

export interface SessionPatch {
  title?: string;
  content?: string;
  content_type?: string;
  tags?: string;
  word_count?: number;
}

export interface Todo {
  id: string;
  list_id: string | null;
  session_id: string | null;
  title: string;
  done: boolean;
  priority: number;
  created_at: number;
  completed_at: number | null;
}

export interface TodoList {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  todos: Todo[];
}

export const db = {
  sessions: {
    create: (id: string, title: string, content_type = 'free') =>
      invoke<Session>('create_session', { id, title, contentType: content_type }),
    get: (id: string) =>
      invoke<Session | null>('get_session', { id }),
    update: (id: string, patch: SessionPatch) =>
      invoke<void>('update_session', { id, patch }),
    list: () =>
      invoke<Session[]>('list_sessions'),
    search: (query: string) =>
      invoke<Session[]>('search_sessions', { query }),
    delete: (id: string) =>
      invoke<void>('delete_session', { id }),
  },

  todos: {
    createList: (id: string, title: string) =>
      invoke<TodoList>('create_todo_list', { id, title }),
    updateListTitle: (id: string, title: string) =>
      invoke<TodoList>('update_todo_list_title', { id, title }),
    listLists: () =>
      invoke<TodoList[]>('list_todo_lists'),
    create: (id: string, title: string, sessionId?: string, priority?: number, listId?: string) =>
      invoke<Todo>('create_todo', {
        id,
        title,
        sessionId: sessionId ?? null,
        priority: priority ?? 0,
        listId: listId ?? null,
      }),
    updateTitle: (id: string, title: string) =>
      invoke<Todo>('update_todo_title', { id, title }),
    toggle: (id: string) =>
      invoke<void>('toggle_todo', { id }),
    list: (sessionId?: string) =>
      invoke<Todo[]>('list_todos', { sessionId: sessionId ?? null }),
    deleteList: (id: string) =>
      invoke<void>('delete_todo_list', { id }),
  },

  settings: {
    get: (key: string) =>
      invoke<string | null>('get_setting', { key }),
    set: (key: string, value: string) =>
      invoke<void>('set_setting', { key, value }),
  },
};
