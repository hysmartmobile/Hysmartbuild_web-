import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import App from './App';import './styles.css';
import { applyTheme, getTheme } from './lib/theme';
applyTheme(getTheme(), { persist: false });
import { flushOfflineMutations } from './lib/sync';
window.addEventListener('online',()=>flushOfflineMutations().catch(()=>{}));
window.addEventListener('load',()=>flushOfflineMutations().catch(()=>{}));
setInterval(()=>flushOfflineMutations().catch(()=>{}),15000);
if('serviceWorker' in navigator && import.meta.env.PROD){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
