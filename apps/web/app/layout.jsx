import "./globals.css";
import SwRegistrar from "./SwRegistrar";

export const metadata = {
  title: "GC Suite",
  description: "GC/Sub/A-E friendly project management",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ colorScheme: "light", backgroundColor: "#f8fafc" }}>
      <head>
        <meta name="theme-color" content="#f8fafc" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <meta name="darkreader-lock" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>

      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, Arial",
          backgroundColor: "#f8fafc",
          colorScheme: "light",
        }}
      >
        {children}
        <SwRegistrar />
      </body>
    </html>
  );
}