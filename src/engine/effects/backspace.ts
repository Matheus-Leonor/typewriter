let holdTimer: ReturnType<typeof setTimeout> | null = null;
let isHeld = false;

export function onBackspace(editor: HTMLElement, isCtrl: boolean, held: boolean): void {
  if (isCtrl) {
    // Word delete: opacity fade only, no scale
    editor.style.transition = 'opacity 80ms ease-out';
    editor.style.opacity = '0.7';
    setTimeout(() => {
      editor.style.opacity = '1';
    }, 80);
    return;
  }

  if (held) {
    // Held backspace: blur last chars area
    editor.style.transition = 'filter 60ms ease-out';
    editor.style.filter = 'blur(1px)';
    return;
  }

  // Single backspace: quick opacity dip
  editor.style.transition = 'opacity 60ms ease-out';
  editor.style.opacity = '0.85';
  setTimeout(() => {
    editor.style.transition = 'opacity 60ms ease-in';
    editor.style.opacity = '1';
  }, 60);
}

export function onBackspaceRelease(editor: HTMLElement): void {
  editor.style.transition = 'filter 120ms ease-out';
  editor.style.filter = 'none';
  isHeld = false;
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

export function watchBackspace(editor: HTMLElement): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Backspace') return;

    if (e.ctrlKey || e.metaKey) {
      onBackspace(editor, true, false);
      return;
    }

    if (!holdTimer) {
      holdTimer = setTimeout(() => {
        isHeld = true;
        onBackspace(editor, false, true);
      }, 300);
    }

    if (!isHeld) {
      onBackspace(editor, false, false);
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key !== 'Backspace') return;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (isHeld) {
      onBackspaceRelease(editor);
    }
    isHeld = false;
  };

  editor.addEventListener('keydown', handleKeyDown);
  editor.addEventListener('keyup', handleKeyUp);

  return () => {
    editor.removeEventListener('keydown', handleKeyDown);
    editor.removeEventListener('keyup', handleKeyUp);
  };
}
