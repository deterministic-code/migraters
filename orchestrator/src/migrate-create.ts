#!/usr/bin/env node
import { runDispatch } from './dispatch.ts';

await runDispatch('create', process.argv.slice(2), import.meta.url);
