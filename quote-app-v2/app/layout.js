import "./globals.css";

export const metadata = {
  title: "Quote Tool",
  description: "Melbourne window & gutter cleaning quoting tool",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Quote Tool" },
};

export const viewport = {
  themeColor: "#1a1a18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
