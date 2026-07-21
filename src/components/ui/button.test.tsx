import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Button } from "./button";

it("submits when a form action is provided", () => {
  expect(renderToStaticMarkup(<Button formAction="/guest">Guest</Button>)).toContain('type="submit"');
});
