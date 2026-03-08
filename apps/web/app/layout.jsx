import "./globals.css";

export const metadata = {
  title: "GC Suite",
  description: "GC/Sub/A-E friendly project management",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>

      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, Arial",
          backgroundColor: "#f8fafc",
        }}
      >
        {children}
      </body>
    </html>
  );
}