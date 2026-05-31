import { useState, useCallback } from 'react';

interface TablePickerProps {
  left: number;
  top: number;
  onInsert: (rows: number, cols: number) => void;
  onClose: () => void;
}

export function TablePicker({ left, top, onInsert, onClose }: TablePickerProps) {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);
  const size = 6;

  const handleMouseEnter = useCallback((row: number, col: number) => {
    setHovered({ row, col });
  }, []);

  const handleClick = useCallback(
    (row: number, col: number) => {
      onInsert(row + 1, col + 1);
    },
    [onInsert],
  );

  return (
    <div
      className="table-picker"
      style={{ left, top }}
      onMouseLeave={onClose}
    >
      <div className="table-picker__grid">
        {Array.from({ length: size }, (_, r) => (
          <div key={r} className="table-picker__row">
            {Array.from({ length: size }, (_, c) => {
              const isActive = hovered && r <= hovered.row && c <= hovered.col;
              return (
                <div
                  key={c}
                  className={`table-picker__cell${isActive ? ' active' : ''}`}
                  onMouseEnter={() => handleMouseEnter(r, c)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleClick(r, c);
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="table-picker__label">
        {hovered ? `${hovered.row + 1} × ${hovered.col + 1}` : 'Selecione o tamanho'}
      </div>
    </div>
  );
}
