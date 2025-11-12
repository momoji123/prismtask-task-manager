// app.js
// Main application entry point.
// Initializes the database and the central UI module.

import { DB } from './storage.js';
import { UI } from './ui.js';
import { pywebviewReady } from './apiService.js';

// Ensure the DOM is fully loaded before initializing the UI
window.addEventListener('DOMContentLoaded', async function main(){
  // Small compatibility guard for IndexedDB
  if(!('indexedDB' in window)){
    document.getElementById('app').innerHTML = '<div style="padding:20px;color:#900">IndexedDB not available in this browser.</div>';
    return;
  }
  
  // Wait for pywebview to be ready
  await pywebviewReady;

  // Ensure DB opens. This also ensures the latest DB schema (with milestones) is applied.
  await DB.putMeta('init','ok').catch(()=>{}); // A simple way to trigger DB initialization/upgrade

  // Initialize the main UI module
  await UI.init();
});

