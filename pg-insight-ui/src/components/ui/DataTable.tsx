import React from "react";
import { cn } from "@/lib/format";
import { EmptyState, LoadingState } from "./States";
import { useI18n } from "@/i18n";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T, idx: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T, idx: number) => string | number;
  loading?: boolean;
  emptyMsg?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyFn,
  loading,
  emptyMsg,
  emptyIcon,
  onRowClick,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const { t } = useI18n();
  if (loading) return <LoadingState />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyMsg ?? t("common.noData")}
        message={t("ui.emptyMessage")}
      />
    );
  }
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={keyFn(row, idx)}
              className={cn(
                onRowClick && "cursor-pointer",
                rowClassName?.(row),
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
