import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-muted-foreground tabular-nums">Error 404</p>
        <h1 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight">No encontramos esta página</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          Es posible que el enlace esté mal escrito o que la página ya no exista.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
