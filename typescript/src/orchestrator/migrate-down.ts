#!/usr/bin/env node
import { runDispatch } from './dispatch.ts';

await runDispatch('down', process.argv.slice(2), import.meta.url);
