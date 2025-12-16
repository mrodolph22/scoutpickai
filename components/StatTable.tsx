import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Column {
  header: string;
  accessor: (item: any) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface StatTableProps {
  title?: string;
  columns: Column[];
  data: any[];
  onRowClick?: (item: any) => void;
  highlightRow?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

const StatTable: React.FC<StatTableProps> = ({ 
  title, 
  columns, 
  data, 
  onRowClick, 
  highlightRow,
  collapsible = false,
  defaultExpanded = true,
  className
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const containerClasses = className !== undefined
    ? `w-full bg-white overflow-hidden ${className}`
    : `w-full bg-white rounded-lg border border-gray-200 overflow-hidden mb-6`;

  return (
    <div className={containerClasses}>
      {title && (
        <div 
          onClick={() => collapsible && setIsExpanded(!isExpanded)}
          className={`bg-gray-50 px-4 py-2 font-semibold text-gray-700 text-sm uppercase tracking-wide 
            ${(!collapsible || isExpanded) ? 'border-b border-gray-200' : ''} 
            ${collapsible ? 'cursor-pointer flex justify-between items-center hover:bg-gray-100 transition-colors' : ''}`}
        >
          <span>{title}</span>
          {collapsible && (
            isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />
          )}
        </div>
      )}
      {(!collapsible || isExpanded) && (
        <div className="overflow-x-auto">
          <div className="min-w-full">
              {/* Header */}
              <div className="flex border-b border-gray-200 bg-gray-50/50">
                  {columns.map((col, idx) => (
                      <div 
                          key={idx} 
                          className={`py-2 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider ${col.width || 'flex-1'} text-${col.align || 'left'}`}
                      >
                          {col.header}
                      </div>
                  ))}
              </div>
              
              {/* Rows */}
              {data.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">No stats available</div>
              ) : (
                  data.map((item, rowIdx) => (
                      <div 
                          key={rowIdx} 
                          onClick={() => onRowClick && onRowClick(item)}
                          className={`flex border-b border-gray-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''} ${highlightRow && rowIdx === data.length - 1 ? 'bg-gray-50 font-bold' : ''}`}
                      >
                          {columns.map((col, colIdx) => (
                              <div 
                                  key={colIdx} 
                                  className={`py-3 px-3 text-sm text-gray-700 ${col.width || 'flex-1'} text-${col.align || 'left'} whitespace-nowrap`}
                              >
                                  {col.accessor(item)}
                              </div>
                          ))}
                      </div>
                  ))
              )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatTable;