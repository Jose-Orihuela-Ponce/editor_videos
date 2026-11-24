import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AutomationRequest } from './production/job';
import './styles.css';

async function start() {
  const request = isTauri() ? await invoke<AutomationRequest | null>('automatic_job_request') : null;
  if (request) {
    const { runAutomationJob } = await import('./production/job');
    await runAutomationJob(request);
  } else {
    const { default: App } = await import('./App');
    ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
  }
}
void start().catch(error => {
  console.error(error);
  document.getElementById('root')!.textContent = String(error);
});
