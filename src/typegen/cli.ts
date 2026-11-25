#!/usr/bin/env node
import { runTypegen } from "./command.js";

process.exitCode = await runTypegen(process.argv.slice(2), process.env);
