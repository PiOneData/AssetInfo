import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // Legacy shadcn/ui colors
        background: "var(--background, #2F3A6E)",
        foreground: "var(--foreground, #F3F4F6)",
        card: {
          DEFAULT: "var(--card, #2B3563)",
          foreground: "var(--card-foreground, #F5F6FF)",
        },
        popover: {
          DEFAULT: "var(--popover, #2E396A)",
          foreground: "var(--popover-foreground, #F5F6FF)",
        },
        primary: {
          DEFAULT: "var(--primary, #4F46E5)",
          foreground: "var(--primary-foreground, #FFFFFF)",
        },
        secondary: {
          DEFAULT: "var(--secondary, #4E5C96)",
          foreground: "var(--secondary-foreground, #F5F6FF)",
        },
        muted: {
          DEFAULT: "var(--muted, rgba(255,255,255,0.18))",
          foreground: "var(--muted-foreground, rgba(255,255,255,0.55))",
        },
        accent: {
          DEFAULT: "var(--accent, #A7B4DA)",
          foreground: "var(--accent-foreground, #1E1F22)",
        },
        destructive: {
          DEFAULT: "var(--destructive, #D32F2F)",
          foreground: "var(--destructive-foreground, #FFFFFF)",
        },
        border: "var(--border, rgba(255,255,255,0.1))",
        input: "var(--input, rgba(0,0,0,0.15))",
        ring: "var(--ring, rgba(255,255,255,0.25))",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background, #262F59)",
          foreground: "var(--sidebar-foreground, #E1E6FF)",
          primary: "var(--sidebar-primary, #FFFFFF)",
          "primary-foreground": "var(--sidebar-primary-foreground, #1C2445)",
          accent: "var(--sidebar-accent, #3A4A85)",
          "accent-foreground": "var(--sidebar-accent-foreground, #FFFFFF)",
          border: "var(--sidebar-border, rgba(255,255,255,0.08))",
          ring: "var(--sidebar-ring, rgba(8,11,29,0.5))",
        },
        // Custom futuristic dark theme colors
        surface: {
          DEFAULT: "var(--bg-surface, #2F3A6E)",
          light: "var(--bg-surface-light, #344078)",
          lighter: "var(--bg-surface-lighter, #3E4C8E)",
        },
        text: {
          primary: "var(--text-primary, #F3F4F6)",
          secondary: "var(--text-secondary, #E0E4EB)",
          muted: "var(--text-muted, rgba(255,255,255,0.55))",
          inverse: "var(--text-inverse, #1E1F22)",
        },
        brand: {
          primary: "var(--color-primary, #4F46E5)",
          "primary-light": "var(--color-primary-light, #7F79F3)",
          "primary-dark": "var(--color-primary-dark, #3C34B8)",
          accent: "var(--color-accent, #A7B4DA)",
          "accent-light": "var(--color-accent-light, #C3CEE8)",
        },
        status: {
          success: "var(--color-success)",
          warning: "var(--color-warning)",
          danger: "var(--color-danger)",
          info: "var(--color-info)",
        },
        app_bg: "#2F3A6E",
        sidebar_bg: "#262F59",
        card_bg: "#2B3563",
        text_primary: "var(--text-primary, #F3F4F6)",
        text_secondary: "var(--text-secondary, #E0E4EB)",
      },
      backgroundImage: {
        "gradient-primary":
          "var(--gradient-primary, linear-gradient(135deg, #4F46E5 0%, #8EA1D5 100%))",
        "gradient-surface":
          "var(--gradient-surface, linear-gradient(180deg, #2F3A6E 0%, #252D52 90%))",
        "gradient-card":
          "var(--gradient-card, linear-gradient(135deg, rgba(94,102,136,0.95) 0%, rgba(110,118,155,0.9) 100%))",
        "gradient-glow":
          "var(--gradient-glow, radial-gradient(circle at 20% 20%, rgba(167,180,218,0.35) 0%, transparent 60%))",
        "gradient-accent":
          "var(--gradient-accent, linear-gradient(135deg, #A7B4DA 0%, #C3CEE8 100%))",
        "gradient-success":
          "var(--gradient-success, linear-gradient(135deg, #58D5C4 0%, #81E6D9 100%))",
        "gradient-warning":
          "var(--gradient-warning, linear-gradient(135deg, #FFB347 0%, #FFD27F 100%))",
        "gradient-danger":
          "var(--gradient-danger, linear-gradient(135deg, #F38BA0 0%, #F6A7B8 100%))",
      },
      boxShadow: {
        glow: "var(--shadow-glow, 0 0 24px rgba(0,0,0,0.25))",
        "glow-strong":
          "var(--shadow-glow-strong, 0 0 32px rgba(0,0,0,0.35))",
        card: "var(--shadow-card, 0 4px 16px rgba(0,0,0,0.18))",
        "card-hover":
          "var(--shadow-card-hover, 0 8px 24px rgba(0,0,0,0.22))",
        "inner-glow":
          "var(--shadow-inner, inset 0 1px 2px rgba(255,255,255,0.12))",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
        display: ["Poppins", "var(--font-sans)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(59, 130, 246, 0.3)" },
          "50%": { boxShadow: "0 0 30px rgba(59, 130, 246, 0.5)" },
        },
        "pulse-glow": {
          "0%, 100%": { 
            opacity: "1",
            boxShadow: "0 0 15px rgba(59, 130, 246, 0.4)"
          },
          "50%": { 
            opacity: "0.8",
            boxShadow: "0 0 25px rgba(59, 130, 246, 0.6)"
          },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        "gradient-halo": {
          "0%, 100%": { 
            opacity: "0.3",
            transform: "scale(1)"
          },
          "50%": { 
            opacity: "0.5",
            transform: "scale(1.05)"
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-up": "slide-up 0.5s ease-out",
        "slide-down": "slide-down 0.5s ease-out",
        "glow": "glow 2s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shimmer": "shimmer 3s linear infinite",
        "gradient-halo": "gradient-halo 8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
