import * as React from "react";
import * as Server from "react-dom/server";
import { Greet } from "./greet";

console.log(Server.renderToString(<Greet />));
