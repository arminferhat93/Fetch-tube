import { data } from "react-router";
import type { Route } from "./+types/$";

export function loader() {
  throw data("Not found", { status: 404 });
}

export default function Splat(_: Route.ComponentProps) {
  return null;
}
