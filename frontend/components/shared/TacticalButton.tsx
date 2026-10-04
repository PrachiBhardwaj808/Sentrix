import React from "react";
import { cn } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";

interface TacticalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "warning" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
}

export const TacticalButton: React.FC<TacticalButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  className,
  onClick,
  disabled,
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    if (variant === "danger") {
      tacticalSound.playWarning();
    } else {
      tacticalSound.playClick();
    }
    if (onClick) onClick(e);
  };

  const baseStyles =
    "relative inline-flex items-center justify-center font-mono font-medium uppercase tracking-widest transition-all select-none rounded-none border disabled:opacity-40 disabled:pointer-events-none";

  const sizeStyles = {
    sm: "text-[11px] px-3 py-1.5 gap-1.5",
    md: "text-xs px-4 py-2 gap-2",
    lg: "text-xs px-6 py-3 gap-2.5",
  }[size];

  const variantStyles = {
    primary:
      "bg-[#0284C7] text-white border-[#0284C7] hover:bg-[#0369A1] hover:border-[#0369A1] font-bold active:scale-[0.99] shadow-sm",
    secondary:
      "bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[#0369A1] border-[#CBDCEB] hover:border-[#94B8D7] font-bold",
    danger:
      "bg-[#DC2626] hover:bg-[#B91C1C] text-white border-[#DC2626] font-bold shadow-sm",
    warning:
      "bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#92400E] border-[#FCD34D] font-bold",
    outline:
      "bg-transparent hover:bg-[#E0F2FE] text-[#0284C7] border-[#0284C7] hover:border-[#0369A1]",
    ghost:
      "bg-transparent hover:bg-[#EBF3FA] text-[#475569] hover:text-[#0F172A] border-transparent",
  }[variant];

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className={cn(baseStyles, sizeStyles, variantStyles, className)}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};
