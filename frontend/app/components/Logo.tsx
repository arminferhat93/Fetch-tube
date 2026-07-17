import React from 'react';

const FetchTubeLogo = ({ width = "100%", height = "100%", className = "" }) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 800 350"
            width={width}
            height={height}
            className={className}
            style={{ display: 'block' }}
        >
            <defs>
                {/* Style Block for Fonts & Drop Shadows */}
                <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;900&display=swap');
          .logo-text-main { 
            font-family: 'Inter', sans-serif; 
            font-weight: 900; 
            fill: #ffffff; 
            font-size: 64px; 
            letter-spacing: 2px; 
          }
          .logo-text-accent { 
            font-family: 'Inter', sans-serif; 
            font-weight: 900; 
            fill: #ff5241; 
            font-size: 64px; 
            letter-spacing: 2px; 
            filter: drop-shadow(0px 0px 10px rgba(255, 82, 65, 0.4)); 
          }
          .logo-text-sub { 
            font-family: 'Inter', sans-serif; 
            font-weight: 700; 
            fill: #a0a5b5; 
            font-size: 16px; 
            letter-spacing: 6px; 
          }
          .vortex-glow { 
            filter: drop-shadow(0px 0px 15px rgba(255, 82, 65, 0.5)); 
          }
        `}</style>

                {/* Vibrant Gradient matching oklch(57.7% 0.245 27.325) */}
                <linearGradient id="logoAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ff7360" />
                    <stop offset="100%" stop-color="#e63522" />
                </linearGradient>
            </defs>

            {/* Logo Mark Graphic */}
            <g transform="translate(180, 175)">
                {/* Dynamic Vortex Swirl */}
                <path
                    className="vortex-glow"
                    fill="url(#logoAccentGrad)"
                    d="M -20,-95 C 35,-95 85,-50 85,10 C 85,70 30,110 -30,110 C -80,110 -115,75 -115,25 C -115,-15 -85,-45 -55,-45 C -35,-45 -25,-30 -35,-15 C -45,0 -50,15 -50,30 C -50,55 -30,70 0,70 C 35,70 55,40 55,5 C 55,-35 15,-65 -20,-65 C -45,-65 -70,-50 -85,-30 C -95,-45 -80,-70 -55,-83 C -45,-88 -32,-95 -20,-95 Z"
                />

                {/* Subtle Play Icon */}
                <polygon fill="#ff5241" points="-15,-15 -15,15 12,0" opacity="0.3" />

                {/* Mini 'Y' Accent */}
                <text x="-68" y="12" font-family="'Inter', sans-serif" font-weight="900" font-size="28" fill="#ffffff" opacity="0.8">Y</text>

                {/* Bold White Download Arrow */}
                <g transform="translate(10, -5)">
                    <path
                        fill="#ffffff"
                        d="M 6,-55 L 34,-55 C 42,-55 48,-49 48,-41 L 48,0 L 72,0 C 81,0 86,11 80,17 L 31,66 C 27,70 21,70 17,66 L -32,17 C -38,11 -33,0 -24,0 L 0,0 L 0,-41 C 0,-49 6,-55 12,-55 Z"
                        filter="drop-shadow(0px 8px 16px rgba(0,0,0,0.4))"
                    />
                </g>
            </g>

            {/* Typography Block */}
            <g transform="translate(390, 180)">
                <text x="0" y="0">
                    <tspan className="logo-text-main">FETCH</tspan>
                    <tspan className="logo-text-accent">TUBE</tspan>
                </text>
                <text x="5" y="38" className="logo-text-sub">ULTRA FAST DOWNLOADER</text>
            </g>
        </svg>
    );
};

export default FetchTubeLogo;
