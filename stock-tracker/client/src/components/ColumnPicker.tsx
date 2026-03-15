import React, { useState, useRef, useEffect } from 'react';
import { Settings2, Check } from 'lucide-react';
import { ALL_COLUMNS, COLUMN_TEMPLATES } from '../types';

interface Props {
  selectedColumns: string[];
  onChange: (columns: string[]) => void;
  extraColumns?: { key: string; label: string }[];
}

export default function ColumnPicker({ selectedColumns, onChange, extraColumns }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleColumn = (key: string) => {
    if (selectedColumns.includes(key)) {
      onChange(selectedColumns.filter((c) => c !== key));
    } else {
      onChange([...selectedColumns, key]);
    }
  };

  const applyTemplate = (templateKey: string) => {
    const template = COLUMN_TEMPLATES[templateKey];
    if (template) onChange(template.columns);
  };

  const categories = new Map<string, typeof ALL_COLUMNS>();
  for (const col of ALL_COLUMNS) {
    const cat = categories.get(col.category) || [];
    cat.push(col);
    categories.set(col.category, cat);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-secondary flex items-center gap-1.5"
      >
        <Settings2 className="w-4 h-4" />
        Columns
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 card p-3 z-30 max-h-[500px] overflow-y-auto shadow-lg">
          {/* Templates */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Templates</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(COLUMN_TEMPLATES).map(([key, tmpl]) => (
                <button
                  key={key}
                  onClick={() => applyTemplate(key)}
                  className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Extra columns (e.g. alarm diff for favorites) */}
          {extraColumns && extraColumns.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Special</div>
              {extraColumns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-0.5 cursor-pointer text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 px-1 rounded">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    selectedColumns.includes(col.key)
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {selectedColumns.includes(col.key) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {col.label}
                </label>
              ))}
            </div>
          )}

          {/* Metric columns by category */}
          {Array.from(categories.entries()).map(([category, cols]) => (
            <div key={category} className="mb-2">
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{category}</div>
              {cols.map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-0.5 cursor-pointer text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 px-1 rounded">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    selectedColumns.includes(col.key)
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {selectedColumns.includes(col.key) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {col.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
