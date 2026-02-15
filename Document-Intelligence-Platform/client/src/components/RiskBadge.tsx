import { cn } from "@/lib/utils";

interface RiskBadgeProps {
  score: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function RiskBadge({ score, className, size = "md" }: RiskBadgeProps) {
  // Determine color based on risk score (0-100)
  // Higher score = Higher risk
  let variantClass = "bg-green-100 text-green-700 border-green-200";
  let label = "Low Risk";

  if (score > 75) {
    variantClass = "bg-red-100 text-red-700 border-red-200";
    label = "High Risk";
  } else if (score > 40) {
    variantClass = "bg-yellow-100 text-yellow-700 border-yellow-200";
    label = "Medium Risk";
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base font-medium",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        variantClass,
        sizeClasses[size],
        className
      )}
    >
      <span className={cn("mr-1.5 h-2 w-2 rounded-full", {
        "bg-green-600": score <= 40,
        "bg-yellow-600": score > 40 && score <= 75,
        "bg-red-600": score > 75,
      })} />
      {label} ({score})
    </div>
  );
}
