/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1440px",
      },
    },
    extend: {
      colors: {
        border: "#d7e0eb",
        input: "#ffffff",
        ring: "#2f6fe4",
        background: "#f4f7fb",
        foreground: "#172338",
        primary: {
          DEFAULT: "#2563eb",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#eef3f9",
          foreground: "#1c2b43",
        },
        muted: {
          DEFAULT: "#f4f7fb",
          foreground: "#58687f",
        },
        accent: {
          DEFAULT: "#e7eef7",
          foreground: "#172338",
        },
        destructive: {
          DEFAULT: "#d1435b",
          foreground: "#ffffff",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#172338",
        },
        popover: {
          DEFAULT: "#ffffff",
          foreground: "#172338",
        },
        success: "#2d9d63",
        warning: "#c68510",
      },
      borderRadius: {
        xl: "1rem",
        lg: "0.875rem",
        md: "0.75rem",
        sm: "0.625rem",
      },
      boxShadow: {
        shell: "0 18px 50px rgba(73, 96, 129, 0.12)",
        card: "0 10px 24px rgba(73, 96, 129, 0.09)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.24s ease-out",
      },
    },
  },
  plugins: [],
};
