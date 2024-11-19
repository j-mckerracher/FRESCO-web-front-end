import "@/styles/globals.css";
import "@/styles/spinner.css";
import type { AppProps } from "next/app";
import localFont from "next/font/local";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const microscan = localFont({
  src: "./fonts/Microscan-A.woff",
  variable: "--font-microscan",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${microscan.variable} min-h-dvh`}>
      <Component {...pageProps} />
    </main>
  );
}
