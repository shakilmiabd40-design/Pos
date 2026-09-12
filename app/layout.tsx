import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shoe Shop POS & ERP",
  description: "Sales, purchases, returns, damage, warranty and stock for a shoe shop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Set the dark/light class before React hydrates so there's no
            flash of the wrong theme on load. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();",
          }}
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
