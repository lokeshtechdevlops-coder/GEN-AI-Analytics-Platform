import React from 'react';

interface NeovaticLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const NeovaticLogo: React.FC<NeovaticLogoProps> = ({
  className = '',
  size = 32,
  showText = true,
}) => {
  return (
    <div className={`flex items-center gap-2 sm:gap-3 select-none ${className}`}>
      {/* Brand Mark: Dark squircle with white 'N' and primary blue accent dot */}
      <div
        className="relative shrink-0 flex items-center justify-center rounded-[8px] sm:rounded-[9px] bg-[#0F172A] shadow-sm overflow-hidden"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <svg
          viewBox="0 0 40 40"
          className="w-full h-full p-1"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Letter N */}
          <path
            d="M11 29V11H15.5L24.5 24.5V11H29V29H24.5L15.5 15.5V29H11Z"
            fill="#FFFFFF"
          />
          {/* Blue Accent Dot at top right */}
          <circle
            cx="32"
            cy="11"
            r="3.5"
            fill="#2563EB"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col text-left min-w-0">
          <span className="font-headline-sm text-[15px] sm:text-[17px] leading-tight tracking-tight text-[#0F172A] font-semibold truncate">
            NEOVATIC GEN-AI ANALYTICS PLATFORM
          </span>
          <span className="hidden xs:inline-block font-label-sm text-[9px] sm:text-[10px] leading-tight text-[#64748B] uppercase tracking-wider font-semibold truncate">
            SAP HANA & AI CORE
          </span>
        </div>
      )}
    </div>
  );
};
