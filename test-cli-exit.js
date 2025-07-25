#!/usr/bin/env node

// Test script to verify CLI exits properly
// This simulates what happens in crontab

const { spawn } = require('child_process');

console.log('Testing CLI --listen command exit behavior...');

const startTime = Date.now();
const child = spawn('node', ['dist/index.js', 'tasks', '--listen'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  detached: false,
});

// Kill the process after 30 seconds if it doesn't exit naturally
const timeout = setTimeout(() => {
  console.log(
    '\n❌ FAIL: Process did not exit within 30 seconds, killing it...'
  );
  child.kill('SIGTERM');
  setTimeout(() => {
    child.kill('SIGKILL');
  }, 5000);
}, 30000);

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  const duration = Date.now() - startTime;
  console.log(
    `\n✅ SUCCESS: Process exited after ${duration}ms with code: ${code}, signal: ${signal}`
  );
});

child.on('error', (err) => {
  clearTimeout(timeout);
  console.log(`\n❌ ERROR: ${err.message}`);
});

// Handle our own exit to cleanup child process
process.on('SIGINT', () => {
  clearTimeout(timeout);
  child.kill('SIGTERM');
  process.exit(0);
});
