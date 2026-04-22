import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes.js";

export default function App() {
  useEffect(() => {
    document.title = "Pinchy! 🦞";
    document.documentElement.classList.add("dark");
  }, []);

  return <RouterProvider router={router} />;
}
