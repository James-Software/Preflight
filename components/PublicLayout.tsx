import Nav from "./Nav";
import Footer from "./Footer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-page">
      <Nav user={null} loadSession />
      {children}
      <Footer />
    </div>
  );
}
