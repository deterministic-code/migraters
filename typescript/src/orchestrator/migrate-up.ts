#!/usr/bin/env node
import { runDispatch } from './dispatch.ts';

await runDispatch('up', process.argv.slice(2), import.meta.url);
