import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Apuntan a los tokens de globals.css para que dark mode funcione solo.
      colors: {
        verde: {
          DEFAULT: "var(--verde)",
          hover: "var(--verde-hover)",
          claro: "var(--verde-claro)",
        },
        tinta: {
          DEFAULT: "var(--tinta)",
          2: "var(--tinta-2)",
          3: "var(--tinta-3)",
        },
        crema: "var(--card-2)",
        fondo: "var(--fondo)",
        card: { DEFAULT: "var(--card)", 2: "var(--card-2)", 3: "var(--card-3)" },
        linea: { DEFAULT: "var(--linea)", fuerte: "var(--linea-fuerte)" },
        alerta: { DEFAULT: "var(--alerta)", bg: "var(--alerta-bg)" },
        rojo: { DEFAULT: "var(--rojo)", bg: "var(--rojo-bg)" },
        info: { DEFAULT: "var(--info)", bg: "var(--info-bg)" },
        exito: { DEFAULT: "var(--exito)", bg: "var(--exito-bg)" },
        morado: "var(--morado)",
      },
      fontFamily: {
        display: ["var(--font-sora)", "Instrument Sans", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "Instrument Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "8px",
      },
      boxShadow: {
        card: "var(--shadow)",
        alta: "var(--shadow-alta)",
      },
    },
  },
  plugins: [],
};

export default config;
