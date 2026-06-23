import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initFrontendMonitoring } from './monitoring/client';
import { MonitoringErrorBoundary } from './monitoring/MonitoringErrorBoundary';

initFrontendMonitoring();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MonitoringErrorBoundary>
      <App />
    </MonitoringErrorBoundary>
  </React.StrictMode>
);
