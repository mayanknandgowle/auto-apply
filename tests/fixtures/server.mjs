import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
await build({ configFile:false, logLevel:'error', define:{ 'process.env.NODE_ENV':'"production"' }, build:{ outDir:'test-results/fixture-assets', emptyOutDir:false, lib:{ entry:'tests/fixtures/controlled.tsx', formats:['iife'], name:'Fixture', fileName:()=> 'controlled.js' } } });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4177');
  if (url.pathname === '/controlled.js') {
    res.setHeader('Content-Type','text/javascript'); res.end(await fs.readFile('test-results/fixture-assets/controlled.js')); return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(await fs.readFile(path.resolve('tests/fixtures/application.html'), 'utf8'));
});
server.listen(4177, '127.0.0.1', () => process.stdout.write('Synthetic application fixture: http://127.0.0.1:4177\n'));
