const VARIANTS = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 focus-visible:outline-primary-600",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400",
  success: "bg-success-600 text-white hover:bg-success-700 focus-visible:outline-success-600",
  warning: "bg-warning-600 text-white hover:bg-warning-700 focus-visible:outline-warning-600",
  danger: "bg-danger-600 text-white hover:bg-danger-700 focus-visible:outline-danger-600",
  ghost: "bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white",
};

const SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
