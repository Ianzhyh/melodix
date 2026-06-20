import React from 'react';
import ReactDOM from 'react-dom/client';
import { TrayMenu } from './components/TrayMenu';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TrayMenu />
  </React.StrictMode>
);
