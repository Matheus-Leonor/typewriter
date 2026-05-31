import { useCallback, useRef } from 'react';
import { Session } from '../db';
import { sessionStore, generateTitle, countWords } from './SessionStore';

const TITLE_LOCK_AFTER = 3;
const AUTOSAVE_DEBOUNCE = 1500;

export function useSession(
  session: Session,
  onSessionChange: (updated: Session) => void,
) {
  const editCountRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateContent = useCallback(
    (content: string) => {
      const wordCount = countWords(content);
      editCountRef.current++;

      const shouldUpdateTitle = editCountRef.current <= TITLE_LOCK_AFTER;
      const title = shouldUpdateTitle ? generateTitle(content) : session.title;

      const updated: Session = { ...session, content, word_count: wordCount, title };
      onSessionChange(updated);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const patch: Parameters<typeof sessionStore.update>[1] = {
          content,
          word_count: wordCount,
        };
        if (shouldUpdateTitle) patch.title = title;
        sessionStore.update(session.id, patch);
      }, AUTOSAVE_DEBOUNCE);
    },
    [session, onSessionChange],
  );

  return { updateContent };
}
