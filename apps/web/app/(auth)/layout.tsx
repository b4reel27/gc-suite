import "../globals.css";

export const metadata = {
  title: "GC Suite",
  description: "GC/Sub/A-E friendly project management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, Arial" }}>
        {children}
      </body>
    </html>
  );
}