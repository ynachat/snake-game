
import "./globals.css";


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
	<html>
	    <body
        className=""
      >
        {children}
      </body>
	</html>
  
  );
}
